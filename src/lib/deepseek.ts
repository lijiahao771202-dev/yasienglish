import OpenAI from "openai";
import { cookies } from "next/headers";
import type {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

import { createServerClient } from "@/lib/supabase/server";
import {
    DEFAULT_DEEPSEEK_MODEL,
    DEFAULT_DEEPSEEK_REASONING_EFFORT,
    DEFAULT_DEEPSEEK_THINKING_MODE,
    DEFAULT_GLM_MODEL,
    DEFAULT_GLM_THINKING_MODE,
    DEFAULT_GITHUB_MODEL,
    DEFAULT_NVIDIA_MODEL,
    normalizeAiProvider,
    normalizeProfileDeepSeekModel,
    normalizeProfileDeepSeekReasoningEffort,
    normalizeProfileDeepSeekThinkingMode,
    normalizeProfileGlmModel,
    normalizeProfileGlmThinkingMode,
    normalizeProfileGithubModel,
    normalizeProfileNvidiaModel,
    type AiProvider,
    type DeepSeekReasoningEffort,
    type DeepSeekThinkingMode,
    type GlmThinkingMode,
} from "@/lib/profile-settings";
import { buildGlmModelSummaries, glmModelSupportsThinking } from "@/lib/glm-model-catalog";
import {
    getAiProviderRetryAfterSeconds,
    isAiProviderRateLimitError,
} from "@/lib/ai-provider-errors";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const GLM_BASE_URL = process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/";
const NVIDIA_BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const GITHUB_BASE_URL = process.env.GITHUB_BASE_URL || "https://models.github.ai/inference";
const GITHUB_MODELS_BASE_URL = process.env.GITHUB_MODELS_BASE_URL || "https://models.github.ai";
const PROFILE_KEY_CACHE_TTL_MS = 60_000;
const GITHUB_COMPLETION_COOLDOWN_MS = process.env.NODE_ENV === "test"
    ? 0
    : Number(process.env.GITHUB_MODELS_COMPLETION_COOLDOWN_MS ?? 600);
const GITHUB_COMPLETION_LOCK_TIMEOUT_MS = 90_000;
const GITHUB_RATE_LIMIT_RETRY_DELAYS_MS = process.env.NODE_ENV === "test"
    ? [0, 0]
    : [1_200, 2_400, 4_800];

const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat";
const DEEPSEEK_REASONER_MODEL = process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner";
const GLM_CHAT_MODEL = process.env.GLM_CHAT_MODEL || "glm-4-flash";
const GLM_REASONER_MODEL = process.env.GLM_REASONER_MODEL || "glm-z1-flash";
const NVIDIA_CHAT_MODEL = process.env.NVIDIA_CHAT_MODEL || DEFAULT_NVIDIA_MODEL;
const AI_PROVIDER_COOKIE_NAME = "yasi_ai_provider";
const DEEPSEEK_MODEL_COOKIE_NAME = "yasi_deepseek_model";
const DEEPSEEK_THINKING_MODE_COOKIE_NAME = "yasi_deepseek_thinking_mode";
const DEEPSEEK_REASONING_EFFORT_COOKIE_NAME = "yasi_deepseek_reasoning_effort";
const GLM_MODEL_COOKIE_NAME = "yasi_glm_model";
const GLM_THINKING_MODE_COOKIE_NAME = "yasi_glm_thinking_mode";
const NVIDIA_MODEL_COOKIE_NAME = "yasi_nvidia_model";
const GITHUB_MODEL_COOKIE_NAME = "yasi_github_model";

type CompletionRequestOptions = Parameters<OpenAI["chat"]["completions"]["create"]>[1];
type CachedProfileEntry = {
    aiProvider: AiProvider;
    deepseekApiKey: string | null;
    deepseekModel: string;
    deepseekThinkingMode: DeepSeekThinkingMode;
    deepseekReasoningEffort: DeepSeekReasoningEffort;
    glmApiKey: string | null;
    glmModel: string;
    glmThinkingMode: GlmThinkingMode;
    nvidiaApiKey: string | null;
    nvidiaModel: string;
    githubApiKey: string | null;
    githubModel: string;
    expiresAt: number;
};
type ProviderContext = {
    apiKey: string;
    baseURL: string;
    provider: AiProvider;
    selectedModel?: string;
    deepseekThinkingMode?: DeepSeekThinkingMode;
    deepseekReasoningEffort?: DeepSeekReasoningEffort;
    glmThinkingMode?: GlmThinkingMode;
};
type ProviderConnectionPayload = {
    ai_provider: AiProvider;
    deepseek_api_key?: string;
    deepseek_model?: string;
    deepseek_thinking_mode?: string;
    deepseek_reasoning_effort?: string;
    glm_api_key?: string;
    glm_model?: string;
    glm_thinking_mode?: string;
    nvidia_api_key?: string;
    nvidia_model?: string;
    github_api_key?: string;
    github_model?: string;
};
export type OpenAiCompatibleClient = {
    chat: {
        completions: {
            create: typeof createCompletion;
        };
    };
};
export type GitHubModelSummary = {
    id: string;
    name: string;
    publisher: string;
    summary: string;
    capabilities: string[];
    rateLimitTier: string;
};
export type { GlmModelSummary } from "@/lib/glm-model-catalog";

const cachedProfiles = new Map<string, CachedProfileEntry>();
const cachedClientsByProviderKey = new Map<string, OpenAI>();
let githubCompletionTail: Promise<void> = Promise.resolve();
const GITHUB_MODEL_ID_ALIASES: Record<string, string> = {
    "gpt-4.1": "openai/gpt-4.1",
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gpt-5": "openai/gpt-5",
    "gpt-5-chat": "openai/gpt-5-chat",
    "gpt-5-mini": "openai/gpt-5-mini",
    "gpt-5-nano": "openai/gpt-5-nano",
    "o4-mini": "openai/o4-mini",
    "o3": "openai/o3",
    "o3-mini": "openai/o3-mini",
    "o1": "openai/o1",
    "o1-preview": "openai/o1-preview",
    "o1-mini": "openai/o1-mini",
};

function normalizeGithubChatModelId(model?: string | null) {
    const normalized = normalizeProfileGithubModel(model);
    return GITHUB_MODEL_ID_ALIASES[normalized] || normalized;
}

function normalizeDeepSeekChatModelId(model?: string | null) {
    return normalizeProfileDeepSeekModel(model);
}

function getFallbackApiKey(provider: AiProvider) {
    if (provider === "glm") {
        return process.env.GLM_API_KEY?.trim() || null;
    }
    if (provider === "nvidia") {
        return process.env.NVIDIA_API_KEY?.trim() || process.env.NIM_API_KEY?.trim() || null;
    }
    if (provider === "github") {
        return process.env.GITHUB_MODELS_API_KEY?.trim() || null;
    }
    return process.env.DEEPSEEK_API_KEY?.trim() || null;
}

function getBaseUrl(provider: AiProvider) {
    if (provider === "glm") {
        return GLM_BASE_URL;
    }
    if (provider === "nvidia") {
        return NVIDIA_BASE_URL;
    }
    if (provider === "github") {
        return GITHUB_BASE_URL;
    }
    return DEEPSEEK_BASE_URL;
}

function getProviderLabel(provider: AiProvider) {
    if (provider === "glm") {
        return "GLM";
    }
    if (provider === "nvidia") {
        return "NVIDIA";
    }
    if (provider === "github") {
        return "GitHub Models";
    }
    return "DeepSeek";
}

function resolveModel(provider: AiProvider, requestedModel: string, selectedModel?: string) {
    if (provider === "deepseek") {
        return normalizeDeepSeekChatModelId(selectedModel || requestedModel);
    }

    if (provider === "github") {
        return normalizeGithubChatModelId(selectedModel || requestedModel);
    }

    if (provider === "nvidia") {
        if (requestedModel.includes("/")) {
            return selectedModel || requestedModel;
        }
        return normalizeProfileNvidiaModel(selectedModel || NVIDIA_CHAT_MODEL);
    }

    if (provider === "glm") {
        if (selectedModel) {
            return normalizeProfileGlmModel(selectedModel);
        }
        if (requestedModel === DEEPSEEK_REASONER_MODEL || requestedModel.includes("reasoner")) {
            return GLM_REASONER_MODEL;
        }
        if (requestedModel.startsWith("glm-")) {
            return requestedModel;
        }
        return GLM_CHAT_MODEL;
    }

    if (requestedModel.startsWith("glm-")) {
        return requestedModel.includes("z1") ? DEEPSEEK_REASONER_MODEL : DEEPSEEK_CHAT_MODEL;
    }

    return requestedModel;
}

function buildProviderSpecificBody(
    context: ProviderContext,
    body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    resolvedModel: string,
    nextMessages: typeof body.messages,
) {
    const nextBody: Record<string, unknown> = {
        ...body,
        model: resolvedModel,
        messages: nextMessages,
    };

    if (context.provider === "deepseek") {
        nextBody.extra_body = {
            thinking: {
                type: context.deepseekThinkingMode === "on" ? "enabled" : "disabled",
            },
        };
        if (context.deepseekThinkingMode === "on") {
            nextBody.reasoning_effort = context.deepseekReasoningEffort ?? DEFAULT_DEEPSEEK_REASONING_EFFORT;
        }
    }

    if (context.provider === "glm" && glmModelSupportsThinking(resolvedModel)) {
        nextBody.thinking = {
            type: context.glmThinkingMode === "on" ? "enabled" : "disabled",
        };
    }

    return nextBody;
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function isAsyncIterable(value: unknown): value is AsyncIterable<ChatCompletionChunk> {
    return Boolean(value && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function");
}

async function createCompletionWithRateLimitRetry<T>(factory: () => Promise<T>) {
    let lastError: unknown = null;
    const maxAttempts = GITHUB_RATE_LIMIT_RETRY_DELAYS_MS.length + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await factory();
        } catch (error) {
            lastError = error;
            if (!isAiProviderRateLimitError(error) || attempt === maxAttempts - 1) {
                throw error;
            }

            const retryAfterMs = (getAiProviderRetryAfterSeconds(error) ?? 0) * 1000;
            const fallbackDelayMs = GITHUB_RATE_LIMIT_RETRY_DELAYS_MS[attempt] ?? 0;
            await wait(Math.max(retryAfterMs, fallbackDelayMs));
        }
    }

    throw lastError;
}

async function runGithubCompletionQueued<T>(factory: () => Promise<T>) {
    const previous = githubCompletionTail.catch(() => undefined);
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
    });
    githubCompletionTail = previous.then(() => current).catch(() => undefined);

    await previous;

    let released = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (!released) {
            released = true;
            releaseCurrent();
        }
    }, GITHUB_COMPLETION_LOCK_TIMEOUT_MS);

    const releaseAfterCooldown = async () => {
        if (released) return;
        released = true;
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        await wait(GITHUB_COMPLETION_COOLDOWN_MS);
        releaseCurrent();
    };

    try {
        const result = await createCompletionWithRateLimitRetry(factory);
        if (isAsyncIterable(result)) {
            async function* wrappedStream() {
                try {
                    for await (const chunk of result) {
                        yield chunk;
                    }
                } finally {
                    await releaseAfterCooldown();
                }
            }

            return wrappedStream() as T;
        }

        await releaseAfterCooldown();
        return result;
    } catch (error) {
        await releaseAfterCooldown();
        throw error;
    }
}

