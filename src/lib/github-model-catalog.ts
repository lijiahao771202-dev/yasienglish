export interface GitHubModelPreset {
    id: string;
    label: string;
    note: string;
    tag?: string;
}

export interface GitHubModelCategory {
    id: string;
    name: string;
    desc: string;
    models: GitHubModelPreset[];
}

export const VERIFIED_GITHUB_MODEL_CATEGORIES: GitHubModelCategory[] = [
    {
        id: "openai",
        name: "OpenAI",
        desc: "当前账号下最稳的通用聊天与写作模型。",
        models: [
            { id: "openai/gpt-4.1", label: "GPT-4.1", note: "代码、长上下文、指令跟随都很稳。", tag: "推荐" },
            { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", note: "速度更快，适合日常大多数场景。" },
            { id: "openai/gpt-4.1-nano", label: "GPT-4.1 Nano", note: "极轻量，适合简单补全和低成本调用。" },
            { id: "openai/gpt-4o", label: "GPT-4o", note: "多模态旗舰，泛用性强。" },
            { id: "openai/gpt-4o-mini", label: "GPT-4o Mini", note: "便宜、快、稳定，适合高频生成。" },
        ],
    },
    {
        id: "xai",
        name: "xAI",
        desc: "你账号已验证可用的 Grok 系列。",
        models: [
            { id: "xai/grok-3", label: "Grok 3", note: "更强的综合回答和推理能力。" },
            { id: "xai/grok-3-mini", label: "Grok 3 Mini", note: "轻量更快，适合高频对话。", tag: "可用" },
        ],
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        desc: "偏中文理解、结构化输出和解释类任务。",
        models: [
            { id: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528", note: "推理型，适合复杂分析。" },
            { id: "deepseek/deepseek-v3-0324", label: "DeepSeek V3 0324", note: "综合更均衡，生成风格稳定。" },
        ],
    },
    {
        id: "meta",
        name: "Meta",
        desc: "开源大模型备选，英文和通用问答表现稳。",
        models: [
            { id: "meta/llama-3.2-11b-vision-instruct", label: "Llama 3.2 11B Vision", note: "轻量多模态版本，响应快。" },
            { id: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B Instruct", note: "开源通用强项，适合大多数文本任务。" },
            { id: "meta/meta-llama-3.1-405b-instruct", label: "Llama 3.1 405B Instruct", note: "大参数版本，复杂任务更稳。" },
        ],
    },
    {
        id: "cohere",
        name: "Cohere",
        desc: "偏企业问答和长文本助手风格。",
        models: [
            { id: "cohere/cohere-command-a", label: "Command A", note: "新一代通用模型，回答稳定。" },
            { id: "cohere/cohere-command-r-08-2024", label: "Command R", note: "检索增强和知识问答表现不错。" },
        ],
    },
    {
        id: "mistral",
        name: "Mistral",
        desc: "偏速度和工程实用性，适合代码与工具型调用。",
        models: [
            { id: "mistral-ai/codestral-2501", label: "Codestral 2501", note: "代码相关任务更合适。" },
            { id: "mistral-ai/ministral-3b", label: "Ministral 3B", note: "轻量快速，适合小任务。" },
            { id: "mistral-ai/mistral-medium-2505", label: "Mistral Medium 2505", note: "综合能力更强，质量稳定。" },
            { id: "mistral-ai/mistral-small-2503", label: "Mistral Small 2503", note: "速度和效果平衡得更好。" },
        ],
    },
];
