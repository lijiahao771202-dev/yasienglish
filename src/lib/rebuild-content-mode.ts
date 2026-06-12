export type RebuildContentMode = "dialogue" | "blog" | "article" | "news" | "lecture";

export const DEFAULT_REBUILD_CONTENT_MODE: RebuildContentMode = "dialogue";

export const REBUILD_CONTENT_MODE_OPTIONS: Array<{
    value: RebuildContentMode;
    label: string;
    shortLabel: string;
    description: string;
}> = [
    {
        value: "dialogue",
        label: "对话",
        shortLabel: "对话",
        description: "保留当前生活对话题感，像真实交流里说出的一句话。",
    },
    {
        value: "blog",
        label: "博客",
        shortLabel: "博客",
        description: "第一人称或观察式表达，更像个人博客里的自然句子。",
    },
    {
        value: "article",
        label: "文章",
        shortLabel: "文章",
        description: "说明、观点或评论型表达，减少日常寒暄感。",
    },
    {
        value: "news",
        label: "新闻",
        shortLabel: "新闻",
        description: "客观报道式句子，聚焦事件、原因和影响。",
    },
    {
        value: "lecture",
        label: "讲解",
        shortLabel: "讲解",
        description: "课堂或播客讲解式表达，适合听结构和逻辑关系。",
    },
];

const REBUILD_CONTENT_MODE_SET = new Set<RebuildContentMode>(
    REBUILD_CONTENT_MODE_OPTIONS.map((option) => option.value),
);

export function normalizeRebuildContentMode(value: unknown): RebuildContentMode {
    return REBUILD_CONTENT_MODE_SET.has(value as RebuildContentMode)
        ? value as RebuildContentMode
        : DEFAULT_REBUILD_CONTENT_MODE;
}

export function getRebuildContentModeLabel(mode: RebuildContentMode) {
    return REBUILD_CONTENT_MODE_OPTIONS.find((option) => option.value === mode)?.label
        ?? REBUILD_CONTENT_MODE_OPTIONS[0].label;
}

export function getRebuildContentModePrompt(mode: RebuildContentMode) {
    switch (mode) {
        case "blog":
            return [
                "Content mode: personal blog / reflective post.",
                "- Write a sentence that could naturally appear in a concise blog paragraph.",
                "- Prefer first-person reflection, observation, or lived experience.",
                "- Avoid direct dialogue replies, customer-service exchanges, and role-play.",
                "- Keep it spoken-readable for listening, but not chatty.",
            ].join("\n");
        case "article":
            return [
                "Content mode: article / opinion explainer.",
                "- Write a sentence that could appear in a general-interest article.",
                "- Prefer explanatory, analytical, or lightly argumentative framing.",
                "- Avoid direct dialogue replies and daily errand situations.",
                "- Keep the language natural aloud, not academic or stiff.",
            ].join("\n");
        case "news":
            return [
                "Content mode: news brief.",
                "- Write a sentence that sounds like a concise news or report line.",
                "- Prefer event, cause, consequence, and public-facing information.",
                "- Avoid personal chat, customer-service exchanges, and invented sensational drama.",
                "- Keep it clear and listenable rather than headline-like.",
            ].join("\n");
        case "lecture":
            return [
                "Content mode: lecture / podcast explainer.",
                "- Write a sentence a teacher, host, or explainer might say while unpacking an idea.",
                "- Prefer logical connectors, definitions, examples, or cause-effect relations.",
                "- Avoid direct dialogue replies and casual scheduling language.",
                "- Keep it natural for listening practice, not a textbook fragment.",
            ].join("\n");
        case "dialogue":
        default:
            return [
                "Content mode: everyday dialogue.",
                "- Preserve the current Rebuild feel: a natural sentence someone might say in a real interaction.",
                "- Use practical context, mild human friction, and spoken phrasing.",
                "- Avoid sounding like an essay title, blog headline, or formal article.",
            ].join("\n");
    }
}