async function getProviderHintFromCookies(): Promise<{
    provider: AiProvider;
    deepseekModel?: string;
    deepseekThinkingMode?: DeepSeekThinkingMode;
    deepseekReasoningEffort?: DeepSeekReasoningEffort;
    glmModel?: string;
    glmThinkingMode?: GlmThinkingMode;
    nvidiaModel?: string;
    githubModel?: string;
} | null> {
    try {
        const cookieStore = await cookies();
        const rawProvider = cookieStore.get(AI_PROVIDER_COOKIE_NAME)?.value;
        if (rawProvider !== "deepseek" && rawProvider !== "glm" && rawProvider !== "nvidia" && rawProvider !== "github") {
            return null;
        }
        const provider = normalizeAiProvider(rawProvider);
        const deepseekModel = normalizeDeepSeekChatModelId(cookieStore.get(DEEPSEEK_MODEL_COOKIE_NAME)?.value);
        const deepseekThinkingMode = normalizeProfileDeepSeekThinkingMode(cookieStore.get(DEEPSEEK_THINKING_MODE_COOKIE_NAME)?.value);
        const deepseekReasoningEffort = normalizeProfileDeepSeekReasoningEffort(cookieStore.get(DEEPSEEK_REASONING_EFFORT_COOKIE_NAME)?.value);
        const glmModel = normalizeProfileGlmModel(cookieStore.get(GLM_MODEL_COOKIE_NAME)?.value);
        const glmThinkingMode = normalizeProfileGlmThinkingMode(cookieStore.get(GLM_THINKING_MODE_COOKIE_NAME)?.value);
        const nvidiaModel = normalizeProfileNvidiaModel(cookieStore.get(NVIDIA_MODEL_COOKIE_NAME)?.value);
        const githubModel = normalizeGithubChatModelId(cookieStore.get(GITHUB_MODEL_COOKIE_NAME)?.value);

        return {
            provider,
            deepseekModel: provider === "deepseek" ? deepseekModel : undefined,
            deepseekThinkingMode: provider === "deepseek" ? deepseekThinkingMode : undefined,
            deepseekReasoningEffort: provider === "deepseek" ? deepseekReasoningEffort : undefined,
            glmModel: provider === "glm" ? glmModel : undefined,
            glmThinkingMode: provider === "glm" ? glmThinkingMode : undefined,
            nvidiaModel: provider === "nvidia" ? nvidiaModel : undefined,
            githubModel: provider === "github" ? githubModel : undefined,
        };
    } catch {
        return null;
    }
}

