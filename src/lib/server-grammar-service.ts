import { deepseek } from "@/lib/deepseek";
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

function parseJsonObject(content: string) {
    try {
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

async function callDeepseekJson(prompt: string, model: string) {
    const completion = await deepseek.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model,
        response_format: { type: "json_object" },
        temperature: 0.2,
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

async function runBasicInference(paragraphText: string) {
    const firstRaw = await callDeepseekJson(
        buildGrammarBasicPrompt(paragraphText),
        GRAMMAR_BASIC_MODEL,
    );
    const first = sanitizeGrammarBasicPayload(firstRaw, paragraphText);
    if (!first.retryRecommended) {
        return first;
    }

    const secondRaw = await callDeepseekJson(
        buildGrammarBasicPrompt(paragraphText, first.issues.slice(0, 8)),
        GRAMMAR_BASIC_MODEL,
    );
    const second = sanitizeGrammarBasicPayload(secondRaw, paragraphText);
    if (!second.retryRecommended) {
        return second;
    }

    const best = second.data.difficult_sentences.length >= first.data.difficult_sentences.length ? second : first;
    return {
        ...best,
        issues: [...new Set([...first.issues, ...second.issues])],
    };
}

async function runDeepSentenceInference(sentence: string) {
    const firstRaw = await callDeepseekJson(
        buildGrammarDeepPrompt(sentence),
        GRAMMAR_DEEP_MODEL,
    );
    const first = sanitizeGrammarDeepSentencePayload(firstRaw, sentence);
    if (!first.retryRecommended) {
        return first;
    }

    const secondRaw = await callDeepseekJson(
        buildGrammarDeepPrompt(sentence, first.issues.slice(0, 8)),
        GRAMMAR_DEEP_MODEL,
    );
    const second = sanitizeGrammarDeepSentencePayload(secondRaw, sentence);
    if (!second.retryRecommended) {
        return second;
    }

    const best = second.data.analysis_results.length >= first.data.analysis_results.length ? second : first;
    return {
        ...best,
        issues: [...new Set([...first.issues, ...second.issues])],
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

    const cacheKey = buildGrammarCacheKey({
        text: normalizedText,
        mode: "basic",
        promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
        model: GRAMMAR_BASIC_MODEL,
    });

    const cacheMetaBase: Omit<GrammarCachedMeta, "hit" | "layer"> = {
        key: cacheKey,
        mode: "basic",
        promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
        model: GRAMMAR_BASIC_MODEL,
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
        const parsed = await runBasicInference(normalizedText);
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
        model: GRAMMAR_DEEP_MODEL,
    });

    const resultByIdentity = new Map<string, GrammarDeepSentenceResult>();
    const cacheHitsByIdentity = new Set<string>();

    const misses: Array<{ sentence: string; cacheKey: string }> = [];
    targetSentences.forEach((sentence) => {
        const sentenceKey = buildGrammarCacheKey({
            text: sentence,
            mode: "deep",
            promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
            model: GRAMMAR_DEEP_MODEL,
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
                const parsed = await runDeepSentenceInference(miss.sentence);
                const sanitized = parsed.data;
                setServerGrammarCache(miss.cacheKey, sanitized);
                resultByIdentity.set(id, sanitized);
                if (parsed.retryRecommended) partialFailures += 1;
            } catch (sentenceError) {
                partialFailures += 1;
                console.error("[grammar][deep] sentence failed", sentenceError);
                const fallback = sanitizeGrammarDeepSentencePayload({}, miss.sentence).data;
                setServerGrammarCache(miss.cacheKey, fallback);
                resultByIdentity.set(id, fallback);
            }
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
                    model: GRAMMAR_DEEP_MODEL,
                    sentenceHits: targetSentences.length - misses.length,
                    sentenceMisses: misses.length,
                },
                readingCoins: readingCoinMutationPayload(charged),
            },
        };
    } catch (error) {
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
