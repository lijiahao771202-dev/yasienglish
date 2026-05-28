import {
    createDeepSeekClientForCurrentUserWithoutThinking,
    getCurrentAiExecutionFingerprintForCurrentUserWithoutThinking,
    type OpenAiCompatibleClient,
} from "@/lib/deepseek";
import { parseJsonObjectFromAi } from "@/lib/ai-json";
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
    GRAMMAR_BASIC_MODEL,
    GRAMMAR_BASIC_PROMPT_VERSION,
    type GrammarRepairCategory,
    hasUsableBasicGrammarResult,
    normalizeGrammarSentenceList,
    normalizeGrammarText,
    sanitizeGrammarBasicPayload,
    type GrammarBasicResult,
    type GrammarBasicSentence,
    type GrammarSanitizeResult,
} from "@/lib/grammar-analysis";
import { getServerGrammarCache, setServerGrammarCache } from "@/lib/server-grammar-cache";

interface GrammarServiceResult {
    status: number;
    body: Record<string, unknown>;
}

interface GrammarCommonRequest {
    text?: string;
    sentences?: string[];
    economyContext?: ReadingEconomyContext;
    forceRegenerate?: boolean;
}

interface GrammarBasicRequest extends GrammarCommonRequest {
    mode?: "basic";
}

interface GrammarCachedMeta {
    key: string;
    hit: boolean;
    layer: "server" | "miss";
    mode: "basic";
    promptVersion: string;
    model: string;
}

interface SentenceWorkItem {
    sentence: string;
    cacheKey: string;
    aliasCacheKey: string;
}

interface GrammarSentenceResultPayload {
    sentence: string;
    cacheKey: string;
    data: GrammarBasicResult;
    issues: string[];
    retryRecommended: boolean;
    qualityScore: number;
    cache: GrammarCachedMeta;
    repairAttempted: boolean;
    repairAttempts: number;
    error?: string;
}

const LOW_QUALITY_GRAMMAR_ANALYSIS = "LOW_QUALITY_GRAMMAR_ANALYSIS";
const AI_PROVIDER_RATE_LIMITED = "AI_PROVIDER_RATE_LIMITED";
const GRAMMAR_REPAIR_ATTEMPT_LIMIT = 1;
const GRAMMAR_BATCH_SIZE = 2;

function buildGrammarAliasText(text: string) {
    return normalizeGrammarText(text)
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/[“”]/g, "\"")
        .replace(/[‘’]/g, "'")
        .replace(/[—–]/g, "-")
        .replace(/\s*([,.;:!?])/g, "$1")
        .trim();
}

function buildGrammarAliasCacheKey(params: {
    text: string;
    mode: "basic";
    promptVersion: string;
    model: string;
}) {
    return buildGrammarCacheKey({
        ...params,
        text: buildGrammarAliasText(params.text),
    });
}