async function getProviderContextForCurrentUser(overrides?: {
    provider?: AiProvider;
    deepseekModel?: string;
    deepseekThinkingMode?: DeepSeekThinkingMode;
    deepseekReasoningEffort?: DeepSeekReasoningEffort;
    glmModel?: string;
    glmThinkingMode?: GlmThinkingMode;
    nvidiaModel?: string;
    githubModel?: string;
}): Promise<ProviderContext> {
    const providerHint = await getProviderHintFromCookies();
    let preferredProvider: AiProvider | null = overrides?.provider ?? providerHint?.provider ?? null;
    let preferredDeepSeekModel = normalizeDeepSeekChatModelId(overrides?.deepseekModel ?? providerHint?.deepseekModel);
    let preferredDeepSeekThinkingMode = normalizeProfileDeepSeekThinkingMode(overrides?.deepseekThinkingMode ?? providerHint?.deepseekThinkingMode);
    let preferredDeepSeekReasoningEffort = normalizeProfileDeepSeekReasoningEffort(overrides?.deepseekReasoningEffort ?? providerHint?.deepseekReasoningEffort);
    let preferredGlmModel = normalizeProfileGlmModel(overrides?.glmModel ?? providerHint?.glmModel);
    let preferredGlmThinkingMode = normalizeProfileGlmThinkingMode(overrides?.glmThinkingMode ?? providerHint?.glmThinkingMode);
    let preferredNvidiaModel = normalizeProfileNvidiaModel(overrides?.nvidiaModel ?? providerHint?.nvidiaModel);
    let preferredGithubModel = normalizeGithubChatModelId(overrides?.githubModel ?? providerHint?.githubModel);

    try {
        const supabase = await createServerClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (user) {
            const cached = cachedProfiles.get(user.id);
            if (cached && cached.expiresAt > Date.now()) {
                const provider = overrides?.provider ?? providerHint?.provider ?? cached.aiProvider;
                preferredProvider = provider;
                preferredDeepSeekModel = normalizeDeepSeekChatModelId(overrides?.deepseekModel ?? providerHint?.deepseekModel ?? cached.deepseekModel);
                preferredDeepSeekThinkingMode = normalizeProfileDeepSeekThinkingMode(overrides?.deepseekThinkingMode ?? providerHint?.deepseekThinkingMode ?? cached.deepseekThinkingMode);
                preferredDeepSeekReasoningEffort = normalizeProfileDeepSeekReasoningEffort(overrides?.deepseekReasoningEffort ?? providerHint?.deepseekReasoningEffort ?? cached.deepseekReasoningEffort);
                preferredGlmModel = normalizeProfileGlmModel(overrides?.glmModel ?? providerHint?.glmModel ?? cached.glmModel);
                preferredGlmThinkingMode = normalizeProfileGlmThinkingMode(overrides?.glmThinkingMode ?? providerHint?.glmThinkingMode ?? cached.glmThinkingMode);
                preferredNvidiaModel = normalizeProfileNvidiaModel(overrides?.nvidiaModel ?? providerHint?.nvidiaModel ?? cached.nvidiaModel);
                preferredGithubModel = normalizeGithubChatModelId(overrides?.githubModel ?? providerHint?.githubModel ?? cached.githubModel);
                const deepseekFallbackApiKey = getFallbackApiKey("deepseek");
                const githubFallbackApiKey = getFallbackApiKey("github");
                const apiKey = provider === "glm"
                    ? cached.glmApiKey
                        : provider === "nvidia"
                            ? cached.nvidiaApiKey
                        : provider === "github"
                            ? cached.githubApiKey || githubFallbackApiKey
                            : provider === "deepseek"
                                ? deepseekFallbackApiKey || cached.deepseekApiKey
                            : cached.deepseekApiKey;
                const resolvedApiKey = apiKey || getFallbackApiKey(provider);
                if (resolvedApiKey) {
                    return {
                        provider,
                        apiKey: resolvedApiKey,
                        baseURL: getBaseUrl(provider),
                        selectedModel: provider === "deepseek"
                            ? preferredDeepSeekModel
                            : provider === "glm"
                                ? preferredGlmModel
                            : provider === "nvidia"
                                ? preferredNvidiaModel
                                : provider === "github"
                                    ? normalizeGithubChatModelId(preferredGithubModel)
                                    : undefined,
                        deepseekThinkingMode: provider === "deepseek" ? preferredDeepSeekThinkingMode : undefined,
                        deepseekReasoningEffort: provider === "deepseek" ? preferredDeepSeekReasoningEffort : undefined,
                        glmThinkingMode: provider === "glm" ? preferredGlmThinkingMode : undefined,
                    };
                }
            }

            let { data, error } = await supabase
                .from("profiles")
                .select("ai_provider, deepseek_api_key, deepseek_model, deepseek_thinking_mode, deepseek_reasoning_effort, glm_api_key, nvidia_api_key, nvidia_model, github_api_key, github_model")
                .eq("user_id", user.id)
                .maybeSingle();

            // Fallback if the remote database does not yet have the github columns.
            if (error && error.code === '42703') {
                const retry = await supabase
                    .from("profiles")
                    .select("ai_provider, deepseek_api_key, glm_api_key, nvidia_api_key, nvidia_model")
                    .eq("user_id", user.id)
                    .maybeSingle();
                data = retry.data as typeof data;
                error = retry.error;
            }

            if (!error) {
                const provider = overrides?.provider
                    ?? providerHint?.provider
                    ?? normalizeAiProvider(typeof data?.ai_provider === "string" ? data.ai_provider : undefined);
                preferredProvider = provider;
                const deepseekApiKey = typeof data?.deepseek_api_key === "string" ? data.deepseek_api_key.trim() : "";
                const deepseekModel = normalizeDeepSeekChatModelId(typeof data?.deepseek_model === "string" ? data.deepseek_model : undefined);
                const deepseekThinkingMode = normalizeProfileDeepSeekThinkingMode(typeof data?.deepseek_thinking_mode === "string" ? data.deepseek_thinking_mode : undefined);
                const deepseekReasoningEffort = normalizeProfileDeepSeekReasoningEffort(typeof data?.deepseek_reasoning_effort === "string" ? data.deepseek_reasoning_effort : undefined);
                preferredDeepSeekModel = normalizeDeepSeekChatModelId(overrides?.deepseekModel ?? providerHint?.deepseekModel ?? deepseekModel);
                preferredDeepSeekThinkingMode = normalizeProfileDeepSeekThinkingMode(overrides?.deepseekThinkingMode ?? providerHint?.deepseekThinkingMode ?? deepseekThinkingMode);
                preferredDeepSeekReasoningEffort = normalizeProfileDeepSeekReasoningEffort(overrides?.deepseekReasoningEffort ?? providerHint?.deepseekReasoningEffort ?? deepseekReasoningEffort);
                const glmApiKey = typeof data?.glm_api_key === "string" ? data.glm_api_key.trim() : "";
                preferredGlmModel = normalizeProfileGlmModel(overrides?.glmModel ?? providerHint?.glmModel);
                preferredGlmThinkingMode = normalizeProfileGlmThinkingMode(overrides?.glmThinkingMode ?? providerHint?.glmThinkingMode);
                const nvidiaApiKey = typeof data?.nvidia_api_key === "string" ? data.nvidia_api_key.trim() : "";
                const nvidiaModel = normalizeProfileNvidiaModel(typeof data?.nvidia_model === "string" ? data.nvidia_model : undefined);
                preferredNvidiaModel = normalizeProfileNvidiaModel(overrides?.nvidiaModel ?? providerHint?.nvidiaModel ?? nvidiaModel);
                const githubApiKey = typeof data?.github_api_key === "string" ? data.github_api_key.trim() : "";
                const githubModel = typeof data?.github_model === "string" && data.github_model.trim() ? data.github_model : undefined;
                preferredGithubModel = normalizeGithubChatModelId(overrides?.githubModel ?? providerHint?.githubModel ?? githubModel);

                cachedProfiles.set(user.id, {
                    aiProvider: provider,
                    deepseekApiKey: deepseekApiKey || null,
                    deepseekModel: preferredDeepSeekModel || DEFAULT_DEEPSEEK_MODEL,
                    deepseekThinkingMode: preferredDeepSeekThinkingMode || DEFAULT_DEEPSEEK_THINKING_MODE,
                    deepseekReasoningEffort: preferredDeepSeekReasoningEffort || DEFAULT_DEEPSEEK_REASONING_EFFORT,
                    glmApiKey: glmApiKey || null,
                    glmModel: preferredGlmModel || DEFAULT_GLM_MODEL,
                    glmThinkingMode: preferredGlmThinkingMode || DEFAULT_GLM_THINKING_MODE,
                    nvidiaApiKey: nvidiaApiKey || null,
                    nvidiaModel: preferredNvidiaModel,
                    githubApiKey: githubApiKey || null,
                    githubModel: preferredGithubModel || DEFAULT_GITHUB_MODEL,
                    expiresAt: Date.now() + PROFILE_KEY_CACHE_TTL_MS,
                });

                const githubFallbackApiKey = getFallbackApiKey("github");
                const deepseekFallbackApiKey = getFallbackApiKey("deepseek");
                const resolvedApiKey = (
                    provider === "glm"
                        ? glmApiKey
                        : provider === "nvidia"
                            ? nvidiaApiKey
                            : provider === "github"
                                ? githubApiKey || githubFallbackApiKey
                                : provider === "deepseek"
                                    ? deepseekFallbackApiKey || deepseekApiKey
                                : deepseekApiKey
                ) || getFallbackApiKey(provider);
                if (resolvedApiKey) {
                    return {
                        provider,
                        apiKey: resolvedApiKey,
                        baseURL: getBaseUrl(provider),
                        selectedModel: provider === "deepseek"
                            ? preferredDeepSeekModel
                            : provider === "glm"
                                ? preferredGlmModel
                            : provider === "nvidia"
                                ? preferredNvidiaModel
                                : provider === "github"
                                    ? normalizeGithubChatModelId(preferredGithubModel)
                                    : undefined,
                        deepseekThinkingMode: provider === "deepseek" ? preferredDeepSeekThinkingMode : undefined,
                        deepseekReasoningEffort: provider === "deepseek" ? preferredDeepSeekReasoningEffort : undefined,
                        glmThinkingMode: provider === "glm" ? preferredGlmThinkingMode : undefined,
                    };
                }
            }
        }
    } catch {
        // Fall back to shared server credentials when auth context is unavailable.
    }

    if (preferredProvider) {
        const preferredFallbackApiKey = getFallbackApiKey(preferredProvider);
        if (preferredFallbackApiKey) {
            return {
                provider: preferredProvider,
                apiKey: preferredFallbackApiKey,
                baseURL: getBaseUrl(preferredProvider),
                selectedModel: preferredProvider === "deepseek"
                    ? normalizeDeepSeekChatModelId(preferredDeepSeekModel)
                    : preferredProvider === "glm"
                        ? normalizeProfileGlmModel(preferredGlmModel)
                    : preferredProvider === "nvidia"
                        ? normalizeProfileNvidiaModel(preferredNvidiaModel)
                        : preferredProvider === "github"
                            ? normalizeGithubChatModelId(preferredGithubModel)
                            : undefined,
                deepseekThinkingMode: preferredProvider === "deepseek" ? normalizeProfileDeepSeekThinkingMode(preferredDeepSeekThinkingMode) : undefined,
                deepseekReasoningEffort: preferredProvider === "deepseek" ? normalizeProfileDeepSeekReasoningEffort(preferredDeepSeekReasoningEffort) : undefined,
                glmThinkingMode: preferredProvider === "glm" ? normalizeProfileGlmThinkingMode(preferredGlmThinkingMode) : undefined,
            };
        }

        throw new Error(`Missing ${getProviderLabel(preferredProvider)} API key. Add your ${getProviderLabel(preferredProvider)} key in profile settings or configure the matching server env.`);
    }

    const fallbackProvider: AiProvider = "deepseek";
    const fallbackApiKey = getFallbackApiKey(fallbackProvider);
    if (fallbackApiKey) {
        return {
            provider: fallbackProvider,
            apiKey: fallbackApiKey,
            baseURL: getBaseUrl(fallbackProvider),
            selectedModel: DEFAULT_DEEPSEEK_MODEL,
            deepseekThinkingMode: DEFAULT_DEEPSEEK_THINKING_MODE,
            deepseekReasoningEffort: DEFAULT_DEEPSEEK_REASONING_EFFORT,
        };
    }

    const glmFallbackApiKey = getFallbackApiKey("glm");
    if (glmFallbackApiKey) {
        return {
            provider: "glm",
            apiKey: glmFallbackApiKey,
            baseURL: getBaseUrl("glm"),
            selectedModel: DEFAULT_GLM_MODEL,
            glmThinkingMode: DEFAULT_GLM_THINKING_MODE,
        };
    }

    const nvidiaFallbackApiKey = getFallbackApiKey("nvidia");
    if (nvidiaFallbackApiKey) {
        return {
            provider: "nvidia",
            apiKey: nvidiaFallbackApiKey,
            baseURL: getBaseUrl("nvidia"),
            selectedModel: normalizeProfileNvidiaModel(undefined),
        };
    }

    const githubFallbackApiKey = getFallbackApiKey("github");
    if (githubFallbackApiKey) {
        return {
            provider: "github",
            apiKey: githubFallbackApiKey,
            baseURL: getBaseUrl("github"),
        };
    }

    throw new Error("Missing AI provider API key. Add your provider key in profile settings or configure DEEPSEEK_API_KEY / GLM_API_KEY / NVIDIA_API_KEY on the server.");
}

