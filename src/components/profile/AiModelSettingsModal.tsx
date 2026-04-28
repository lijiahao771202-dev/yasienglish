"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import { 
    X, 
    Cpu, 
    BrainCircuit, 
    Sparkles, 
    ShieldCheck, 
    ChevronDown, 
    Search,
    Loader2,
    Github
} from "lucide-react";

import { db } from "@/lib/db";
import { VERIFIED_GITHUB_MODEL_CATEGORIES } from "@/lib/github-model-catalog";
import { GLM_MODEL_LIBRARY, glmModelSupportsThinking, type GlmModelSummary } from "@/lib/glm-model-catalog";
import { saveProfilePatch } from "@/lib/user-repository";
import { getBrowserSupabaseAuthHeaders } from "@/lib/supabase/browser-auth";
import {
    DEFAULT_DEEPSEEK_MODEL,
    DEFAULT_DEEPSEEK_REASONING_EFFORT,
    DEFAULT_DEEPSEEK_THINKING_MODE,
    DEFAULT_GLM_MODEL,
    DEFAULT_GLM_THINKING_MODE,
    normalizeAiProvider,
    normalizeProfileDeepSeekModel,
    normalizeProfileDeepSeekReasoningEffort,
    normalizeProfileDeepSeekThinkingMode,
    normalizeProfileGlmModel,
    normalizeProfileGlmThinkingMode,
    type AiProvider,
    type DeepSeekModel,
    type DeepSeekReasoningEffort,
    type DeepSeekThinkingMode,
    type GlmThinkingMode,
} from "@/lib/profile-settings";