function parseJsonObject(content: string) {
    return parseJsonObjectFromAi(content);
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

function buildReadContext(economyContext: ReadingEconomyContext | undefined, fallbackAction: "grammar_basic") {
    if (!isReadEconomyContext(economyContext)) return null;
    return {
        ...economyContext,
        action: fallbackAction,
    } as const;
}

async function refundIfNeeded(params: {
    charged: ReadingCoinMutationResult | null;
    action: "grammar_basic";
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

function buildRepairHints(issues: string[]) {
    return Array.from(new Set(
        issues
            .map((issue) => issue.trim())
            .filter(Boolean),
    )).slice(0, 12);
}

function buildRepairCategories(issues: string[]): GrammarRepairCategory[] {
    const categories = new Set<GrammarRepairCategory>();

    for (const issue of issues) {
        if (issue.includes("translation is missing")) {
            categories.add("missing_translation");
        }
        if (issue.includes("has no valid highlights") || issue.includes("no valid highlights")) {
            categories.add("missing_highlights");
        }
        if (issue.includes("chunking is too coarse")) {
            categories.add("coarse_chunking");
        }
    }

    return Array.from(categories);
}

function sanitizeSentenceFromBatch(result: GrammarSanitizeResult<GrammarBasicResult>, sentence: string) {
    const matched = result.data.difficult_sentences.find((item) => normalizeGrammarText(item.sentence) === normalizeGrammarText(sentence));
    const sentenceData: GrammarBasicSentence = matched ?? {
        sentence,
        translation: "",
        highlights: [],
    };

    const sentenceResult = sanitizeGrammarBasicPayload({
        tags: result.data.tags,
        overview: result.data.overview,
        sentences: [sentenceData],
    }, [sentence]);

    return sentenceResult;
}

function sentenceNeedsRepair(result: GrammarSanitizeResult<GrammarBasicResult>) {
    const sentence = result.data.difficult_sentences[0];
    if (!sentence) return true;
    return !sentence.translation.trim()
        || sentence.highlights.length === 0
        || result.issues.some((issue) => issue.includes("chunking is too coarse"));
}

async function runBasicInference(client: OpenAiCompatibleClient, sentences: string[]) {
    const raw = await callDeepseekJson(
        client,
        buildGrammarBasicPrompt(sentences),
        GRAMMAR_BASIC_MODEL,
    );
    return sanitizeGrammarBasicPayload(raw, sentences);
}

async function runBasicRepairInference(
    client: OpenAiCompatibleClient,
    sentences: string[],
    repairCategories: GrammarRepairCategory[],
    repairHints: string[],
    existingAnalyses: GrammarBasicSentence[] = [],
) {
    const raw = await callDeepseekJson(
        client,
        buildGrammarBasicPrompt(sentences, {
            repairCategories,
            repairHints,
            patchMode: true,
            existingAnalyses,
        }),
        GRAMMAR_BASIC_MODEL,
    );
    return sanitizeGrammarBasicPayload(raw, sentences);
}

function mergeSentenceResult(params: {
    sentence: string;
    initial: GrammarSanitizeResult<GrammarBasicResult>;
    repaired?: GrammarSanitizeResult<GrammarBasicResult> | null;
}) {
    const base = sanitizeSentenceFromBatch(params.initial, params.sentence);
    if (!params.repaired) return base;

    const candidate = sanitizeSentenceFromBatch(params.repaired, params.sentence);
    if (
        hasUsableBasicGrammarResult(candidate.data)
        || (!hasUsableBasicGrammarResult(base.data) && candidate.qualityScore >= base.qualityScore)
        || candidate.qualityScore > base.qualityScore
    ) {
        return candidate;
    }
    return base;
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

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

function normalizeRequestSentences(input: GrammarBasicRequest) {
    const directSentences = Array.isArray(input.sentences)
        ? input.sentences
        : [];
    const normalized = normalizeGrammarSentenceList(directSentences.length > 0 ? directSentences : (input.text ?? ""));
    return uniqueStrings(normalized);
}

function chunkItems<T>(items: T[], batchSize: number) {
    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += batchSize) {
        batches.push(items.slice(index, index + batchSize));
    }
    return batches;
}

export async function runBasicGrammarService(input: GrammarBasicRequest): Promise<GrammarServiceResult> {
    const sentences = normalizeRequestSentences(input);
    if (sentences.length === 0) {
        return {
            status: 400,
            body: { error: "At least one sentence is required" },
        };
    }

    const client = await createDeepSeekClientForCurrentUserWithoutThinking();
    const execution = await getCurrentAiExecutionFingerprintForCurrentUserWithoutThinking(GRAMMAR_BASIC_MODEL);
    const promptVersion = GRAMMAR_BASIC_PROMPT_VERSION;

    const workItems: SentenceWorkItem[] = sentences.map((sentence) => ({
        sentence,
        cacheKey: buildGrammarCacheKey({
            text: sentence,
            mode: "basic",
            promptVersion,
            model: execution.cacheSignature,
        }),
        aliasCacheKey: buildGrammarAliasCacheKey({
            text: sentence,
            mode: "basic",
            promptVersion,
            model: execution.cacheSignature,
        }),
    }));

    const cachedResults = new Map<string, GrammarSentenceResultPayload>();
    const misses: SentenceWorkItem[] = [];

    for (const item of workItems) {
        const cacheMetaBase: Omit<GrammarCachedMeta, "hit" | "layer"> = {
            key: item.cacheKey,
            mode: "basic",
            promptVersion,
            model: execution.model,
        };

        if (!input.forceRegenerate) {
            const exactCached = getServerGrammarCache<GrammarBasicResult>(item.cacheKey);
            const aliasCached = exactCached ? null : (item.aliasCacheKey !== item.cacheKey
                ? getServerGrammarCache<GrammarBasicResult>(item.aliasCacheKey)
                : null);
            const cachedPayload = exactCached ?? aliasCached;
            if (cachedPayload) {
                if (!exactCached && aliasCached) {
                    setServerGrammarCache(item.cacheKey, aliasCached);
                }
                const matchedSentence = cachedPayload.difficult_sentences.find((entry) => buildGrammarAliasText(entry.sentence) === buildGrammarAliasText(item.sentence));
                const normalizedPayload = {
                    tags: cachedPayload.tags,
                    overview: cachedPayload.overview,
                    difficult_sentences: [
                        matchedSentence ?? {
                            sentence: item.sentence,
                            translation: "",
                            highlights: [],
                        },
                    ],
                };
                const sanitized = sanitizeGrammarBasicPayload(normalizedPayload, [item.sentence]);
                cachedResults.set(item.sentence, {
                    sentence: item.sentence,
                    cacheKey: item.cacheKey,
                    data: sanitized.data,
                    issues: sanitized.issues,
                    retryRecommended: sanitized.retryRecommended,
                    qualityScore: sanitized.qualityScore,
                    cache: { ...cacheMetaBase, hit: true, layer: "server" as const },
                    repairAttempted: false,
                    repairAttempts: 0,
                });
                continue;
            }
        }

        misses.push(item);
    }

    const readContext = buildReadContext(input.economyContext, "grammar_basic");
    let charged: ReadingCoinMutationResult | null = null;
    if (misses.length > 0 && readContext?.action) {
        const charge = await chargeReadingCoins({
            action: readContext.action,
            dedupeKey: readContext.dedupeKey,
            meta: {
                articleUrl: readContext.articleUrl ?? null,
                mode: "basic",
                promptVersion,
                cacheKey: misses[0]?.cacheKey ?? workItems[0]?.cacheKey ?? "grammar",
                sentenceCount: sentences.length,
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

    const missResults = new Map<string, GrammarSentenceResultPayload>();
    let repairAttempted = false;
    let totalRepairAttempts = 0;

    try {
        for (const batch of chunkItems(misses, GRAMMAR_BATCH_SIZE)) {
            const batchSentences = batch.map((item) => item.sentence);
            const initial = await runBasicInference(client, batchSentences);

            const perSentenceInitial = new Map<string, GrammarSanitizeResult<GrammarBasicResult>>();
            for (const sentence of batchSentences) {
                perSentenceInitial.set(sentence, sanitizeSentenceFromBatch(initial, sentence));
            }

            const repairTargets = batchSentences.filter((sentence) => {
                const current = perSentenceInitial.get(sentence);
                return current ? sentenceNeedsRepair(current) : true;
            });

            let repairedBatch: GrammarSanitizeResult<GrammarBasicResult> | null = null;
            if (repairTargets.length > 0 && GRAMMAR_REPAIR_ATTEMPT_LIMIT > 0) {
                const repairIssues = repairTargets.flatMap((sentence) => perSentenceInitial.get(sentence)?.issues ?? []);
                const repairHints = buildRepairHints(repairIssues);
                const repairCategories = buildRepairCategories(repairIssues);
                repairedBatch = await runBasicRepairInference(
                    client,
                    repairTargets,
                    repairCategories,
                    repairHints,
                    repairTargets.map((sentence) => {
                        const current = perSentenceInitial.get(sentence)?.data.difficult_sentences[0];
                        return current ?? { sentence, translation: "", highlights: [] };
                    }),
                );
                repairAttempted = true;
                totalRepairAttempts += 1;
            }

            for (const item of batch) {
                const merged = mergeSentenceResult({
                    sentence: item.sentence,
                    initial,
                    repaired: repairTargets.includes(item.sentence) ? repairedBatch : null,
                });
                const cacheMetaBase: Omit<GrammarCachedMeta, "hit" | "layer"> = {
                    key: item.cacheKey,
                    mode: "basic",
                    promptVersion,
                    model: execution.model,
                };
                const usable = hasUsableBasicGrammarResult(merged.data);
                const payload: GrammarSentenceResultPayload = {
                    sentence: item.sentence,
                    cacheKey: item.cacheKey,
                    data: merged.data,
                    issues: merged.issues,
                    retryRecommended: merged.retryRecommended,
                    qualityScore: merged.qualityScore,
                    cache: { ...cacheMetaBase, hit: false, layer: "miss" as const },
                    repairAttempted: repairTargets.includes(item.sentence),
                    repairAttempts: repairTargets.includes(item.sentence) && repairedBatch ? 1 : 0,
                    ...(usable ? {} : { error: "Grammar analysis was incomplete. Please retry." }),
                };
                if (usable) {
                    setServerGrammarCache(item.cacheKey, merged.data);
                    if (item.aliasCacheKey !== item.cacheKey) {
                        setServerGrammarCache(item.aliasCacheKey, merged.data);
                    }
                }
                missResults.set(item.sentence, payload);
            }
        }

        const orderedResults = workItems.map((item) => (
            cachedResults.get(item.sentence) ?? missResults.get(item.sentence)!
        ));
        const usableCount = orderedResults.filter((item) => hasUsableBasicGrammarResult(item.data)).length;

        if (usableCount === 0) {
            await refundIfNeeded({
                charged,
                action: "grammar_basic",
                reason: "basic_inference_low_quality",
                cacheKey: workItems[0]?.cacheKey ?? "grammar",
            });
            return {
                status: 502,
                body: {
                    error: "Grammar analysis was incomplete. Please retry.",
                    errorCode: LOW_QUALITY_GRAMMAR_ANALYSIS,
                    issues: uniqueStrings(orderedResults.flatMap((item) => item.issues)),
                },
            };
        }

        const flattenedSentences = orderedResults.flatMap((item) => item.data.difficult_sentences);
        const tags = uniqueStrings(orderedResults.flatMap((item) => item.data.tags)).slice(0, 12);
        const overview = orderedResults
            .map((item) => item.data.overview.trim())
            .filter(Boolean)
            .join(" ")
            .trim() || "已生成句级语法分析。";

        return {
            status: 200,
            body: {
                mode: "basic",
                tags: tags.length > 0 ? tags : ["句子主干", "结构拆分"],
                overview,
                difficult_sentences: flattenedSentences,
                results: orderedResults,
                repairAttempted,
                repairAttempts: totalRepairAttempts,
                cache: orderedResults.length === 1 ? orderedResults[0].cache : null,
                issues: uniqueStrings(orderedResults.flatMap((item) => item.issues)),
                readingCoins: misses.length > 0 ? readingCoinMutationPayload(charged) : null,
            },
        };
    } catch (error) {
        const providerError = getProviderErrorDetails(error);
        if (providerError.status === 429) {
            await refundIfNeeded({
                charged,
                action: "grammar_basic",
                reason: "basic_inference_rate_limited",
                cacheKey: workItems[0]?.cacheKey ?? "grammar",
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
            cacheKey: workItems[0]?.cacheKey ?? "grammar",
        });
        console.error("Grammar Basic Analysis Error:", error);
        return {
            status: 500,
            body: { error: "Failed to analyze grammar" },
        };
    }
}