async function getOpenAiClientForCurrentUser() {
    const context = await getProviderContextForCurrentUser();
    const cacheKey = `${context.provider}:${context.baseURL}:${context.apiKey}`;
    const cachedClient = cachedClientsByProviderKey.get(cacheKey);
    if (cachedClient) {
        return {
            client: cachedClient,
            context,
        };
    }

    const client = new OpenAI({
        apiKey: context.apiKey,
        baseURL: context.baseURL,
        defaultHeaders: { "Connection": "close" },
    });
    cachedClientsByProviderKey.set(cacheKey, client);

    return {
        client,
        context,
    };
}

function getProviderContextFromPayload(payload: ProviderConnectionPayload): ProviderContext {
    const provider = normalizeAiProvider(payload.ai_provider);
    const deepseekApiKey = payload.deepseek_api_key?.trim() || "";
    const deepseekModel = normalizeDeepSeekChatModelId(payload.deepseek_model);
    const deepseekThinkingMode = normalizeProfileDeepSeekThinkingMode(payload.deepseek_thinking_mode);
    const deepseekReasoningEffort = normalizeProfileDeepSeekReasoningEffort(payload.deepseek_reasoning_effort);
    const glmApiKey = payload.glm_api_key?.trim() || "";
    const glmModel = normalizeProfileGlmModel(payload.glm_model);
    const glmThinkingMode = normalizeProfileGlmThinkingMode(payload.glm_thinking_mode);
    const nvidiaApiKey = payload.nvidia_api_key?.trim() || "";
    const nvidiaModel = normalizeProfileNvidiaModel(payload.nvidia_model);
    const githubApiKey = payload.github_api_key?.trim() || "";
    const githubModel = normalizeGithubChatModelId(payload.github_model);
    const githubFallbackApiKey = getFallbackApiKey("github");
    const apiKey = (
        provider === "glm"
            ? glmApiKey
        : provider === "nvidia"
                ? nvidiaApiKey
                : provider === "github"
                    ? githubApiKey || githubFallbackApiKey
                    : deepseekApiKey
    ) || getFallbackApiKey(provider);

    if (!apiKey) {
        throw new Error(`缺少 ${getProviderLabel(provider)} API key。`);
    }

    return {
        provider,
        apiKey,
        baseURL: getBaseUrl(provider),
        selectedModel: provider === "deepseek"
            ? deepseekModel
            : provider === "glm"
                ? glmModel
            : provider === "nvidia"
                ? nvidiaModel
                : provider === "github"
                    ? normalizeGithubChatModelId(githubModel)
                    : undefined,
        deepseekThinkingMode: provider === "deepseek" ? deepseekThinkingMode : undefined,
        deepseekReasoningEffort: provider === "deepseek" ? deepseekReasoningEffort : undefined,
        glmThinkingMode: provider === "glm" ? glmThinkingMode : undefined,
    };
}