interface AiModelSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const NVIDIA_CATEGORIES = [
    {
        id: "qwen",
        name: "🐉 通义千问 (Qwen)",
        desc: "最懂中式英语，代码逻辑与语法分析完美兼容",
        models: [
            { id: "qwen/qwen2.5-coder-32b-instruct", label: "Qwen 2.5 Coder 32B", note: "⚡ 393ms | 💯 逻辑满分", tag: "全场最强" },
            { id: "qwen/qwen3.5-122b-a10b", label: "Qwen 3.5 (122B)", note: "⚡ 1.7s | 💯 逻辑满分" },
            { id: "qwen/qwen3-next-80b-a3b-instruct", label: "Qwen 3 Next 80B", note: "速度较慢 (5s+) | 下代探索版" },
            { id: "qwen/qwen3.5-397b-a17b", label: "Qwen 3.5 (397B)", note: "巨无霸体量 (4s+) | 极致参数" },
            { id: "qwen/qwen3-next-80b-a3b-thinking", label: "Qwen 3 Thinking", note: "包含思维链 (慎用，格式易毁)" },
            { id: "qwen/qwen3-coder-480b-a35b-instruct", label: "Qwen 3 Coder 480B", note: "史诗级代码巨核 (常因过载超时)" },
        ]
    },
    {
        id: "china",
        name: "🇨🇳 其他国产派系 (DeepSeek等)",
        desc: "顶流中文处理与长文分析大核",
        models: [
            { id: "deepseek-ai/deepseek-v3.1-terminus", label: "DeepSeek V3.1 Terminus", note: "结构化拆解之神 (需要优质网络)" },
            { id: "z-ai/glm-5.1", label: "GLM 5.1", note: "最新强大，综合能力顶级" },
            { id: "z-ai/glm4.7", label: "GLM 4.7", note: "更轻更快，适合低延迟交互" },
            { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5", note: "教练语气自然亲和" },
            { id: "minimaxai/minimax-m2.7", label: "MiniMax M2.7", note: "语气活泼，适合陪练对话" },
        ]
    },
    {
        id: "llama",
        name: "🇺🇸 Meta Llama 体系 (标准全能)",
        desc: "极其稳定标准，基础翻译绝不翻车",
        models: [
            { id: "meta/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick", note: "⚡ 520ms | 评分: 90", tag: "强烈推荐" },
            { id: "meta/llama-3.1-8b-instruct", label: "Llama 3.1 8B", note: "⚡ 801ms | 评分: 85 小巧迅捷" },
            { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", note: "巨无霸参数，开源界霸主" },
            { id: "meta/llama-3.1-70b-instruct", label: "Llama 3.1 70B", note: "质量与速度平衡的老牌王者" },
        ]
    },
    {
        id: "mistral",
        name: "🇫🇷 Mistral 欧洲家族 (极致速度)",
        desc: "架构狂魔，响应速度快到没朋友",
        models: [
            { id: "mistralai/mistral-small-4-119b-2603", label: "Mistral Small 4", note: "⚡ 339ms | 评分: 90", tag: "超高速" },
            { id: "mistralai/mixtral-8x22b-instruct-v0.1", label: "Mixtral 8x22B", note: "⚡ 349ms | 评分: 75 经典MOE" },
            { id: "mistralai/mistral-nemotron", label: "Mistral Nemotron", note: "⚡ 501ms | 评分: 85" },
            { id: "mistralai/mistral-large-3-675b-instruct-2512", label: "Mistral Large 3", note: "⚡ 889ms | 巨无霸极速版" },
        ]
    },
    {
        id: "nvidia_ms",
        name: "🛠️ 原厂硬核优化 (NVIDIA & MS)",
        desc: "底层显卡暴力调优，小身板爆发出核弹性能",
        models: [
            { id: "nvidia/nemotron-nano-12b-v2-vl", label: "Nemotron Nano 12B", note: "⚡ 367ms | 评分: 85", tag: "亲儿子" },
            { id: "microsoft/phi-4-mini-instruct", label: "Phi-4 Mini", note: "⚡ 634ms | 评分: 70 微软小核心" },
        ]
    },
    {
        id: "google",
        name: "🔍 Google 谷歌线 (大厂底蕴)",
        desc: "全能无死角，润色极佳",
        models: [
            { id: "google/gemma-3-27b-it", label: "Gemma 3 (27B)", note: "⚡ 966ms | 评分: 70 极速全能" },
            { id: "google/gemma-4-31b-it", label: "Gemma 4 (31B)", note: "中量级全能王" },
            { id: "google/gemma-3-12b-it", label: "Gemma 3 (12B)", note: "轻量级主力" },
        ]
    }
];

const PROVIDERS = [
    {
        id: "deepseek" as const,
        label: "DeepSeek",
        detail: "适合结构化生成与评分",
        icon: Cpu,
    },
    {
        id: "glm" as const,
        label: "GLM",
        detail: "中文讲解与教练对话更顺",
        icon: BrainCircuit,
    },
    {
        id: "nvidia" as const,
        label: "NVIDIA",
        detail: "可自选海量最新开源模型",
        icon: Sparkles,
    },
    {
        id: "github" as const,
        label: "GitHub Models",
        detail: "极速稳定的顶级大厂模型",
        icon: Github,
    },
];

const DEEPSEEK_MODEL_OPTIONS: Array<{
    id: DeepSeekModel;
    label: string;
    detail: string;
}> = [
    {
        id: "deepseek-v4-flash",
        label: "Flash",
        detail: "更快，更适合高频日常生成",
    },
    {
        id: "deepseek-v4-pro",
        label: "Pro",
        detail: "更稳，更适合复杂讲解和重任务",
    },
];

const DEEPSEEK_REASONING_OPTIONS: Array<{
    id: DeepSeekReasoningEffort;
    label: string;
    detail: string;
}> = [
    {
        id: "high",
        label: "High",
        detail: "标准深想，兼顾速度和质量",
    },
    {
        id: "max",
        label: "Max",
        detail: "推理拉满，速度更慢但更重思考",
    },
];

export function AiModelSettingsModal({ isOpen, onClose }: AiModelSettingsModalProps) {
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);

    const [aiProvider, setAiProvider] = useState<AiProvider>("deepseek");
    const [deepSeekApiKey, setDeepSeekApiKey] = useState("");
    const [deepSeekModel, setDeepSeekModel] = useState<DeepSeekModel>(DEFAULT_DEEPSEEK_MODEL);
    const [deepSeekThinkingMode, setDeepSeekThinkingMode] = useState<DeepSeekThinkingMode>(DEFAULT_DEEPSEEK_THINKING_MODE);
    const [deepSeekReasoningEffort, setDeepSeekReasoningEffort] = useState<DeepSeekReasoningEffort>(DEFAULT_DEEPSEEK_REASONING_EFFORT);
    const [glmApiKey, setGlmApiKey] = useState("");
    const [glmModel, setGlmModel] = useState(DEFAULT_GLM_MODEL);
    const [glmThinkingMode, setGlmThinkingMode] = useState<GlmThinkingMode>(DEFAULT_GLM_THINKING_MODE);
    const [nvidiaApiKey, setNvidiaApiKey] = useState("");
    const [nvidiaModel, setNvidiaModel] = useState("z-ai/glm-5.1");
    const [githubApiKey, setGithubApiKey] = useState("");
    const [githubModel, setGithubModel] = useState("openai/gpt-4.1");

    const [profileLoaded, setProfileLoaded] = useState(false);
    
    // UI state
    const [expandedCategory, setExpandedCategory] = useState<string | null>("china");
    const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
    const [connectionBusy, setConnectionBusy] = useState(false);
    const [aiSettingsMessage, setAiSettingsMessage] = useState<string | null>(null);
    const [githubModelsBusy, setGitHubModelsBusy] = useState(false);
    const [githubModelsError, setGitHubModelsError] = useState<string | null>(null);
    const [availableGitHubModels, setAvailableGitHubModels] = useState<Array<{
        id: string;
        name: string;
        publisher: string;
        summary: string;
        capabilities: string[];
        rateLimitTier: string;
    }>>([]);

    useEffect(() => {
        if (profile && !profileLoaded) {
            setAiProvider(normalizeAiProvider(profile.ai_provider));
            setDeepSeekApiKey("");
            setDeepSeekModel(normalizeProfileDeepSeekModel(profile.deepseek_model));
            setDeepSeekThinkingMode(normalizeProfileDeepSeekThinkingMode(profile.deepseek_thinking_mode));
            setDeepSeekReasoningEffort(normalizeProfileDeepSeekReasoningEffort(profile.deepseek_reasoning_effort));
            setGlmApiKey(profile.glm_api_key || "");
            setGlmModel(normalizeProfileGlmModel(profile.glm_model));
            setGlmThinkingMode(normalizeProfileGlmThinkingMode(profile.glm_thinking_mode));
            setNvidiaApiKey(profile.nvidia_api_key || "");
            setNvidiaModel(profile.nvidia_model || "z-ai/glm-5.1");
            setGithubApiKey("");
            setGithubModel(profile.github_model || "openai/gpt-4.1");
            setProfileLoaded(true);
        }
    }, [profile, profileLoaded]);

    useEffect(() => {
        setConnectionMessage(null);
    }, [aiProvider, deepSeekApiKey, deepSeekModel, deepSeekThinkingMode, deepSeekReasoningEffort, glmApiKey, glmModel, glmThinkingMode, nvidiaApiKey, nvidiaModel, githubApiKey, githubModel]);

    useEffect(() => {
        setAvailableGitHubModels([]);
        setGitHubModelsError(null);
    }, [githubApiKey]);

    useEffect(() => {
        if (!glmModelSupportsThinking(glmModel) && glmThinkingMode !== "off") {
            setGlmThinkingMode("off");
        }
    }, [glmModel, glmThinkingMode]);

    const activePayload = useMemo(() => ({
        ai_provider: aiProvider,
        deepseek_api_key: deepSeekApiKey,
        deepseek_model: deepSeekModel,
        deepseek_thinking_mode: deepSeekThinkingMode,
        deepseek_reasoning_effort: deepSeekReasoningEffort,
        glm_api_key: glmApiKey,
        glm_model: glmModel,
        glm_thinking_mode: glmThinkingMode,
        nvidia_api_key: nvidiaApiKey,
        nvidia_model: nvidiaModel,
        github_api_key: githubApiKey,
        github_model: githubModel,
    }), [aiProvider, deepSeekApiKey, deepSeekModel, deepSeekThinkingMode, deepSeekReasoningEffort, glmApiKey, glmModel, glmThinkingMode, nvidiaApiKey, nvidiaModel, githubApiKey, githubModel]);

    const payloadSignature = useMemo(() => JSON.stringify(activePayload), [activePayload]);
    const hasHydratedRef = useRef(false);
    const lastSavedSignatureRef = useRef(payloadSignature);

    useEffect(() => {
        if (!isOpen || !profileLoaded) return;
        
        if (!hasHydratedRef.current) {
            hasHydratedRef.current = true;
            lastSavedSignatureRef.current = payloadSignature;
            return;
        }

        if (payloadSignature === lastSavedSignatureRef.current) {
            return;
        }

        setAiSettingsMessage("Saving...");
        const timer = window.setTimeout(async () => {
            try {
                await saveProfilePatch(activePayload);
                lastSavedSignatureRef.current = payloadSignature;
                setAiSettingsMessage("Saved automatically");
            } catch (error) {
                setAiSettingsMessage(error instanceof Error ? error.message : "Failed to save");
            }
        }, 500);

        return () => window.clearTimeout(timer);
    }, [payloadSignature, activePayload, isOpen, profileLoaded]);

    const handleTestConnection = async () => {
        setConnectionBusy(true);
        setConnectionMessage(null);
        try {
            const authHeaders = await getBrowserSupabaseAuthHeaders();
            const response = await fetch("/api/profile/test-ai-provider", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                },
                body: JSON.stringify(activePayload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Connection test failed.");
            }
            setConnectionMessage(typeof data?.message === "string" ? data.message : "Connection OK.");
        } catch (error) {
            setConnectionMessage(error instanceof Error ? error.message : "Connection test failed.");
        } finally {
            setConnectionBusy(false);
        }
    };

    const handleOpenGitHubModelPicker = async () => {
        setGitHubModelsError(null);

        if (availableGitHubModels.length > 0) {
            return;
        }

        setGitHubModelsBusy(true);
        try {
            const authHeaders = await getBrowserSupabaseAuthHeaders();
            const response = await fetch("/api/profile/github-models", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                },
                body: JSON.stringify({ github_api_key: githubApiKey }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "获取 GitHub 模型列表失败。");
            }

            const models = Array.isArray(data?.models)
                ? data.models.filter((item: unknown): item is {
                    id: string;
                    name: string;
                    publisher: string;
                    summary: string;
                    capabilities: string[];
                    rateLimitTier: string;
                } => Boolean(
                    item
                    && typeof item === "object"
                    && typeof (item as { id?: unknown }).id === "string"
                    && typeof (item as { name?: unknown }).name === "string"
                    && typeof (item as { publisher?: unknown }).publisher === "string",
                ))
                : [];

            setAvailableGitHubModels(models);
        } catch (error) {
            setGitHubModelsError(error instanceof Error ? error.message : "获取 GitHub 模型列表失败。");
        } finally {
            setGitHubModelsBusy(false);
        }
    };

    const selectedGlmModel = useMemo<GlmModelSummary>(() => {
        return GLM_MODEL_LIBRARY.find((model) => model.id === glmModel) ?? GLM_MODEL_LIBRARY[0];
    }, [glmModel]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                animate={{ opacity: 1, backdropFilter: "blur(4px)" }}
                exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                role="dialog"
                className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/20 p-4 sm:p-6"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 10 }}
                    transition={{ type: "spring" as const, stiffness: 450, damping: 30 }}
                    className="relative flex w-full max-w-2xl max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-theme-border/50 bg-theme-base-bg shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex shrink-0 items-center justify-between border-b border-theme-border/30 bg-theme-card-bg/50 px-6 py-4 backdrop-blur-md">
                        <div>
                            <h2 className="text-xl font-semibold text-theme-text flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-indigo-500" />
                                AI 模型配置
                            </h2>
                            <p className="mt-1 text-[13px] text-theme-text-muted">
                                选择首选的推理引擎，配置会自动同步到您的所有设备上。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-theme-text-muted hover:bg-theme-border/40 hover:text-theme-text transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        {!profileLoaded ? (
                            <div className="flex h-32 items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-theme-text-muted" />
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {/* Provider Selection */}
                                <div className="space-y-3">
                                    <label className="text-xs font-semibold uppercase tracking-widest text-theme-text-muted/80 ml-1">
                                        Provider
                                    </label>
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        {PROVIDERS.map((provider) => {
                                            const Icon = provider.icon;
                                            const isActive = aiProvider === provider.id;
                                            return (
                                                <button
                                                    key={provider.id}
                                                    type="button"
                                                    onClick={() => setAiProvider(provider.id)}
                                                    className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
                                                        isActive 
                                                            ? "border-indigo-500 bg-indigo-50/50 shadow-sm" 
                                                            : "border-theme-border/60 bg-theme-card-bg hover:border-indigo-300 hover:bg-theme-base-bg"
                                                    }`}
                                                >
                                                    <div className={`flex items-center gap-2 ${isActive ? "text-indigo-700" : "text-theme-text"}`}>
                                                        <Icon className="h-4 w-4" />
                                                        <span className="font-semibold text-[14px]">
                                                            {provider.label}
                                                        </span>
                                                    </div>
                                                    <p className={`text-[12px] leading-relaxed ${isActive ? "text-indigo-600/80" : "text-theme-text-muted"}`}>
                                                        {provider.detail}
                                                    </p>
                                                    {isActive && (
                                                        <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-indigo-500" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Active Configuration Area */}
                                <div className="space-y-4 rounded-xl border border-theme-border/40 bg-theme-card-bg/30 p-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-semibold uppercase tracking-widest text-theme-text-muted/80">
                                            {aiProvider} Configuration
                                        </label>
                                        <div className="flex items-center gap-3">
                                            {aiSettingsMessage && (
                                                <span className="text-[11px] font-medium text-theme-text-muted animate-pulse">
                                                    {aiSettingsMessage}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {aiProvider === "deepseek" && (
                                        <div className="space-y-5">
                                            <div className="space-y-1.5">
                                                <input
                                                    type="password"
                                                    name="deepseek_api_key_override"
                                                    autoComplete="new-password"
                                                    data-1p-ignore="true"
                                                    data-lpignore="true"
                                                    spellCheck={false}
                                                    value={deepSeekApiKey}
                                                    onChange={(e) => setDeepSeekApiKey(e.target.value)}
                                                    placeholder="Using server DEEPSEEK_API_KEY"
                                                    className="w-full rounded-lg border border-theme-border/60 bg-theme-base-bg px-3 py-2.5 text-[14px] text-theme-text placeholder:text-theme-text-muted/50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                                />
                                                <p className="px-1 text-[12px] text-theme-text-muted/80">
                                                    留空时使用服务器环境变量，需要临时覆盖时再手动粘贴 Key。
                                                </p>
                                            </div>

                                            <div className="space-y-3">
                                                <div className="text-[11px] font-semibold uppercase tracking-widest text-theme-text-muted/80">
                                                    Model Tier
                                                </div>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {DEEPSEEK_MODEL_OPTIONS.map((option) => {
                                                        const active = deepSeekModel === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => setDeepSeekModel(option.id)}
                                                                className={`rounded-xl border p-3 text-left transition-all ${
                                                                    active
                                                                        ? "border-indigo-500 bg-indigo-50/60 shadow-sm"
                                                                        : "border-theme-border/60 bg-theme-card-bg hover:border-indigo-300 hover:bg-theme-base-bg"
                                                                }`}
                                                            >
                                                                <div className={`text-[13px] font-semibold ${active ? "text-indigo-700" : "text-theme-text"}`}>
                                                                    {option.label}
                                                                </div>
                                                                <p className={`mt-1 text-[11px] leading-relaxed ${active ? "text-indigo-600/80" : "text-theme-text-muted"}`}>
                                                                    {option.detail}
                                                                </p>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-theme-border/50 bg-theme-base-bg/60 p-4">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <div className="text-[13px] font-semibold text-theme-text">
                                                            Deep Thinking
                                                        </div>
                                                        <p className="mt-1 text-[11px] leading-relaxed text-theme-text-muted">
                                                            关闭时更快；开启后全局走 DeepSeek Thinking，并使用下面的推理强度。
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeepSeekThinkingMode((current) => current === "on" ? "off" : "on")}
                                                        className={`relative h-7 w-12 rounded-full border transition ${
                                                            deepSeekThinkingMode === "on"
                                                                ? "border-emerald-500 bg-emerald-500"
                                                                : "border-theme-border/60 bg-theme-card-bg"
                                                        }`}
                                                        aria-pressed={deepSeekThinkingMode === "on"}
                                                    >
                                                        <span
                                                            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                                                                deepSeekThinkingMode === "on" ? "left-6" : "left-1"
                                                            }`}
                                                        />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className={`space-y-3 transition-opacity ${deepSeekThinkingMode === "on" ? "opacity-100" : "opacity-50"}`}>
                                                <div className="text-[11px] font-semibold uppercase tracking-widest text-theme-text-muted/80">
                                                    Reasoning Effort
                                                </div>
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {DEEPSEEK_REASONING_OPTIONS.map((option) => {
                                                        const active = deepSeekReasoningEffort === option.id;
                                                        return (
                                                            <button
                                                                key={option.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    if (deepSeekThinkingMode === "on") {
                                                                        setDeepSeekReasoningEffort(option.id);
                                                                    }
                                                                }}
                                                                disabled={deepSeekThinkingMode !== "on"}
                                                                className={`rounded-xl border p-3 text-left transition-all ${
                                                                    active
                                                                        ? "border-emerald-500 bg-emerald-50/60 shadow-sm"
                                                                        : "border-theme-border/60 bg-theme-card-bg hover:border-emerald-300 hover:bg-theme-base-bg"
                                                                } disabled:cursor-not-allowed`}
                                                            >
                                                                <div className={`text-[13px] font-semibold ${active ? "text-emerald-700" : "text-theme-text"}`}>
                                                                    {option.label}
                                                                </div>
                                                                <p className={`mt-1 text-[11px] leading-relaxed ${active ? "text-emerald-600/80" : "text-theme-text-muted"}`}>
                                                                    {option.detail}
                                                                </p>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {aiProvider === "glm" && (
                                        <div className="space-y-5">
                                            <div className="space-y-1.5">
                                                <input
                                                    type="password"
                                                    name="glm_api_key_override"
                                                    autoComplete="new-password"
                                                    data-1p-ignore="true"
                                                    data-lpignore="true"
                                                    spellCheck={false}
                                                    value={glmApiKey}
                                                    onChange={(e) => setGlmApiKey(e.target.value)}
                                                    placeholder="Using server GLM_API_KEY"
                                                    className="w-full rounded-lg border border-theme-border/60 bg-theme-base-bg px-3 py-2.5 text-[14px] text-theme-text placeholder:text-theme-text-muted/50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                                />
                                                <p className="px-1 text-[12px] text-theme-text-muted/80">
                                                    直接选模型即可；这里不填时会使用服务器 GLM_API_KEY。
                                                </p>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <div className="text-[11px] font-semibold uppercase tracking-widest text-theme-text-muted/80">
                                                            GLM 模型
                                                        </div>
                                                        <span className="text-[11px] text-theme-text-muted">
                                                            只保留当前常用 4 个
                                                        </span>
                                                    </div>
                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        {GLM_MODEL_LIBRARY.map((model) => {
                                                            const active = glmModel === model.id;
                                                            return (
                                                                <button
                                                                    key={model.id}
                                                                    type="button"
                                                                    aria-pressed={active}
                                                                    data-glm-model={model.id}
                                                                    onClick={() => {
                                                                        setGlmModel(model.id);
                                                                        if (!model.supportsThinking) {
                                                                            setGlmThinkingMode("off");
                                                                        }
                                                                    }}
                                                                    className={`rounded-xl border p-3 text-left transition-all ${
                                                                        active
                                                                            ? "border-indigo-500 bg-indigo-50/60 shadow-sm"
                                                                            : "border-theme-border/60 bg-theme-card-bg hover:border-indigo-300 hover:bg-theme-base-bg"
                                                                    }`}
                                                                >
                                                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                                                        <div>
                                                                            <div className={`text-[13px] font-semibold ${active ? "text-indigo-700" : "text-theme-text"}`}>
                                                                                {model.name}
                                                                            </div>
                                                                            <code className="mt-1 block text-[11px] text-theme-text/70">
                                                                                {model.id}
                                                                            </code>
                                                                        </div>
                                                                        {model.recommendedFor ? (
                                                                            <span className="rounded-md bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">
                                                                                {model.recommendedFor}
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                    <p className={`mt-2 text-[12px] leading-relaxed ${active ? "text-indigo-700/75" : "text-theme-text-muted"}`}>
                                                                        {model.summary}
                                                                    </p>
                                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                                        <span className="rounded-md border border-theme-border/40 px-2 py-1 text-[10px] font-semibold text-theme-text">
                                                                            上下文 {model.contextWindow}
                                                                        </span>
                                                                        <span className="rounded-md border border-theme-border/40 px-2 py-1 text-[10px] font-semibold text-theme-text">
                                                                            最大输出 {model.maxOutputTokens}
                                                                        </span>
                                                                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                                                            支持深度思考
                                                                        </span>
                                                                    </div>
                                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                                        {model.capabilities.map((capability) => (
                                                                            <span
                                                                                key={`${model.id}-${capability}`}
                                                                                className="rounded-full bg-theme-base-bg px-2 py-1 text-[10px] font-medium text-theme-text-muted"
                                                                            >
                                                                                {capability}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                <div className="rounded-xl border border-theme-border/50 bg-theme-base-bg/60 p-4">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <div className="text-[13px] font-semibold text-theme-text">
                                                                深度思考
                                                            </div>
                                                            <p className="mt-1 text-[11px] leading-relaxed text-theme-text-muted">
                                                                {selectedGlmModel.thinkingLabel}
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            aria-label="GLM Deep Thinking"
                                                            aria-pressed={glmThinkingMode === "on"}
                                                            disabled={!glmModelSupportsThinking(selectedGlmModel.id)}
                                                            onClick={() => {
                                                                if (!glmModelSupportsThinking(selectedGlmModel.id)) {
                                                                    return;
                                                                }
                                                                setGlmThinkingMode((current) => current === "on" ? "off" : "on");
                                                            }}
                                                            className={`relative h-7 w-12 rounded-full border transition ${
                                                                glmThinkingMode === "on" && glmModelSupportsThinking(selectedGlmModel.id)
                                                                    ? "border-emerald-500 bg-emerald-500"
                                                                    : "border-theme-border/60 bg-theme-card-bg"
                                                            } disabled:cursor-not-allowed disabled:opacity-50`}
                                                        >
                                                            <span
                                                                className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                                                                    glmThinkingMode === "on" && glmModelSupportsThinking(selectedGlmModel.id) ? "left-6" : "left-1"
                                                                }`}
                                                            />
                                                        </button>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-theme-text-muted">
                                                        <span className="rounded-full bg-theme-card-bg px-2 py-1 font-medium text-theme-text">
                                                            当前：{selectedGlmModel.name}
                                                        </span>
                                                        <span>
                                                            {glmModelSupportsThinking(selectedGlmModel.id)
                                                                ? `已${glmThinkingMode === "on" ? "开启" : "关闭"}深度思考`
                                                                : "当前模型不支持深度思考开关"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {aiProvider === "nvidia" && (
                                        <div className="space-y-6">
                                            <div className="space-y-1.5">
                                                <input
                                                    type="password"
                                                    name="nvidia_api_key_override"
                                                    autoComplete="new-password"
                                                    data-1p-ignore="true"
                                                    data-lpignore="true"
                                                    spellCheck={false}
                                                    value={nvidiaApiKey}
                                                    onChange={(e) => setNvidiaApiKey(e.target.value)}
                                                    placeholder="API Key (nvapi-...)"
                                                    className="w-full rounded-lg border border-theme-border/60 bg-theme-base-bg px-3 py-2.5 text-[14px] text-theme-text placeholder:text-theme-text-muted/50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                                />
                                            </div>

                                            <div className="space-y-3">
                                                {NVIDIA_CATEGORIES.map(cat => (
                                                    <div key={cat.id} className="rounded-xl border border-theme-border/50 bg-theme-base-bg overflow-hidden flex flex-col mb-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                                                            className="flex items-center justify-between p-3.5 hover:bg-theme-card-bg transition-colors"
                                                        >
                                                            <div className="flex flex-col items-start gap-1">
                                                                <span className="font-semibold text-[14px] text-theme-text">{cat.name}</span>
                                                                <span className="text-[12px] text-theme-text-muted">{cat.desc}</span>
                                                            </div>
                                                            <ChevronDown className={`h-4 w-4 text-theme-text-muted transition-transform duration-200 ${expandedCategory === cat.id ? "rotate-180" : ""}`} />
                                                        </button>
                                                        
                                                        <AnimatePresence>
                                                            {expandedCategory === cat.id && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="border-t border-theme-border/30 bg-theme-base-bg/50"
                                                                >
                                                                    <div className="grid gap-2 sm:grid-cols-2 p-3">
                                                                        {cat.models.map(model => (
                                                                            <button
                                                                                key={model.id}
                                                                                type="button"
                                                                                onClick={() => setNvidiaModel(model.id)}
                                                                                className={`relative flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all ${
                                                                                    nvidiaModel === model.id
                                                                                        ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                                                                                        : "border-theme-border/60 bg-theme-card-bg hover:border-emerald-300 hover:bg-theme-base-bg"
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center justify-between w-full">
                                                                                    <span className={`font-semibold text-[13px] ${nvidiaModel === model.id ? "text-emerald-700" : "text-theme-text"}`}>
                                                                                        {model.label}
                                                                                    </span>
                                                                                    {model.tag && (
                                                                                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 shrink-0">
                                                                                            {model.tag}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className={`text-[11px] leading-relaxed ${nvidiaModel === model.id ? "text-emerald-600/80" : "text-theme-text-muted"}`}>
                                                                                    {model.note}
                                                                                </p>
                                                                                {nvidiaModel === model.id && (
                                                                                    <div className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                                )}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                ))}

                                                <div className="space-y-1.5 pt-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={nvidiaModel}
                                                            onChange={(e) => setNvidiaModel(e.target.value)}
                                                            placeholder="Custom model ID (e.g. your-custom-model)"
                                                            className="flex-1 rounded-lg border border-theme-border/60 bg-theme-base-bg px-3 py-2 text-[13px] text-theme-text placeholder:text-theme-text-muted/50 focus:border-indigo-500 focus:outline-none transition-all font-mono"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {aiProvider === "github" && (
                                        <div className="space-y-6">
                                            <div className="space-y-1.5">
                                                <input
                                                    type="password"
                                                    name="github_api_key_override"
                                                    autoComplete="new-password"
                                                    data-1p-ignore="true"
                                                    data-lpignore="true"
                                                    spellCheck={false}
                                                    value={githubApiKey}
                                                    onChange={(e) => setGithubApiKey(e.target.value)}
                                                    placeholder="Using server GITHUB_MODELS_API_KEY"
                                                    className="w-full rounded-lg border border-theme-border/60 bg-theme-base-bg px-3 py-2.5 text-[14px] text-theme-text placeholder:text-theme-text-muted/50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                                                />
                                                <p className="px-1 text-[11px] font-medium text-theme-text-muted">
                                                    留空时使用服务器环境变量，需要临时覆盖时再手动粘贴 PAT。
                                                </p>
                                            </div>

                                            <div className="space-y-3">
                                                {VERIFIED_GITHUB_MODEL_CATEGORIES.map(cat => (
                                                    <div key={cat.id} className="rounded-xl border border-theme-border/40 bg-theme-base-bg/50 overflow-hidden">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedCategory(expandedCategory === cat.id ? null : cat.id)}
                                                            className="flex w-full items-center justify-between p-3.5 hover:bg-theme-active-hover transition-colors text-left"
                                                        >
                                                            <div className="flex flex-col gap-1">
                                                                <span className="font-bold text-[14px] text-theme-text">{cat.name}</span>
                                                                <span className="text-[12px] text-theme-text-muted">{cat.desc}</span>
                                                            </div>
                                                            <ChevronDown className={`h-4 w-4 text-theme-text-muted transition-transform duration-200 ${expandedCategory === cat.id ? "rotate-180" : ""}`} />
                                                        </button>
                                                        
                                                        <AnimatePresence>
                                                            {expandedCategory === cat.id && (
                                                                <motion.div
                                                                    initial={{ height: 0, opacity: 0 }}
                                                                    animate={{ height: "auto", opacity: 1 }}
                                                                    exit={{ height: 0, opacity: 0 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="border-t border-theme-border/30 bg-theme-base-bg/50"
                                                                >
                                                                    <div className="grid gap-2 sm:grid-cols-2 p-3">
                                                                        {cat.models.map(model => (
                                                                            <button
                                                                                key={model.id}
                                                                                type="button"
                                                                                onClick={() => setGithubModel(model.id)}
                                                                                className={`relative flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all ${
                                                                                    githubModel === model.id
                                                                                        ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                                                                                        : "border-theme-border/60 bg-theme-card-bg hover:border-emerald-300 hover:bg-theme-base-bg"
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center justify-between w-full">
                                                                                    <span className={`font-semibold text-[13px] ${githubModel === model.id ? "text-emerald-700" : "text-theme-text"}`}>
                                                                                        {model.label}
                                                                                    </span>
                                                                                    {model.tag && (
                                                                                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 shrink-0">
                                                                                            {model.tag}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className={`text-[11px] leading-relaxed ${githubModel === model.id ? "text-emerald-600/80" : "text-theme-text-muted"}`}>
                                                                                    {model.note}
                                                                                </p>
                                                                                {githubModel === model.id && (
                                                                                    <div className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                                                )}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                ))}

                                                <div className="space-y-1.5 pt-2">
                                                    <div className="flex gap-2">
                                                        <input
                                                            value={githubModel}
                                                            onChange={(e) => setGithubModel(e.target.value)}
                                                            placeholder="Custom model ID (e.g. openai/gpt-4.1)"
                                                            className="flex-1 rounded-lg border border-theme-border/60 bg-theme-base-bg px-3 py-2 text-[13px] text-theme-text placeholder:text-theme-text-muted/50 focus:border-indigo-500 focus:outline-none transition-all font-mono"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleOpenGitHubModelPicker}
                                                        disabled={githubModelsBusy}
                                                        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-theme-border/60 bg-theme-base-bg px-4 text-[13px] font-medium text-theme-text hover:bg-theme-card-bg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                    >
                                                        {githubModelsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                                        查看当前可用模型
                                                    </button>
                                                    {githubModelsError ? (
                                                        <p className="text-[12px] font-medium text-rose-500">
                                                            {githubModelsError}
                                                        </p>
                                                    ) : null}
                                                    {availableGitHubModels.length > 0 ? (
                                                        <div className="grid max-h-80 gap-2 overflow-y-auto rounded-lg border border-theme-border/30 bg-theme-base-bg/50 p-3 sm:grid-cols-2">
                                                            {availableGitHubModels.map((model) => (
                                                                <button
                                                                    key={model.id}
                                                                    type="button"
                                                                    onClick={() => setGithubModel(model.id)}
                                                                    className={`relative flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all ${
                                                                        githubModel === model.id
                                                                            ? "border-emerald-500 bg-emerald-50/50 shadow-sm"
                                                                            : "border-theme-border/60 bg-theme-card-bg hover:border-emerald-300 hover:bg-theme-base-bg"
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between w-full gap-3">
                                                                        <span className={`font-semibold text-[13px] ${githubModel === model.id ? "text-emerald-700" : "text-theme-text"}`}>
                                                                            {model.name}
                                                                        </span>
                                                                        <span className="shrink-0 text-[10px] font-bold uppercase text-theme-text-muted">
                                                                            {model.publisher}
                                                                        </span>
                                                                    </div>
                                                                    <p className={`text-[11px] leading-relaxed ${githubModel === model.id ? "text-emerald-600/80" : "text-theme-text-muted"}`}>
                                                                        {model.summary || "GitHub catalog 返回的可用聊天模型"}
                                                                    </p>
                                                                    <code className={`text-[10px] ${githubModel === model.id ? "text-emerald-700/90" : "text-theme-text/70"}`}>
                                                                        {model.id}
                                                                    </code>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            disabled={connectionBusy}
                                            onClick={handleTestConnection}
                                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-theme-border/60 bg-theme-base-bg px-4 text-[13px] font-medium text-theme-text hover:bg-theme-card-bg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {connectionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                            Test Connection
                                        </button>
                                        {connectionMessage && (
                                            <p className={`mt-2 text-[12px] mb-1 font-medium ${connectionMessage.includes('failed') ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                {connectionMessage}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
