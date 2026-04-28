export interface GlmParameterHint {
    id: string;
    label: string;
    note: string;
}

export interface GlmModelSummary {
    id: string;
    name: string;
    summary: string;
    contextWindow: string;
    maxOutputTokens: string;
    capabilities: string[];
    parameters: string[];
    recommendedFor?: string;
    supportsThinking: boolean;
    thinkingLabel: string;
    tier: "current" | "legacy";
}

type GlmModelMetadata = Omit<GlmModelSummary, "id" | "name">;

export const GLM_SHARED_PARAMETER_HINTS: GlmParameterHint[] = [
    { id: "temperature", label: "temperature", note: "控制发散度，越高越活。"},
    { id: "top_p", label: "top_p", note: "核采样阈值，和 temperature 二选一微调更稳。"},
    { id: "max_tokens", label: "max_tokens", note: "限制最大输出长度。"},
    { id: "stream", label: "stream", note: "开启流式返回，侧栏回答会更快开始出字。"},
    { id: "tools", label: "tools", note: "函数调用 / 工具调用入口。"},
    { id: "thinking.type", label: "thinking.type", note: "支持思考型模型时可显式开关深度思考。"},
];

const GLM_MODEL_METADATA: Record<string, GlmModelMetadata> = {
    "glm-5.1": {
        summary: "当前官方最新旗舰，通用写作、代码、长上下文和深度思考都最稳。",
        contextWindow: "200K",
        maxOutputTokens: "128K",
        capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "复杂讲解、长文分析、主力默认位",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-5": {
        summary: "GLM 5 标准旗舰，适合把质量放在第一位的综合任务。",
        contextWindow: "200K",
        maxOutputTokens: "128K",
        capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "旗舰通用聊天、重任务生成",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-5-turbo": {
        summary: "GLM 5 的更快更轻版本，适合高频对话和低延迟问答。",
        contextWindow: "128K",
        maxOutputTokens: "64K",
        capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "快响应、成本敏感、高频问答",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-4.7": {
        summary: "4.x 线里的高阶旗舰，长上下文和多步骤思考依然很能打。",
        contextWindow: "200K",
        maxOutputTokens: "128K",
        capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "长文拆解、复杂推理、旧链路平替",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-4.7-flash": {
        summary: "4.7 的高效 Flash 版，适合日常阅读问答、快速解释和较低延迟交互。",
        contextWindow: "200K",
        maxOutputTokens: "128K",
        capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "快响应、低成本、日常主力",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-4.6": {
        summary: "4.6 是 4.x 稳定旗舰，适合想要老牌稳定感的场景。",
        contextWindow: "200K",
        maxOutputTokens: "128K",
        capabilities: ["混合思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "稳定通用、保守升级",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-4.5": {
        summary: "4.5 首次把深度思考做得更完整，适合需要推理展开的任务。",
        contextWindow: "128K",
        maxOutputTokens: "96K",
        capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "推理展开、详细解释",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-4.5-air": {
        summary: "4.5 Air 是轻量高性价比版，适合速度优先的日常任务。",
        contextWindow: "128K",
        maxOutputTokens: "96K",
        capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
        recommendedFor: "日常对话、较低成本、快节奏交互",
        supportsThinking: true,
        thinkingLabel: "支持 thinking.type 开关",
        tier: "current",
    },
    "glm-4-flash": {
        summary: "经典轻量聊天模型，回得快，适合保守兼容旧链路。",
        contextWindow: "128K",
        maxOutputTokens: "16K",
        capabilities: ["流式输出", "工具调用"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools"],
        recommendedFor: "兼容旧默认、速度优先",
        supportsThinking: false,
        thinkingLabel: "不支持深度思考开关",
        tier: "legacy",
    },
    "glm-4-air": {
        summary: "更轻量的 4.x 通用模型，适合旧版低延迟交互。",
        contextWindow: "128K",
        maxOutputTokens: "16K",
        capabilities: ["流式输出", "工具调用"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools"],
        supportsThinking: false,
        thinkingLabel: "不支持深度思考开关",
        tier: "legacy",
    },
    "glm-4-plus": {
        summary: "旧版更强通用模型，质量比 flash/air 稳一些。",
        contextWindow: "128K",
        maxOutputTokens: "16K",
        capabilities: ["流式输出", "工具调用"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools"],
        supportsThinking: false,
        thinkingLabel: "不支持深度思考开关",
        tier: "legacy",
    },
    "glm-4-long": {
        summary: "老牌长上下文型号，主要用于兼容旧提示链路。",
        contextWindow: "1M",
        maxOutputTokens: "16K",
        capabilities: ["长上下文", "流式输出"],
        parameters: ["temperature", "top_p", "max_tokens", "stream"],
        supportsThinking: false,
        thinkingLabel: "不支持深度思考开关",
        tier: "legacy",
    },
    "glm-4v-flash": {
        summary: "旧版轻量视觉模型，保留给兼容场景。",
        contextWindow: "128K",
        maxOutputTokens: "16K",
        capabilities: ["视觉理解", "流式输出"],
        parameters: ["temperature", "top_p", "max_tokens", "stream"],
        supportsThinking: false,
        thinkingLabel: "不支持深度思考开关",
        tier: "legacy",
    },
    "glm-z1-flash": {
        summary: "旧版推理 flash，默认就偏重思考展开，不再推荐做主力。",
        contextWindow: "128K",
        maxOutputTokens: "32K",
        capabilities: ["推理输出", "流式输出"],
        parameters: ["temperature", "top_p", "max_tokens", "stream"],
        supportsThinking: false,
        thinkingLabel: "旧版推理模型，不走新的深度思考开关",
        tier: "legacy",
    },
    "glm-z1-air": {
        summary: "旧版轻量推理模型，适合作为历史兼容备选。",
        contextWindow: "128K",
        maxOutputTokens: "32K",
        capabilities: ["推理输出", "流式输出"],
        parameters: ["temperature", "top_p", "max_tokens", "stream"],
        supportsThinking: false,
        thinkingLabel: "旧版推理模型，不走新的深度思考开关",
        tier: "legacy",
    },
    "glm-4-flash-250414": {
        summary: "flash 的日期版别名，保留给旧项目兼容。",
        contextWindow: "128K",
        maxOutputTokens: "16K",
        capabilities: ["流式输出", "工具调用"],
        parameters: ["temperature", "top_p", "max_tokens", "stream", "tools"],
        supportsThinking: false,
        thinkingLabel: "不支持深度思考开关",
        tier: "legacy",
    },
};

function toModelName(id: string) {
    return id.toUpperCase().replace(/^GLM/, "GLM");
}

export function buildGlmModelSummaries(rawModelIds: string[]) {
    return rawModelIds.map((id) => {
        const normalizedId = id.trim();
        const meta = GLM_MODEL_METADATA[normalizedId];

        return {
            id: normalizedId,
            name: toModelName(normalizedId),
            summary: meta?.summary ?? "当前 key 官方枚举出的可用 GLM 模型。",
            contextWindow: meta?.contextWindow ?? "官方未标注",
            maxOutputTokens: meta?.maxOutputTokens ?? "官方未标注",
            capabilities: meta?.capabilities ?? ["流式输出"],
            parameters: meta?.parameters ?? ["temperature", "top_p", "max_tokens", "stream"],
            recommendedFor: meta?.recommendedFor,
            supportsThinking: meta?.supportsThinking ?? false,
            thinkingLabel: meta?.thinkingLabel ?? "参数能力未标注",
            tier: meta?.tier ?? "current",
        } satisfies GlmModelSummary;
    });
}

export const GLM_MODEL_LIBRARY: GlmModelSummary[] = [
    "glm-5.1",
    "glm-5",
    "glm-4.7",
    "glm-4.7-flash",
].map((id) => buildGlmModelSummaries([id])[0]);

export function glmModelSupportsThinking(modelId?: string | null) {
    const normalizedId = modelId?.trim();
    return GLM_MODEL_LIBRARY.find((model) => model.id === normalizedId)?.supportsThinking ?? false;
}