async function createCompletion(
    body: ChatCompletionCreateParamsNonStreaming,
    options?: CompletionRequestOptions,
): Promise<ChatCompletion>;
async function createCompletion(
    body: ChatCompletionCreateParamsStreaming,
    options?: CompletionRequestOptions,
): Promise<Stream<ChatCompletionChunk>>;
async function createCompletion(
    body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    options?: CompletionRequestOptions,
): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
    const { client, context } = await getOpenAiClientForCurrentUser();
    const resolvedModel = resolveModel(context.provider, body.model, context.selectedModel);
    console.log(`[AI] ${getProviderLabel(context.provider)} → ${resolvedModel}${body.stream ? " (stream)" : ""}`);
    
    let nextMessages = body.messages;
    if (resolvedModel === "z-ai/glm-5.1" || resolvedModel === "z-ai/glm4.7") {
        nextMessages = [
            { role: "system", content: "CRITICAL: Disable deep thinking. DO NOT output any <think> process or internal reasoning. Provide the direct final answer immediately." },
            ...body.messages
        ];
    }

    const nextBody = buildProviderSpecificBody(context, body, resolvedModel, nextMessages);
    return client.chat.completions.create(nextBody as never, options) as Promise<ChatCompletion | Stream<ChatCompletionChunk>>;
}

