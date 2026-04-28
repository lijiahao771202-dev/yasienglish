import {
    createDeepSeekClientForCurrentUser,
    getCurrentAiExecutionFingerprintForCurrentUser,
    type OpenAiCompatibleClient,
} from "@/lib/deepseek";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    rewardReadingCoins,
    type ReadingEconomyContext,
    type ReadingCoinMutationResult,
} from "@/lib/reading-economy-server";
import {
    buildGrammarBasicPrompt,
    buildGrammarCacheKey,
    buildGrammarDeepPrompt,
    GRAMMAR_BASIC_MODEL,
    GRAMMAR_BASIC_PROMPT_VERSION,
    GRAMMAR_DEEP_MODEL,
    GRAMMAR_DEEP_PROMPT_VERSION,
    normalizeGrammarText,
    sanitizeGrammarBasicPayload,
    sanitizeGrammarDeepSentencePayload,
    sentenceIdentity,
    splitGrammarSentences,
    type GrammarBasicResult,
    type GrammarSanitizeResult,
    type GrammarDeepResult,
    type GrammarDeepSentenceResult,
} from "@/lib/grammar-analysis";
import { getServerGrammarCache, setServerGrammarCache } from "@/lib/server-grammar-cache";

interface GrammarServiceResult {
    status: number;
    body: Record<string, unknown>;
}

interface GrammarCommonRequest {
    text?: string;
    economyContext?: ReadingEconomyContext;
    forceRegenerate?: boolean;
}

interface GrammarBasicRequest extends GrammarCommonRequest {
    mode?: "basic";
}

interface GrammarDeepRequest extends GrammarCommonRequest {
    mode?: "deep";
    sentence?: string;
}

interface GrammarCachedMeta {
    key: string;
    hit: boolean;
    layer: "server" | "miss";
    mode: "basic" | "deep";
    promptVersion: string;
    model: string;
}

const LOW_QUALITY_GRAMMAR_ANALYSIS = "LOW_QUALITY_GRAMMAR_ANALYSIS";
const MAX_GRAMMAR_ATTEMPTS = 3;
const AI_PROVIDER_RATE_LIMITED = "AI_PROVIDER_RATE_LIMITED";

