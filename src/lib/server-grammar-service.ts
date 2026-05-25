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
    GRAMMAR_BASIC_MODEL,
    GRAMMAR_BASIC_PROMPT_VERSION,
    normalizeGrammarText,
    hasUsableBasicGrammarResult,
    sanitizeGrammarBasicPayload,
    type GrammarBasicResult,
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

interface GrammarCachedMeta {
    key: string;
    hit: boolean;
    layer: "server" | "miss";
    mode: "basic";
    promptVersion: string;
    model: string;
}

const LOW_QUALITY_GRAMMAR_ANALYSIS = "LOW_QUALITY_GRAMMAR_ANALYSIS";
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

async function runBasicInference(client: OpenAiCompatibleClient, paragraphText: string) {
    const raw = await callDeepseekJson(
        client,
        buildGrammarBasicPrompt(paragraphText),
        GRAMMAR_BASIC_MODEL,
    );
    return sanitizeGrammarBasicPayload(raw, paragraphText);
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
        if (parsed.retryRecommended && !hasUsableBasicGrammarResult(parsed.data)) {
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