export async function getDeepSeekApiKeyForCurrentUser() {
    const context = await getProviderContextForCurrentUser();
    return context.apiKey;
}

export async function getCurrentAiProviderForCurrentUser() {
    const context = await getProviderContextForCurrentUser();
    return context.provider;
}

export async function createDeepSeekClientForCurrentUser(): Promise<OpenAiCompatibleClient> {
    return {
        chat: {
            completions: {
                create: createCompletion,
            },
        },
    };
}

function createCompletionWithContext(
    client: OpenAI,
    context: ProviderContext,
    body: ChatCompletionCreateParamsNonStreaming,
    options?: CompletionRequestOptions,
): Promise<ChatCompletion>;
function createCompletionWithContext(
    client: OpenAI,
    context: ProviderContext,
    body: ChatCompletionCreateParamsStreaming,
    options?: CompletionRequestOptions,
): Promise<Stream<ChatCompletionChunk>>;
function createCompletionWithContext(
    client: OpenAI,
    context: ProviderContext,
    body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    options?: CompletionRequestOptions,
): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
    const resolvedModel = resolveModel(context.provider, body.model, context.selectedModel);
    console.log(`[AI] ${getProviderLabel(context.provider)} → ${resolvedModel}${body.stream ? " (stream)" : ""}`);
    
    let nextMessages = body.messages;
    if (resolvedModel === "z-ai/glm-5.1" || resolvedModel === "z-ai/glm4.7") {
        nextMessages = [
            { role: "system", content: "CRITICAL: Disable deep thinking. DO NOT output any <think> process or internal reasoning. Provide the direct final answer immediately." },
            ...body.messages
        ];
    }

    const create = () => client.chat.completions.create(
        buildProviderSpecificBody(context, body, resolvedModel, nextMessages) as never,
        options,
    ) as Promise<ChatCompletion | Stream<ChatCompletionChunk>>;

    if (context.provider === "github") {
        return runGithubCompletionQueued(create);
    }

    return create();
}