function parseJsonObject(content: string) {
    try {
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function getProviderErrorDetails(error: unknown) {
    const candidate = error as {
        status?: number;
        headers?: Headers;
        message?: string;
    } | null;
    const status = typeof candidate?.status === "number" ? candidate.status : undefined;
    const retryAfterHeader = candidate?.headers?.get?.("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;

    return {
        status,
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
        message: candidate?.message || "AI provider request failed",
    };
}

async function callDeepseekJson(client: OpenAiCompatibleClient, prompt: string, model: string) {
    const completion = await client.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model,
        response_format: { type: "json_object" },
        temperature: 0.1,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
        throw new Error("No content received from AI");
    }
    return parseJsonObject(content);
}

function buildReadContext(economyContext: ReadingEconomyContext | undefined, fallbackAction: "grammar_basic" | "grammar_deep") {
    if (!isReadEconomyContext(economyContext)) return null;
    return {
        ...economyContext,
        action: fallbackAction,
    } as const;
}

async function refundIfNeeded(params: {
    charged: ReadingCoinMutationResult | null;
    action: "grammar_basic" | "grammar_deep";
    reason: string;
    cacheKey: string;
}) {
    const charged = params.charged;
    if (!charged || !charged.applied || charged.delta >= 0) return;

    const refundDelta = Math.abs(charged.delta);
    if (refundDelta <= 0) return;

    const refundKeyBase = charged.ledgerId ?? charged.dedupeKey ?? params.cacheKey;
    try {
        await rewardReadingCoins({
            action: params.action,
            delta: refundDelta,
            dedupeKey: `${refundKeyBase}:refund`,
            meta: {
                from: "server-grammar-service",
                reason: params.reason,
                relatedLedgerId: charged.ledgerId ?? null,
            },
        });
    } catch (refundError) {
        console.error("[grammar] failed to refund reading coins", refundError);
    }
}

async function runBasicInference(client: OpenAiCompatibleClient, paragraphText: string) {
    const attempts: Array<GrammarSanitizeResult<GrammarBasicResult>> = [];
    let repairHints: string[] = [];

    for (let attempt = 0; attempt < MAX_GRAMMAR_ATTEMPTS; attempt += 1) {
        const raw = await callDeepseekJson(
            client,
            buildGrammarBasicPrompt(paragraphText, repairHints),
            GRAMMAR_BASIC_MODEL,
        );
        const current = sanitizeGrammarBasicPayload(raw, paragraphText);
        attempts.push(current);
        if (!current.retryRecommended) {
            return current;
        }
        repairHints = current.issues.slice(0, 8);
    }

    const best = attempts.reduce((winner, current) => {
        if (!winner) return current;
        if (current.qualityScore !== winner.qualityScore) {
            return current.qualityScore > winner.qualityScore ? current : winner;
        }
        return current.data.difficult_sentences.length >= winner.data.difficult_sentences.length ? current : winner;
    }, attempts[0]);

    return {
        ...best,
        issues: Array.from(new Set(attempts.flatMap((attempt) => attempt.issues))),
        qualityScore: Math.max(...attempts.map((attempt) => attempt.qualityScore)),
    };
}

async function runDeepSentenceInference(client: OpenAiCompatibleClient, sentence: string) {
    const attempts: Array<GrammarSanitizeResult<GrammarDeepSentenceResult>> = [];
    let repairHints: string[] = [];

    for (let attempt = 0; attempt < MAX_GRAMMAR_ATTEMPTS; attempt += 1) {
        const raw = await callDeepseekJson(
            client,
            buildGrammarDeepPrompt(sentence, repairHints),
            GRAMMAR_DEEP_MODEL,
        );
        const current = sanitizeGrammarDeepSentencePayload(raw, sentence);
        attempts.push(current);
        if (!current.retryRecommended) {
            return current;
        }
        repairHints = current.issues.slice(0, 8);
    }

    const best = attempts.reduce((winner, current) => {
        if (!winner) return current;
        if (current.qualityScore !== winner.qualityScore) {
            return current.qualityScore > winner.qualityScore ? current : winner;
        }
        return current.data.analysis_results.length >= winner.data.analysis_results.length ? current : winner;
    }, attempts[0]);

    return {
        ...best,
        issues: Array.from(new Set(attempts.flatMap((attempt) => attempt.issues))),
        qualityScore: Math.max(...attempts.map((attempt) => attempt.qualityScore)),
    };
}

function readingCoinMutationPayload(charge: ReadingCoinMutationResult | null) {
    if (!charge) return null;
    return {
        balance: charge.balance,
        delta: charge.delta,
        applied: charge.applied,
        action: charge.action,
    };
}

export async function runBasicGrammarService(input: GrammarBasicRequest): Promise<GrammarServiceResult> {
    const normalizedText = normalizeGrammarText(input.text ?? "");
    if (!normalizedText) {
        return {
            status: 400,
            body: { error: "Text is required" },
        };
    }

    const client = await createDeepSeekClientForCurrentUser();
    const execution = await getCurrentAiExecutionFingerprintForCurrentUser(GRAMMAR_BASIC_MODEL);
    const cacheKey = buildGrammarCacheKey({
        text: normalizedText,
        mode: "basic",
        promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
        model: execution.cacheSignature,
    });

    const cacheMetaBase: Omit<GrammarCachedMeta, "hit" | "layer"> = {
        key: cacheKey,
        mode: "basic",
        promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
        model: execution.model,
    };

    if (!input.forceRegenerate) {
        const cached = getServerGrammarCache<GrammarBasicResult>(cacheKey);
        if (cached) {
            return {
                status: 200,
                body: {
                    ...cached,
                    cache: { ...cacheMetaBase, hit: true, layer: "server" as const },
                    readingCoins: null,
                },
            };
        }
    }

    const readContext = buildReadContext(input.economyContext, "grammar_basic");
    let charged: ReadingCoinMutationResult | null = null;
    if (readContext?.action) {
        const charge = await chargeReadingCoins({
            action: readContext.action,
            dedupeKey: readContext.dedupeKey,
            meta: {
                articleUrl: readContext.articleUrl ?? null,
                mode: "basic",
                promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
                cacheKey,
                from: "api/ai/grammar/basic",
            },
        });
        if (!charge.ok && charge.insufficient) {
            return {
                status: 402,
                body: insufficientReadingCoinsPayload(readContext.action, charge.required ?? 2, charge.balance),
            };
        }
        charged = charge;
    }

    try {
        const parsed = await runBasicInference(client, normalizedText);
        if (parsed.retryRecommended) {
            await refundIfNeeded({
                charged,
                action: "grammar_basic",
                reason: "basic_inference_low_quality",
                cacheKey,
            });
            return {
                status: 502,
                body: {
                    error: "Grammar analysis was incomplete. Please retry.",
                    errorCode: LOW_QUALITY_GRAMMAR_ANALYSIS,
                    issues: parsed.issues,
                },
            };
        }
        setServerGrammarCache(cacheKey, parsed.data);

        return {
            status: 200,
            body: {
                ...parsed.data,
                issues: parsed.issues,
                cache: { ...cacheMetaBase, hit: false, layer: "miss" as const },
                readingCoins: readingCoinMutationPayload(charged),
            },
        };
    } catch (error) {
        const providerError = getProviderErrorDetails(error);
        if (providerError.status === 429) {
            await refundIfNeeded({
                charged,
                action: "grammar_basic",
                reason: "basic_inference_rate_limited",
                cacheKey,
            });
            return {
                status: 429,
                body: {
                    error: "当前全局模型请求过于频繁，请稍后重试。",
                    errorCode: AI_PROVIDER_RATE_LIMITED,
                    retryAfter: providerError.retryAfterSeconds ?? null,
                    details: providerError.message,
                },
            };
        }
        await refundIfNeeded({
            charged,
            action: "grammar_basic",
            reason: "basic_inference_failed",
            cacheKey,
        });
        console.error("Grammar Basic Analysis Error:", error);
        return {
            status: 500,
            body: { error: "Failed to analyze grammar" },
        };
    }
}

function dedupeSentences(sentences: string[]) {
    const seen = new Set<string>();
    const output: string[] = [];
    sentences.forEach((sentence) => {
        const normalized = sentenceIdentity(sentence);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        output.push(sentence);
    });
    return output;
}

export async function runDeepGrammarService(input: GrammarDeepRequest): Promise<GrammarServiceResult> {
    const normalizedText = normalizeGrammarText(input.text ?? "");
    if (!normalizedText) {
        return {
            status: 400,
            body: { error: "Text is required" },
        };
    }

    const client = await createDeepSeekClientForCurrentUser();
    const execution = await getCurrentAiExecutionFingerprintForCurrentUser(GRAMMAR_DEEP_MODEL);
    const requestedSentence = normalizeGrammarText(input.sentence ?? "");
    const sourceSentences = requestedSentence
        ? [requestedSentence]
        : splitGrammarSentences(normalizedText);
    const targetSentences = dedupeSentences(sourceSentences);

    if (targetSentences.length === 0) {
        return {
            status: 400,
            body: { error: "No valid sentence to analyze" },
        };
    }

    const paragraphCacheKey = buildGrammarCacheKey({
        text: normalizedText,
        mode: "deep",
        promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
        model: execution.cacheSignature,
    });

    const resultByIdentity = new Map<string, GrammarDeepSentenceResult>();
    const cacheHitsByIdentity = new Set<string>();

    const misses: Array<{ sentence: string; cacheKey: string }> = [];
    targetSentences.forEach((sentence) => {
        const sentenceKey = buildGrammarCacheKey({
            text: sentence,
            mode: "deep",
            promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
            model: `${execution.cacheSignature}:sentence`,
        });
        const id = sentenceIdentity(sentence);

        if (!input.forceRegenerate) {
            const cached = getServerGrammarCache<GrammarDeepSentenceResult>(sentenceKey);
            if (cached) {
                resultByIdentity.set(id, cached);
                cacheHitsByIdentity.add(id);
                return;
            }
        }

        misses.push({ sentence, cacheKey: sentenceKey });
    });

    const readContext = buildReadContext(input.economyContext, "grammar_deep");
    let charged: ReadingCoinMutationResult | null = null;
    if (misses.length > 0 && readContext?.action) {
        const charge = await chargeReadingCoins({
            action: readContext.action,
            dedupeKey: readContext.dedupeKey,
            meta: {
                articleUrl: readContext.articleUrl ?? null,
                mode: "deep",
                promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
                sentenceCount: targetSentences.length,
                missCount: misses.length,
                cacheKey: paragraphCacheKey,
                from: "api/ai/grammar/deep",
            },
        });
        if (!charge.ok && charge.insufficient) {
            return {
                status: 402,
                body: insufficientReadingCoinsPayload(readContext.action, charge.required ?? 3, charge.balance),
            };
        }
        charged = charge;
    }

    let partialFailures = 0;
    try {
        for (const miss of misses) {
            const id = sentenceIdentity(miss.sentence);
            try {
                const parsed = await runDeepSentenceInference(client, miss.sentence);
                if (parsed.retryRecommended) {
                    partialFailures += 1;
                    continue;
                }
                const sanitized = parsed.data;
                setServerGrammarCache(miss.cacheKey, sanitized);
                resultByIdentity.set(id, sanitized);
            } catch (sentenceError) {
                partialFailures += 1;
                console.error("[grammar][deep] sentence failed", sentenceError);
            }
        }

        if (partialFailures > 0 && targetSentences.length === 1) {
            await refundIfNeeded({
                charged,
                action: "grammar_deep",
                reason: "deep_inference_low_quality",
                cacheKey: paragraphCacheKey,
            });
            return {
                status: 502,
                body: {
                    error: "Deep grammar analysis was incomplete. Please retry.",
                    errorCode: LOW_QUALITY_GRAMMAR_ANALYSIS,
                },
            };
        }

        const orderedSentences = targetSentences
            .map((sentence) => resultByIdentity.get(sentenceIdentity(sentence)))
            .filter((item): item is GrammarDeepSentenceResult => Boolean(item));

        const payload: GrammarDeepResult = {
            mode: "deep",
            difficult_sentences: orderedSentences,
            partial_failures: partialFailures,
        };

        return {
            status: 200,
            body: {
                ...payload,
                cache: {
                    key: paragraphCacheKey,
                    hit: misses.length === 0,
                    layer: misses.length === 0 ? "server" : "miss",
                    mode: "deep",
                    promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
                    model: execution.model,
                    sentenceHits: targetSentences.length - misses.length,
                    sentenceMisses: misses.length,
                },
                readingCoins: readingCoinMutationPayload(charged),
            },
        };
    } catch (error) {
        const providerError = getProviderErrorDetails(error);
        if (providerError.status === 429) {
            await refundIfNeeded({
                charged,
                action: "grammar_deep",
                reason: "deep_inference_rate_limited",
                cacheKey: paragraphCacheKey,
            });
            return {
                status: 429,
                body: {
                    error: "当前全局模型请求过于频繁，请稍后重试。",
                    errorCode: AI_PROVIDER_RATE_LIMITED,
                    retryAfter: providerError.retryAfterSeconds ?? null,
                    details: providerError.message,
                },
            };
        }
        await refundIfNeeded({
            charged,
            action: "grammar_deep",
            reason: "deep_inference_failed",
            cacheKey: paragraphCacheKey,
        });
        console.error("Grammar Deep Analysis Error:", error);
        return {
            status: 500,
            body: { error: "Failed to analyze grammar deeply" },
        };
    }
}