export async function createDeepSeekClientForCurrentUserWithOverride(overrides: {
    provider?: AiProvider;
    deepseekModel?: string;
    deepseekThinkingMode?: DeepSeekThinkingMode;
    deepseekReasoningEffort?: DeepSeekReasoningEffort;
    glmModel?: string;
    glmThinkingMode?: GlmThinkingMode;
    nvidiaModel?: string;
    githubModel?: string;
}): Promise<OpenAiCompatibleClient> {
    const context = await getProviderContextForCurrentUser(overrides);
    const cacheKey = `${context.provider}:${context.baseURL}:${context.apiKey}`;
    const cachedClient = cachedClientsByProviderKey.get(cacheKey);
    const client = cachedClient ?? new OpenAI({
        apiKey: context.apiKey,
        baseURL: context.baseURL,
        defaultHeaders: { "Connection": "close" },
    });
    if (!cachedClient) {
        cachedClientsByProviderKey.set(cacheKey, client);
    }

    function complete(
        body: ChatCompletionCreateParamsNonStreaming,
        options?: CompletionRequestOptions,
    ): Promise<ChatCompletion>;
    function complete(
        body: ChatCompletionCreateParamsStreaming,
        options?: CompletionRequestOptions,
    ): Promise<Stream<ChatCompletionChunk>>;
    function complete(
        body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
        options?: CompletionRequestOptions,
    ): Promise<ChatCompletion | Stream<ChatCompletionChunk>> {
        return createCompletionWithContext(client, context, body as never, options);
    }

    return {
        chat: {
            completions: {
                create: complete,
            },
        },
    };
}

export async function getCurrentAiProviderLabelForCurrentUser() {
    return getProviderLabel(await getCurrentAiProviderForCurrentUser());
}

export async function getCurrentAiExecutionTargetForCurrentUser(requestedModel: string = DEEPSEEK_CHAT_MODEL) {
    const context = await getProviderContextForCurrentUser();
    return {
        provider: context.provider,
        providerLabel: getProviderLabel(context.provider),
        model: resolveModel(context.provider, requestedModel, context.selectedModel),
    };
}

export async function getCurrentAiExecutionFingerprintForCurrentUser(requestedModel: string = DEEPSEEK_CHAT_MODEL) {
    const context = await getProviderContextForCurrentUser();
    const model = resolveModel(context.provider, requestedModel, context.selectedModel);
    const deepseekThinkingMode = context.provider === "deepseek"
        ? normalizeProfileDeepSeekThinkingMode(context.deepseekThinkingMode)
        : undefined;
    const deepseekReasoningEffort = context.provider === "deepseek" && deepseekThinkingMode === "on"
        ? normalizeProfileDeepSeekReasoningEffort(context.deepseekReasoningEffort)
        : undefined;

    return {
        provider: context.provider,
        providerLabel: getProviderLabel(context.provider),
        model,
        deepseekThinkingMode,
        deepseekReasoningEffort,
        cacheSignature: context.provider === "deepseek"
            ? `${context.provider}:${model}:thinking=${deepseekThinkingMode}:reasoning=${deepseekReasoningEffort ?? "off"}`
            : context.provider === "glm" && glmModelSupportsThinking(model)
                ? `${context.provider}:${model}:thinking=${normalizeProfileGlmThinkingMode(context.glmThinkingMode)}`
            : `${context.provider}:${model}`,
    };
}

export async function testAiProviderConnection(payload: ProviderConnectionPayload) {
    const context = getProviderContextFromPayload(payload);
    const client = new OpenAI({
        apiKey: context.apiKey,
        baseURL: context.baseURL,
        defaultHeaders: { "Connection": "close" },
    });
    const model = resolveModel(context.provider, DEEPSEEK_CHAT_MODEL, context.selectedModel);
    const probeMessages: ChatCompletionCreateParamsNonStreaming["messages"] = [
        {
            role: "system",
            content: "You are a connectivity probe. Reply with exactly: OK",
        },
        {
            role: "user",
            content: "Ping",
        },
    ];

    const completion = await client.chat.completions.create(buildProviderSpecificBody(context, {
        model,
        temperature: 0,
        max_tokens: 16,
        messages: probeMessages,
    }, model, probeMessages) as never);

    const content = completion.choices[0]?.message?.content?.trim() || "";

    return {
        provider: context.provider,
        providerLabel: getProviderLabel(context.provider),
        model,
        content,
    };
}

export async function listNvidiaModelsForConnectionPayload(payload: Pick<ProviderConnectionPayload, "nvidia_api_key">) {
    const context = getProviderContextFromPayload({
        ai_provider: "nvidia",
        nvidia_api_key: payload.nvidia_api_key,
    });

    const response = await fetch(`${context.baseURL}/models`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${context.apiKey}`,
            "Content-Type": "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `无法获取 NVIDIA 模型列表（${response.status}）`);
    }

    const data = await response.json().catch(() => ({}));
    const rawModels: unknown[] = Array.isArray(data?.data) ? data.data : [];
    const modelIds = rawModels
        .map((item) => {
            if (!item || typeof item !== "object") {
                return "";
            }
            const record = item as { id?: unknown };
            return typeof record.id === "string" ? record.id.trim() : "";
        })
        .filter((item): item is string => Boolean(item));
    const models = Array.from(new Set<string>(modelIds)).sort((a, b) => a.localeCompare(b));

    if (!models.length) {
        throw new Error("当前 key 没有返回可用模型。");
    }

    return models;
}

export async function listGlmModelsForConnectionPayload(payload: Pick<ProviderConnectionPayload, "glm_api_key">) {
    const context = getProviderContextFromPayload({
        ai_provider: "glm",
        glm_api_key: payload.glm_api_key,
    });

    const response = await fetch(`${context.baseURL}/models`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${context.apiKey}`,
            "Content-Type": "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `无法获取 GLM 模型列表（${response.status}）`);
    }

    const data = await response.json().catch(() => ({}));
    const rawModels: unknown[] = Array.isArray(data?.data) ? data.data : [];
    const modelIds = rawModels
        .map((item) => {
            if (!item || typeof item !== "object") {
                return "";
            }
            const record = item as { id?: unknown };
            return typeof record.id === "string" ? record.id.trim() : "";
        })
        .filter((item): item is string => Boolean(item));

    if (!modelIds.length) {
        throw new Error("当前 GLM key 没有返回可用模型。");
    }

    return buildGlmModelSummaries(modelIds);
}

export async function listGitHubModelsForConnectionPayload(payload: Pick<ProviderConnectionPayload, "github_api_key">) {
    const context = getProviderContextFromPayload({
        ai_provider: "github",
        github_api_key: payload.github_api_key,
    });

    const response = await fetch(`${GITHUB_MODELS_BASE_URL}/catalog/models`, {
        method: "GET",
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${context.apiKey}`,
            "X-GitHub-Api-Version": "2026-03-10",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `无法获取 GitHub 模型列表（${response.status}）`);
    }

    const data = await response.json().catch(() => []);
    const rawModels: unknown[] = Array.isArray(data) ? data : Array.isArray((data as { data?: unknown[] })?.data) ? (data as { data: unknown[] }).data : [];
    const models = rawModels
        .map((item): GitHubModelSummary | null => {
            if (!item || typeof item !== "object") {
                return null;
            }

            const record = item as {
                id?: unknown;
                name?: unknown;
                publisher?: unknown;
                summary?: unknown;
                capabilities?: unknown;
                rate_limit_tier?: unknown;
                supported_output_modalities?: unknown;
            };

            const id = typeof record.id === "string" ? record.id.trim() : "";
            const name = typeof record.name === "string" ? record.name.trim() : id;
            const publisher = typeof record.publisher === "string" ? record.publisher.trim() : "Other";
            const summary = typeof record.summary === "string" ? record.summary.trim() : "";
            const capabilities = Array.isArray(record.capabilities)
                ? record.capabilities.filter((value): value is string => typeof value === "string")
                : [];
            const supportedOutputModalities = Array.isArray(record.supported_output_modalities)
                ? record.supported_output_modalities.filter((value): value is string => typeof value === "string")
                : [];
            const rateLimitTier = typeof record.rate_limit_tier === "string" ? record.rate_limit_tier.trim() : "";

            if (!id) return null;
            if (!supportedOutputModalities.includes("text")) return null;
            if (id.toLowerCase().includes("embed") || name.toLowerCase().includes("embedding")) return null;

            return {
                id,
                name,
                publisher,
                summary,
                capabilities,
                rateLimitTier,
            };
        })
        .filter((item): item is GitHubModelSummary => Boolean(item))
        .sort((a, b) => {
            const publisherCompare = a.publisher.localeCompare(b.publisher);
            if (publisherCompare !== 0) return publisherCompare;
            return a.name.localeCompare(b.name);
        });

    if (!models.length) {
        throw new Error("当前 GitHub key 没有返回可用于聊天生成的模型。");
    }

    return models;
}

export const deepseek = {
    chat: {
        completions: {
            create: createCompletion,
        },
    },
};
