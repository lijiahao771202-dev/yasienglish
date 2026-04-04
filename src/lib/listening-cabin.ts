import {
    DEFAULT_TTS_VOICE,
    TTS_VOICE_OPTIONS,
    type EnglishLevel,
    type TtsVoice,
} from "@/lib/profile-settings";
import {
    alignTokensToMarks,
    buildSentenceUnits,
    extractWordTokens,
    type TtsWordMark,
} from "@/lib/read-speaking";

export type ListeningCabinScriptStyle =
    | "natural"
    | "humorous"
    | "touching"
    | "inspiring"
    | "calm_healing"
    | "suspenseful"
    | "storytelling"
    | "practical_explainer"
    | "professional"
    | "casual_chatty";

export type ListeningCabinLegacyScriptStyle =
    | "daily_conversation"
    | "news_explainer"
    | "workplace"
    | "travel"
    | "interview"
    | "academic_mini_talk";

export type ListeningCabinTopicMode = "manual" | "random" | "hybrid";
export type ListeningCabinTopicSource = "manual" | "pool" | "ai";
export type ListeningCabinScriptMode = "monologue" | "dialogue" | "podcast";
export type ListeningCabinThinkingMode = "standard" | "deep";
export type ListeningCabinLexicalDensity = "safe" | "balanced" | "challenging";
export type ListeningCabinSentenceLength = "short" | "medium" | "long";
export type ListeningCabinScriptLength = "short" | "medium" | "long" | "ultra_long";
export type ListeningCabinSpeakerStrategy = "fixed" | "random_single" | "mixed_dialogue";
export type ListeningCabinSentenceEmotion =
    | "neutral"
    | "calm"
    | "cheerful"
    | "excited"
    | "serious"
    | "sad"
    | "suspenseful"
    | "empathetic";
export type ListeningCabinSentencePace = "slow" | "normal" | "fast";

export type ListeningCabinFocusTag =
    | "reduced_forms"
    | "linking"
    | "everyday_vocabulary"
    | "business_vocabulary"
    | "numbers_and_dates"
    | "fast_speech"
    | "accent_exposure";

export interface ListeningCabinSpeakerAssignment {
    speaker: string;
    voice: TtsVoice;
}

export interface ListeningCabinSpeakerPlan {
    strategy: ListeningCabinSpeakerStrategy;
    primaryVoice: TtsVoice;
    assignments: ListeningCabinSpeakerAssignment[];
}

export interface ListeningCabinSentence {
    index: number;
    english: string;
    chinese: string;
    speaker?: string;
    emotion?: ListeningCabinSentenceEmotion;
    pace?: ListeningCabinSentencePace;
}

export interface ListeningCabinGenerationRequest {
    prompt: string;
    topicMode: ListeningCabinTopicMode;
    topicSource: ListeningCabinTopicSource;
    scriptMode: ListeningCabinScriptMode;
    thinkingMode: ListeningCabinThinkingMode;
    style: ListeningCabinScriptStyle;
    cefrLevel: EnglishLevel;
    lexicalDensity: ListeningCabinLexicalDensity;
    sentenceLength: ListeningCabinSentenceLength;
    scriptLength: ListeningCabinScriptLength;
    focusTags: ListeningCabinFocusTag[];
    speakerPlan: ListeningCabinSpeakerPlan;
}

export interface ListeningCabinGenerationResponse {
    title: string;
    sourcePrompt: string;
    sentences: ListeningCabinSentence[];
    meta: {
        cefrLevel: EnglishLevel;
        targetWords: number;
        estimatedMinutes: number;
        scriptMode: ListeningCabinScriptMode;
        speakerCount: number;
        model: string;
        topicSeed?: string;
        resolvedSpeakerPlan?: ListeningCabinSpeakerPlan;
    };
}

export interface ListeningCabinSession extends ListeningCabinGenerationResponse {
    id: string;
    created_at: number;
    updated_at: number;
    topicMode: ListeningCabinTopicMode;
    topicSource: ListeningCabinTopicSource;
    scriptMode: ListeningCabinScriptMode;
    thinkingMode: ListeningCabinThinkingMode;
    style: ListeningCabinScriptStyle;
    focusTags: ListeningCabinFocusTag[];
    cefrLevel: EnglishLevel;
    lexicalDensity: ListeningCabinLexicalDensity;
    sentenceLength: ListeningCabinSentenceLength;
    scriptLength: ListeningCabinScriptLength;
    speakerPlan: ListeningCabinSpeakerPlan;
    sentenceCount: number;
    topicSeed: string | null;
    voice: TtsVoice;
    playbackRate: number;
    showChineseSubtitle: boolean;
    lastSentenceIndex: number;
    lastPlayedAt: number | null;
}

export type ListeningCabinPlaybackMode =
    | "repeat_current"
    | "auto_all"
    | "single_pause";

export interface ListeningCabinPlayerState {
    currentSentenceIndex: number;
    isPlaying: boolean;
    isLoading: boolean;
    playbackMode: ListeningCabinPlaybackMode;
    playbackRate: number;
    showChineseSubtitle: boolean;
    progressRatio: number;
    errorMessage: string | null;
}

export interface ListeningCabinSentenceTiming {
    index: number;
    startMs: number;
    endMs: number;
}

export interface ListeningCabinPlaybackChunk {
    id: string;
    sentenceIndexes: number[];
    text: string;
}

export interface ListeningCabinLengthProfile {
    estimatedMinutes: number;
    targetWords: number;
    targetWordRange: {
        min: number;
        max: number;
    };
    sentenceWordRange: {
        min: number;
        max: number;
    };
    targetSentenceRange: {
        min: number;
        max: number;
    };
}

export interface ListeningCabinDraftLintResult {
    isValid: boolean;
    issues: string[];
    metrics: {
        sentenceCount: number;
        totalWords: number;
        averageWordsPerSentence: number;
        uniqueSpeakers: number;
    };
}

type Option<T extends string> = {
    value: T;
    label: string;
    hint: string;
};

export const LISTENING_CABIN_SCRIPT_STYLE_OPTIONS: Array<Option<ListeningCabinScriptStyle>> = [
    { value: "natural", label: "自然", hint: "顺滑口语，贴近日常真实表达。" },
    { value: "humorous", label: "幽默", hint: "轻松有梗，听感更有趣。" },
    { value: "touching", label: "感人", hint: "更有情绪张力，适合沉浸听感。" },
    { value: "inspiring", label: "激励", hint: "积极推进、给人行动动力。" },
    { value: "calm_healing", label: "治愈", hint: "平静温柔，节奏舒展。" },
    { value: "suspenseful", label: "悬念", hint: "信息层层推进，保持注意力。" },
    { value: "storytelling", label: "故事讲述", hint: "更有画面感，适合练长句节奏。" },
    { value: "practical_explainer", label: "实用讲解", hint: "直给重点，适合通勤精听。" },
    { value: "professional", label: "专业", hint: "表达克制精准，偏职场质感。" },
    { value: "casual_chatty", label: "轻松闲聊", hint: "像真实聊天，不端着不生硬。" },
];

export const LISTENING_CABIN_TOPIC_MODE_OPTIONS: Array<Option<ListeningCabinTopicMode>> = [
    { value: "manual", label: "手动主题", hint: "完全按你的主题生成。" },
    { value: "random", label: "随机池", hint: "从生活主题池里随机抽题。" },
    { value: "hybrid", label: "混合", hint: "你给方向，系统叠加随机主题灵感。" },
];

export const LISTENING_CABIN_THINKING_MODE_OPTIONS: Array<Option<ListeningCabinThinkingMode>> = [
    { value: "standard", label: "标准生成", hint: "速度更快，适合日常练习。" },
    { value: "deep", label: "深度思考", hint: "推理更充分，质量优先。" },
];

export const LISTENING_CABIN_SCRIPT_MODE_OPTIONS: Array<Option<ListeningCabinScriptMode>> = [
    { value: "monologue", label: "单人口播", hint: "默认模式，连续自然的单人讲述。" },
    { value: "dialogue", label: "对话模式", hint: "多人轮流发言，适合场景听力。" },
    { value: "podcast", label: "播客模式", hint: "主持人+嘉宾式表达，适合长段生活听力。" },
];

export const LISTENING_CABIN_LEXICAL_DENSITY_OPTIONS: Array<Option<ListeningCabinLexicalDensity>> = [
    { value: "safe", label: "保守", hint: "高频词优先，表达更稳更清晰。" },
    { value: "balanced", label: "均衡", hint: "高频和进阶词平衡，适合主练。" },
    { value: "challenging", label: "挑战", hint: "信息密度更高，词汇更进阶。" },
];

export const LISTENING_CABIN_SENTENCE_LENGTH_OPTIONS: Array<Option<ListeningCabinSentenceLength>> = [
    { value: "short", label: "短句", hint: "快节奏，抓关键词更轻松。" },
    { value: "medium", label: "中句", hint: "自然主流节奏，最通用。" },
    { value: "long", label: "长句", hint: "更考验结构感和抗压听力。" },
];

export const LISTENING_CABIN_SCRIPT_LENGTH_OPTIONS: Array<Option<ListeningCabinScriptLength>> = [
    { value: "short", label: "短文", hint: "轻量练习，快速开练。" },
    { value: "medium", label: "中文", hint: "中篇幅，适合完整一轮训练。" },
    { value: "long", label: "长文", hint: "完整沉浸，约 10 分钟上下。" },
    { value: "ultra_long", label: "超长", hint: "更长篇幅，适合深度沉浸和耐力训练。" },
];

export const LISTENING_CABIN_SPEAKER_STRATEGY_OPTIONS: Array<Option<ListeningCabinSpeakerStrategy>> = [
    { value: "fixed", label: "固定声线", hint: "保持稳定听感。" },
    { value: "random_single", label: "随机单声线", hint: "每次单人口播随机一个声线。" },
    { value: "mixed_dialogue", label: "多人混搭", hint: "对话模式按说话人映射不同声线。" },
];

export const LISTENING_CABIN_FOCUS_OPTIONS: Array<Option<ListeningCabinFocusTag>> = [
    { value: "reduced_forms", label: "弱读缩读", hint: "练 gonna / wanna 这类口语化弱读。" },
    { value: "linking", label: "连读", hint: "让句子更像真实口语，不是单词拼接。" },
    { value: "everyday_vocabulary", label: "日常词汇", hint: "生活、学习、社交高频表达。" },
    { value: "business_vocabulary", label: "商务词汇", hint: "会议、汇报、协作与职场场景。" },
    { value: "numbers_and_dates", label: "数字日期", hint: "金额、日期、时间与数量信息。" },
    { value: "fast_speech", label: "快语速", hint: "提高抓重点与抗压能力。" },
    { value: "accent_exposure", label: "口音暴露", hint: "适应更自然的表达差异。" },
];

export const LISTENING_CABIN_CEFR_OPTIONS: EnglishLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const LISTENING_CABIN_PLAYBACK_RATE_OPTIONS = [0.85, 0.95, 1, 1.1, 1.2];
export const LISTENING_CABIN_MULTI_SPEAKER_MIN = 2;
export const LISTENING_CABIN_MULTI_SPEAKER_MAX = 4;
export const LISTENING_CABIN_RANDOM_TOPIC_POOL_SIZE_PER_MODE = 2500;
export { TTS_VOICE_OPTIONS };

const LISTENING_CABIN_LEGACY_STYLE_MAP: Record<ListeningCabinLegacyScriptStyle, ListeningCabinScriptStyle> = {
    daily_conversation: "natural",
    news_explainer: "practical_explainer",
    workplace: "professional",
    travel: "casual_chatty",
    interview: "professional",
    academic_mini_talk: "practical_explainer",
};

const MONOLOGUE_TOPIC_OPENERS = [
    "单人口播：一位老师用轻松口语讲",
    "单人口播：一位科普博主拆解",
    "单人口播：一位上班族复盘",
    "单人口播：一位学生分享",
    "单人口播：一位产品经理说明",
    "单人口播：一位运营同学讲",
    "单人口播：一位旅行者回顾",
    "单人口播：一位自由职业者记录",
    "单人口播：一位创业者反思",
    "单人口播：一位家长观察",
    "单人口播：一位健身爱好者总结",
    "单人口播：一位读书会发起人讲",
    "单人口播：一位英语老师补充",
    "单人口播：一位同事周会后复述",
    "单人口播：一位讲故事的人叙述",
    "单人口播：一位新闻观察者解释",
    "单人口播：一位面试者复盘",
    "单人口播：一位团队负责人晨会说明",
    "单人口播：一位实习生第一周见闻",
    "单人口播：一位通勤族地铁见闻",
] as const;

const MONOLOGUE_TOPIC_SCENES = [
    "如何把早晨时间管理得更顺",
    "为什么总觉得开会很累",
    "一次项目延期背后的真实原因",
    "如何在通勤路上学英语",
    "一场线上会议效率变高的方法",
    "旅行中最容易踩坑的环节",
    "如何准备一次五分钟汇报",
    "怎样给新同事讲清工作流程",
    "为什么明明很忙却没产出",
    "一个产品需求从想法到落地",
    "怎样和不同性格同事沟通",
    "一次客户反馈带来的改变",
    "如何做一个不尴尬的自我介绍",
    "一个普通人能听懂的科技新闻",
    "预算有限时如何做决策",
    "如何安排周末不被刷手机吞掉",
    "一次面试中最关键的三分钟",
    "怎样写出清楚的工作邮件",
    "一个故事里的情绪起伏",
    "如何解释一个复杂概念",
    "新手第一次带项目会遇到什么",
    "怎样应对突发任务插队",
    "如何开场让听众愿意继续听",
    "一次团队协作中的误会与修复",
    "为什么有些计划总是半途而废",
] as const;

const DIALOGUE_TOPIC_OPENERS = [
    "对话模式：两位同事交流",
    "对话模式：导师和学生讨论",
    "对话模式：朋友之间聊",
    "对话模式：前辈与新人复盘",
    "对话模式：面试官与候选人模拟",
    "对话模式：项目经理和设计师沟通",
    "对话模式：客服和用户沟通",
    "对话模式：销售和客户协商",
    "对话模式：旅行伙伴商量",
    "对话模式：房东与租客沟通",
    "对话模式：同学小组讨论",
    "对话模式：医生与患者咨询",
    "对话模式：老师与家长沟通",
    "对话模式：运营与内容创作者对齐",
    "对话模式：产品与研发同步",
    "对话模式：店员与顾客交流",
    "对话模式：社群管理员与成员沟通",
    "对话模式：甲方与乙方评审",
    "对话模式：主持人与来宾暖场",
    "对话模式：两位创业者交换经验",
] as const;

const DIALOGUE_TOPIC_SCENES = [
    "如何把任务优先级排清楚",
    "为什么这周进度突然变慢",
    "如何在冲突里保持礼貌表达",
    "如何解释一个误会并修复关系",
    "如何在预算受限时做取舍",
    "如何把复杂需求讲得更清楚",
    "如何安排一次高效周会",
    "如何拆解用户反馈并落地",
    "如何与强势同事沟通分工",
    "如何快速确认需求边界",
    "如何判断某个方案是否可行",
    "如何在面试中表达项目价值",
    "如何处理临时插队任务",
    "如何给新人做入职交接",
    "如何说服团队先做关键问题",
    "如何在跨部门协作中同步节奏",
    "如何制定一个现实可执行计划",
    "如何在截止日前降低返工风险",
    "如何在复盘中说出真问题",
    "如何在讨论中提出建设性反馈",
    "如何解释数据波动而不慌张",
    "如何准备一次客户沟通电话",
    "如何在意见不合时做最终决策",
    "如何明确下一步负责人和时间点",
    "如何把抽象目标变成具体动作",
] as const;

const PODCAST_TOPIC_OPENERS = [
    "播客模式：主持人与嘉宾聊",
    "播客模式：两位主持人拆解",
    "播客模式：主持人邀请从业者分享",
    "播客模式：主持人与老师深聊",
    "播客模式：主持人与创业者对谈",
    "播客模式：主持人与产品负责人复盘",
    "播客模式：主持人与设计师闲聊",
    "播客模式：主持人与内容创作者访谈",
    "播客模式：主持人与工程师谈实践",
    "播客模式：主持人与求职者讲经历",
    "播客模式：主持人与留学生分享",
    "播客模式：主持人与旅行者讲故事",
    "播客模式：主持人与家长对谈",
    "播客模式：主持人与教练讲方法",
    "播客模式：主持人与运营同学复盘",
    "播客模式：主持人与销售经理聊案例",
    "播客模式：主持人与品牌主理人讨论",
    "播客模式：主持人与社区组织者分享",
    "播客模式：主持人与咨询顾问拆解",
    "播客模式：主持人与媒体人聊观察",
] as const;

const PODCAST_TOPIC_SCENES = [
    "为什么很多人计划很好却执行不下去",
    "一个普通人如何建立稳定晨间流程",
    "怎样把一次失败项目变成成长素材",
    "怎样做出不焦虑的职业选择",
    "如何让团队沟通更坦诚更高效",
    "如何找到适合自己的学习节奏",
    "如何在压力周保持情绪稳定",
    "如何从用户反馈里找到真需求",
    "如何判断一个想法是否值得投入",
    "如何用最小成本验证一个方案",
    "如何把信息过载变成清晰行动",
    "如何改善会议里没人发言的问题",
    "如何在新环境里快速建立信任",
    "如何把复杂新闻讲给外行听",
    "如何应对工作中的突发不确定性",
    "如何在长期目标中保持耐心",
    "如何在自我怀疑时继续推进",
    "如何建立个人复盘系统",
    "如何提升表达中的故事感",
    "如何平衡效率和生活质量",
    "如何让跨文化沟通更顺畅",
    "如何面对变化并快速适应",
    "如何从一次谈话中读懂关键信号",
    "如何做出长期有复利的决定",
    "如何把经验沉淀成可复用方法",
] as const;

const MODE_TOPIC_ANGLES: ReadonlyArray<string> = [
    "重点放在生活化表达，保持自然口语节奏",
    "多用真实场景细节，避免书面文章腔",
    "强调可执行建议，让听众听完就能用",
    "加入情绪和停顿变化，提升真实听感",
    "让句子顺滑衔接，适合沉浸式精听",
] as const;

function buildModeRandomTopicPool(params: {
    modePrefix: string;
    openers: readonly string[];
    scenes: readonly string[];
    angles: readonly string[];
}) {
    const topics: string[] = [];
    const dedup = new Set<string>();

    for (const opener of params.openers) {
        for (const scene of params.scenes) {
            for (const angle of params.angles) {
                const topic = `${params.modePrefix}${opener}${scene}，${angle}。`;
                if (!dedup.has(topic)) {
                    dedup.add(topic);
                    topics.push(topic);
                }
            }
        }
    }

    return topics.slice(0, LISTENING_CABIN_RANDOM_TOPIC_POOL_SIZE_PER_MODE);
}

export const LISTENING_CABIN_RANDOM_TOPIC_POOLS: Record<ListeningCabinScriptMode, string[]> = {
    monologue: buildModeRandomTopicPool({
        modePrefix: "",
        openers: MONOLOGUE_TOPIC_OPENERS,
        scenes: MONOLOGUE_TOPIC_SCENES,
        angles: MODE_TOPIC_ANGLES,
    }),
    dialogue: buildModeRandomTopicPool({
        modePrefix: "",
        openers: DIALOGUE_TOPIC_OPENERS,
        scenes: DIALOGUE_TOPIC_SCENES,
        angles: MODE_TOPIC_ANGLES,
    }),
    podcast: buildModeRandomTopicPool({
        modePrefix: "",
        openers: PODCAST_TOPIC_OPENERS,
        scenes: PODCAST_TOPIC_SCENES,
        angles: MODE_TOPIC_ANGLES,
    }),
};

const SCRIPT_STYLE_SET = new Set<ListeningCabinScriptStyle>(
    LISTENING_CABIN_SCRIPT_STYLE_OPTIONS.map((option) => option.value),
);
const LEGACY_SCRIPT_STYLE_SET = new Set<ListeningCabinLegacyScriptStyle>(
    Object.keys(LISTENING_CABIN_LEGACY_STYLE_MAP) as ListeningCabinLegacyScriptStyle[],
);
const TOPIC_MODE_SET = new Set<ListeningCabinTopicMode>(
    LISTENING_CABIN_TOPIC_MODE_OPTIONS.map((option) => option.value),
);
const THINKING_MODE_SET = new Set<ListeningCabinThinkingMode>(
    LISTENING_CABIN_THINKING_MODE_OPTIONS.map((option) => option.value),
);
const TOPIC_SOURCE_SET = new Set<ListeningCabinTopicSource>(["manual", "pool", "ai"]);
const SCRIPT_MODE_SET = new Set<ListeningCabinScriptMode>(
    LISTENING_CABIN_SCRIPT_MODE_OPTIONS.map((option) => option.value),
);
const LEXICAL_DENSITY_SET = new Set<ListeningCabinLexicalDensity>(
    LISTENING_CABIN_LEXICAL_DENSITY_OPTIONS.map((option) => option.value),
);
const SENTENCE_LENGTH_SET = new Set<ListeningCabinSentenceLength>(
    LISTENING_CABIN_SENTENCE_LENGTH_OPTIONS.map((option) => option.value),
);
const SCRIPT_LENGTH_SET = new Set<ListeningCabinScriptLength>(
    LISTENING_CABIN_SCRIPT_LENGTH_OPTIONS.map((option) => option.value),
);
const SPEAKER_STRATEGY_SET = new Set<ListeningCabinSpeakerStrategy>(
    LISTENING_CABIN_SPEAKER_STRATEGY_OPTIONS.map((option) => option.value),
);
const FOCUS_TAG_SET = new Set<ListeningCabinFocusTag>(
    LISTENING_CABIN_FOCUS_OPTIONS.map((option) => option.value),
);
const CEFR_SET = new Set<EnglishLevel>(LISTENING_CABIN_CEFR_OPTIONS);
const SENTENCE_EMOTION_SET = new Set<ListeningCabinSentenceEmotion>([
    "neutral",
    "calm",
    "cheerful",
    "excited",
    "serious",
    "sad",
    "suspenseful",
    "empathetic",
]);
const SENTENCE_PACE_SET = new Set<ListeningCabinSentencePace>(["slow", "normal", "fast"]);
const TTS_VOICE_SET = new Set<TtsVoice>(TTS_VOICE_OPTIONS.map((option) => option.voice));
const ALL_TTS_VOICES = TTS_VOICE_OPTIONS.map((option) => option.voice);
const ENGLISH_TTS_VOICES = ALL_TTS_VOICES.filter((voice): voice is TtsVoice => voice.startsWith("en-"));
const ENGLISH_TTS_VOICE_SET = new Set<TtsVoice>(ENGLISH_TTS_VOICES);
const TTS_VOICE_LABEL_MAP = new Map(TTS_VOICE_OPTIONS.map((option) => [option.voice, option.label] as const));

export const DEFAULT_LISTENING_CABIN_REQUEST: ListeningCabinGenerationRequest = {
    prompt: "",
    topicMode: "manual",
    topicSource: "manual",
    scriptMode: "monologue",
    thinkingMode: "standard",
    style: LISTENING_CABIN_LEGACY_STYLE_MAP.daily_conversation,
    focusTags: ["everyday_vocabulary"],
    cefrLevel: "B1",
    lexicalDensity: "balanced",
    sentenceLength: "medium",
    scriptLength: "medium",
    speakerPlan: {
        strategy: "fixed",
        primaryVoice: DEFAULT_TTS_VOICE,
        assignments: [
            { speaker: "Narrator", voice: DEFAULT_TTS_VOICE },
        ],
    },
};

export function isListeningCabinMultiSpeakerMode(scriptMode: ListeningCabinScriptMode) {
    return scriptMode !== "monologue";
}

export function getVoiceLabel(voice: TtsVoice) {
    return TTS_VOICE_LABEL_MAP.get(voice) ?? voice;
}

export function normalizeListeningCabinVoice(value: unknown, fallback: TtsVoice) {
    const normalized = normalizeVoice(value, fallback);
    if (ENGLISH_TTS_VOICE_SET.has(normalized)) {
        return normalized;
    }

    if (ENGLISH_TTS_VOICE_SET.has(fallback)) {
        return fallback;
    }

    return DEFAULT_TTS_VOICE;
}

function isGenericSpeakerName(name: string) {
    const normalized = name.trim().toLowerCase();
    return (
        /^speaker\s*[a-z0-9]+$/i.test(normalized)
        || /^guest\s*\d*$/i.test(normalized)
        || normalized === "host"
        || normalized === "narrator"
    );
}

function nextUnusedVoice(used: Set<TtsVoice>, fallback: TtsVoice) {
    const candidate = ENGLISH_TTS_VOICES.find((voice) => !used.has(voice));
    return candidate ?? fallback;
}

export function ensureUniqueVoiceAssignments(
    assignments: ListeningCabinSpeakerAssignment[],
    fallbackVoice: TtsVoice,
) {
    const used = new Set<TtsVoice>();

    return assignments.map((assignment) => {
        const preferred = normalizeListeningCabinVoice(assignment.voice, fallbackVoice);
        const voice = used.has(preferred) ? nextUnusedVoice(used, preferred) : preferred;
        used.add(voice);
        return {
            ...assignment,
            voice,
        } satisfies ListeningCabinSpeakerAssignment;
    });
}

export function buildDefaultMultiSpeakerAssignments(
    _scriptMode: Exclude<ListeningCabinScriptMode, "monologue">,
    primaryVoice: TtsVoice,
): ListeningCabinSpeakerAssignment[] {
    const alternateVoice = ENGLISH_TTS_VOICES.find((voice) => voice !== primaryVoice) ?? primaryVoice;
    const firstLabel = getVoiceLabel(primaryVoice);
    const secondLabel = getVoiceLabel(alternateVoice);
    return [
        { speaker: firstLabel, voice: primaryVoice },
        { speaker: secondLabel, voice: alternateVoice },
    ];
}

function normalizeSentenceText(value: unknown) {
    return typeof value === "string"
        ? value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()
        : "";
}

function normalizeSpeakerName(value: unknown, fallback: string) {
    const normalized = normalizeSentenceText(value).replace(/^speaker\s*/i, "").replace(/[:：]$/, "").trim();
    return normalized || fallback;
}

function normalizeVoice(value: unknown, fallback: TtsVoice) {
    return typeof value === "string" && TTS_VOICE_SET.has(value as TtsVoice)
        ? value as TtsVoice
        : fallback;
}

function normalizeScriptStyle(
    value: unknown,
    fallback: ListeningCabinScriptStyle,
): ListeningCabinScriptStyle {
    if (typeof value === "string" && SCRIPT_STYLE_SET.has(value as ListeningCabinScriptStyle)) {
        return value as ListeningCabinScriptStyle;
    }

    if (typeof value === "string" && LEGACY_SCRIPT_STYLE_SET.has(value as ListeningCabinLegacyScriptStyle)) {
        return LISTENING_CABIN_LEGACY_STYLE_MAP[value as ListeningCabinLegacyScriptStyle];
    }

    return fallback;
}

function normalizeTopicSource(
    value: unknown,
    fallback: ListeningCabinTopicSource,
): ListeningCabinTopicSource {
    return typeof value === "string" && TOPIC_SOURCE_SET.has(value as ListeningCabinTopicSource)
        ? value as ListeningCabinTopicSource
        : fallback;
}

function normalizeThinkingMode(
    value: unknown,
    fallback: ListeningCabinThinkingMode,
): ListeningCabinThinkingMode {
    return typeof value === "string" && THINKING_MODE_SET.has(value as ListeningCabinThinkingMode)
        ? value as ListeningCabinThinkingMode
        : fallback;
}

function normalizeSentenceEmotion(
    value: unknown,
    fallback: ListeningCabinSentenceEmotion = "neutral",
): ListeningCabinSentenceEmotion {
    return typeof value === "string" && SENTENCE_EMOTION_SET.has(value as ListeningCabinSentenceEmotion)
        ? value as ListeningCabinSentenceEmotion
        : fallback;
}

function normalizeSentencePace(
    value: unknown,
    fallback: ListeningCabinSentencePace = "normal",
): ListeningCabinSentencePace {
    return typeof value === "string" && SENTENCE_PACE_SET.has(value as ListeningCabinSentencePace)
        ? value as ListeningCabinSentencePace
        : fallback;
}

function normalizeSpeakerPlan(
    rawPlan: Partial<ListeningCabinSpeakerPlan> | null | undefined,
    scriptMode: ListeningCabinScriptMode,
): ListeningCabinSpeakerPlan {
    const primaryVoice = normalizeListeningCabinVoice(rawPlan?.primaryVoice, DEFAULT_TTS_VOICE);
    const isMultiSpeakerMode = isListeningCabinMultiSpeakerMode(scriptMode);
    const strategy = SPEAKER_STRATEGY_SET.has(rawPlan?.strategy as ListeningCabinSpeakerStrategy)
        ? rawPlan?.strategy as ListeningCabinSpeakerStrategy
        : isMultiSpeakerMode
            ? "mixed_dialogue"
            : "fixed";

    const normalizedAssignments = Array.isArray(rawPlan?.assignments)
        ? rawPlan.assignments
            .map((assignment, index) => {
                const voice = normalizeListeningCabinVoice(assignment?.voice, primaryVoice);
                const speaker = normalizeSpeakerName(
                    assignment?.speaker,
                    isMultiSpeakerMode
                        ? getVoiceLabel(voice)
                        : `Speaker ${index + 1}`,
                );
                return { speaker, voice } satisfies ListeningCabinSpeakerAssignment;
            })
            .filter((assignment) => Boolean(assignment.speaker))
        : [];

    if (isMultiSpeakerMode) {
        const mode = scriptMode as Exclude<ListeningCabinScriptMode, "monologue">;
        const fallbackAssignments = buildDefaultMultiSpeakerAssignments(mode, primaryVoice);
        const boundedAssignments = normalizedAssignments.slice(0, LISTENING_CABIN_MULTI_SPEAKER_MAX);
        const expectedCount = Math.min(
            LISTENING_CABIN_MULTI_SPEAKER_MAX,
            Math.max(LISTENING_CABIN_MULTI_SPEAKER_MIN, boundedAssignments.length),
        );
        const baseAssignments = Array.from({ length: expectedCount }, (_, index) => {
            const existing = boundedAssignments[index];
            const fallback = fallbackAssignments[index] ?? {
                speaker: getVoiceLabel(primaryVoice),
                voice: primaryVoice,
            };
            const fallbackSpeaker = getVoiceLabel(normalizeListeningCabinVoice(existing?.voice, fallback.voice));
            const preferredSpeaker = normalizeSpeakerName(existing?.speaker, fallbackSpeaker);
            const speaker = isGenericSpeakerName(preferredSpeaker) ? fallbackSpeaker : preferredSpeaker;

            return {
                speaker,
                voice: normalizeListeningCabinVoice(existing?.voice, fallback.voice),
            } satisfies ListeningCabinSpeakerAssignment;
        });
        const uniqueVoiceAssignments = ensureUniqueVoiceAssignments(baseAssignments, primaryVoice);
        const usedSpeakerNames = new Set<string>();
        const normalizedUniqueAssignments = uniqueVoiceAssignments.map((assignment, index) => {
            const candidate = normalizeSpeakerName(assignment.speaker, getVoiceLabel(assignment.voice));
            const baseName = candidate || getVoiceLabel(assignment.voice);
            let uniqueName = baseName;
            if (usedSpeakerNames.has(uniqueName)) {
                uniqueName = `${baseName} ${index + 1}`;
            }
            usedSpeakerNames.add(uniqueName);
            return {
                speaker: uniqueName,
                voice: assignment.voice,
            } satisfies ListeningCabinSpeakerAssignment;
        });

        return {
            strategy: "mixed_dialogue",
            primaryVoice: normalizedUniqueAssignments[0]?.voice ?? primaryVoice,
            assignments: normalizedUniqueAssignments,
        };
    }

    return {
        strategy: strategy === "mixed_dialogue" ? "fixed" : strategy,
        primaryVoice,
        assignments: normalizedAssignments.length > 0
            ? normalizedAssignments.slice(0, 1)
            : [{ speaker: "Narrator", voice: primaryVoice }],
    };
}

export function normalizeListeningCabinRequest(
    payload: Partial<ListeningCabinGenerationRequest> | null | undefined,
): ListeningCabinGenerationRequest {
    const topicMode = TOPIC_MODE_SET.has(payload?.topicMode as ListeningCabinTopicMode)
        ? payload?.topicMode as ListeningCabinTopicMode
        : DEFAULT_LISTENING_CABIN_REQUEST.topicMode;
    const scriptMode = SCRIPT_MODE_SET.has(payload?.scriptMode as ListeningCabinScriptMode)
        ? payload?.scriptMode as ListeningCabinScriptMode
        : DEFAULT_LISTENING_CABIN_REQUEST.scriptMode;
    const style = normalizeScriptStyle(payload?.style, DEFAULT_LISTENING_CABIN_REQUEST.style);
    const thinkingMode = normalizeThinkingMode(
        payload?.thinkingMode,
        DEFAULT_LISTENING_CABIN_REQUEST.thinkingMode,
    );
    const topicSource = normalizeTopicSource(
        payload?.topicSource,
        topicMode === "manual" ? "manual" : DEFAULT_LISTENING_CABIN_REQUEST.topicSource,
    );
    const cefrLevel = CEFR_SET.has(payload?.cefrLevel as EnglishLevel)
        ? payload?.cefrLevel as EnglishLevel
        : DEFAULT_LISTENING_CABIN_REQUEST.cefrLevel;
    const lexicalDensity = LEXICAL_DENSITY_SET.has(payload?.lexicalDensity as ListeningCabinLexicalDensity)
        ? payload?.lexicalDensity as ListeningCabinLexicalDensity
        : DEFAULT_LISTENING_CABIN_REQUEST.lexicalDensity;
    const sentenceLength = SENTENCE_LENGTH_SET.has(payload?.sentenceLength as ListeningCabinSentenceLength)
        ? payload?.sentenceLength as ListeningCabinSentenceLength
        : DEFAULT_LISTENING_CABIN_REQUEST.sentenceLength;
    const scriptLength = SCRIPT_LENGTH_SET.has(payload?.scriptLength as ListeningCabinScriptLength)
        ? payload?.scriptLength as ListeningCabinScriptLength
        : DEFAULT_LISTENING_CABIN_REQUEST.scriptLength;
    const focusTags = Array.isArray(payload?.focusTags)
        ? Array.from(new Set(payload.focusTags.filter((tag): tag is ListeningCabinFocusTag => FOCUS_TAG_SET.has(tag as ListeningCabinFocusTag))))
        : DEFAULT_LISTENING_CABIN_REQUEST.focusTags;

    return {
        prompt: normalizeSentenceText(payload?.prompt),
        topicMode,
        topicSource: topicMode === "manual" ? "manual" : topicSource,
        scriptMode,
        thinkingMode,
        style,
        focusTags: focusTags.length > 0 ? focusTags : DEFAULT_LISTENING_CABIN_REQUEST.focusTags,
        cefrLevel,
        lexicalDensity,
        sentenceLength,
        scriptLength,
        speakerPlan: normalizeSpeakerPlan(payload?.speakerPlan, scriptMode),
    };
}

export function validateListeningCabinRequest(request: ListeningCabinGenerationRequest) {
    if (request.topicMode === "manual" && !request.prompt.trim()) {
        return "Prompt is required for manual topic mode.";
    }

    if (!CEFR_SET.has(request.cefrLevel)) {
        return "Invalid CEFR level.";
    }

    if (!SCRIPT_STYLE_SET.has(request.style)) {
        return "Invalid script style.";
    }

    if (!TOPIC_MODE_SET.has(request.topicMode)) {
        return "Invalid topic mode.";
    }

    if (!TOPIC_SOURCE_SET.has(request.topicSource)) {
        return "Invalid topic source.";
    }

    if (!SCRIPT_MODE_SET.has(request.scriptMode)) {
        return "Invalid script mode.";
    }

    if (!THINKING_MODE_SET.has(request.thinkingMode)) {
        return "Invalid thinking mode.";
    }

    if (!LEXICAL_DENSITY_SET.has(request.lexicalDensity)) {
        return "Invalid lexical density.";
    }

    if (!SENTENCE_LENGTH_SET.has(request.sentenceLength)) {
        return "Invalid sentence length.";
    }

    if (!SCRIPT_LENGTH_SET.has(request.scriptLength)) {
        return "Invalid script length.";
    }

    if (isListeningCabinMultiSpeakerMode(request.scriptMode)) {
        if (
            request.speakerPlan.assignments.length < LISTENING_CABIN_MULTI_SPEAKER_MIN
            || request.speakerPlan.assignments.length > LISTENING_CABIN_MULTI_SPEAKER_MAX
        ) {
            return `${request.scriptMode === "podcast" ? "Podcast" : "Dialogue"} mode needs 2 to 4 speaker voices.`;
        }

        const uniqueVoiceCount = new Set(request.speakerPlan.assignments.map((assignment) => assignment.voice)).size;
        if (uniqueVoiceCount !== request.speakerPlan.assignments.length) {
            return "Multi-speaker mode requires unique voices per speaker.";
        }
    }

    return null;
}

export function resolveListeningCabinLengthProfile(
    scriptLength: ListeningCabinScriptLength,
    sentenceLength: ListeningCabinSentenceLength,
): ListeningCabinLengthProfile {
    const scriptLengthTarget: Record<ListeningCabinScriptLength, {
        minutes: number;
        sentenceRange: { min: number; max: number };
    }> = {
        short: { minutes: 2.2, sentenceRange: { min: 8, max: 16 } },
        medium: { minutes: 4.5, sentenceRange: { min: 18, max: 32 } },
        long: { minutes: 10, sentenceRange: { min: 40, max: 60 } },
        ultra_long: { minutes: 18, sentenceRange: { min: 70, max: 100 } },
    };
    const sentenceLengthTarget: Record<ListeningCabinSentenceLength, { min: number; max: number }> = {
        short: { min: 7, max: 13 },
        medium: { min: 12, max: 19 },
        long: { min: 17, max: 28 },
    };

    const scriptTarget = scriptLengthTarget[scriptLength];
    const sentenceTarget = sentenceLengthTarget[sentenceLength];
    const averageWords = Math.round((sentenceTarget.min + sentenceTarget.max) / 2);
    const targetSentenceMidpoint = Math.round((scriptTarget.sentenceRange.min + scriptTarget.sentenceRange.max) / 2);
    const targetWords = Math.max(60, targetSentenceMidpoint * averageWords);

    return {
        estimatedMinutes: scriptTarget.minutes,
        targetWords,
        targetWordRange: {
            min: Math.max(60, Math.round(targetWords * 0.72)),
            max: Math.round(targetWords * 1.3),
        },
        sentenceWordRange: sentenceTarget,
        targetSentenceRange: scriptTarget.sentenceRange,
    };
}

function lexicalDensityInstruction(density: ListeningCabinLexicalDensity) {
    switch (density) {
        case "safe":
            return "Use mostly high-frequency words. Keep jargon minimal and brief.";
        case "challenging":
            return "Use richer phrasing and denser information while remaining spoken and natural.";
        case "balanced":
        default:
            return "Mix high-frequency words with moderate advanced vocabulary.";
    }
}

function styleToneInstruction(style: ListeningCabinScriptStyle) {
    switch (style) {
        case "humorous":
            return "Keep the tone witty and light, with natural humor in spoken lines.";
        case "touching":
            return "Use warm, emotional, and empathetic spoken phrasing.";
        case "inspiring":
            return "Keep momentum and encouragement, sounding motivating but not preachy.";
        case "calm_healing":
            return "Use gentle, calm, and soothing rhythm with soft transitions.";
        case "suspenseful":
            return "Build curiosity progressively while staying natural and spoken.";
        case "storytelling":
            return "Narrate with clear scene progression and vivid spoken details.";
        case "practical_explainer":
            return "Prioritize clarity and practical takeaways in listener-friendly phrasing.";
        case "professional":
            return "Keep concise, polished, and professional spoken delivery.";
        case "casual_chatty":
            return "Make it casual and chatty, like everyday real-life conversation.";
        case "natural":
        default:
            return "Keep it natural and life-like with balanced conversational rhythm.";
    }
}

export function buildListeningCabinPrompt(params: {
    request: ListeningCabinGenerationRequest;
    effectivePrompt: string;
    profile: ListeningCabinLengthProfile;
    speakerPlan: ListeningCabinSpeakerPlan;
}) {
    const { request, effectivePrompt, profile, speakerPlan } = params;
    const styleLabel = LISTENING_CABIN_SCRIPT_STYLE_OPTIONS.find((option) => option.value === request.style)?.label ?? request.style;
    const focusLabels = request.focusTags
        .map((tag) => LISTENING_CABIN_FOCUS_OPTIONS.find((option) => option.value === tag)?.label ?? tag)
        .join("、");
    const averageWordsPerSentence = Math.max(
        profile.sentenceWordRange.min,
        Math.round(profile.targetWords / Math.max(1, profile.targetSentenceRange.min)),
    );
    const speakerNames = speakerPlan.assignments.map((assignment) => assignment.speaker);
    const speakerHint = speakerNames.join(", ");
    const expectedSpeakerCount = speakerNames.length;

    return `
You are writing a HIGH-QUALITY spoken-English listening script for Chinese learners.

Primary objective:
- Produce a natural spoken script for immersion listening.
- This is NOT an article. Avoid essay tone and textbook structure.
- Keep transitions smooth and conversational.

Task setup:
- Topic request: ${effectivePrompt}
- Script mode: ${request.scriptMode}
- Thinking mode: ${request.thinkingMode}
- Style flavor: ${styleLabel}
- Style direction: ${styleToneInstruction(request.style)}
- CEFR target: ${request.cefrLevel}
- Lexical density: ${request.lexicalDensity} (${lexicalDensityInstruction(request.lexicalDensity)})
- Focus tags: ${focusLabels || "自然口语"}
- Target words: around ${profile.targetWords} (acceptable ${profile.targetWordRange.min}-${profile.targetWordRange.max})
- Target sentence count: keep it within ${profile.targetSentenceRange.min}-${profile.targetSentenceRange.max} sentences
- Preferred sentence length: around ${profile.sentenceWordRange.min}-${profile.sentenceWordRange.max} words
- Suggested average words per sentence: around ${averageWordsPerSentence}

Strict writing constraints:
- Return ONLY one valid JSON object.
- title should be concise and practical.
- Every sentence must include english + chinese.
- Every sentence must include emotion + pace.
- english must sound spoken, rhythmic, and life-like.
- chinese should be concise and easy to map to the spoken line.
- Use punctuation naturally to express emotion (comma, ellipsis, question mark, exclamation) without overusing.
- You may use occasional natural repetition to express hesitation, emphasis, correction, or emotional pressure, for example repeating a word or short phrase once ("that, that is not true", "I just, I just froze"), but keep it rare and intentional.
- No markdown, no extra explanation outside JSON.
- Avoid rigid templates like "In conclusion", "This essay", "Firstly", "Secondly".

Mode constraints:
${request.scriptMode === "monologue"
        ? "- Must be a SINGLE speaker monologue. No back-and-forth and no speaker labels."
        : request.scriptMode === "dialogue"
            ? `- Must be a DIALOGUE with ${expectedSpeakerCount} speakers.\n- You MUST use ALL configured speakers at least once.\n- Allowed speaker names: ${speakerHint || "Jenny, Ava"}.\n- Do not collapse multiple people into one voice or omit any configured speaker.\n- Each sentence must include a speaker field.`
            : `- Must be a PODCAST-style conversation with EXACTLY ${expectedSpeakerCount} speakers.\n- You MUST use ALL configured speakers at least once.\n- Allowed speaker names: ${speakerHint || "Host Jenny, Emma"}.\n- The first listed speaker is the host and should open the episode, guide transitions, and close or summarize near the end.\n- The remaining speakers are distinct guests with different viewpoints or contributions.\n- Do not collapse, merge, rename, or omit any configured speaker.\n- If there are 4 configured speakers, keep all 4 active in the episode instead of drifting into a 2-person conversation.\n- Each sentence must include a speaker field.`}

JSON schema:
{
  "title": "short title",
  "sentences": [
    ${request.scriptMode === "monologue"
        ? '{ "english": "sentence", "chinese": "翻译", "emotion": "neutral|calm|cheerful|excited|serious|sad|suspenseful|empathetic", "pace": "slow|normal|fast" }'
        : `{ "speaker": "${(speakerPlan.assignments[0]?.speaker ?? "Jenny").replace(/"/g, "\\\"")}", "english": "sentence", "chinese": "翻译", "emotion": "neutral|calm|cheerful|excited|serious|sad|suspenseful|empathetic", "pace": "slow|normal|fast" }`}
  ]
}
`.trim();
}

export function buildListeningCabinAiRandomTopicPrompt(params: {
    scriptMode: ListeningCabinScriptMode;
    style: ListeningCabinScriptStyle;
    cefrLevel: EnglishLevel;
    sentenceLength: ListeningCabinSentenceLength;
    scriptLength: ListeningCabinScriptLength;
    topicMode: ListeningCabinTopicMode;
}) {
    const styleLabel = LISTENING_CABIN_SCRIPT_STYLE_OPTIONS.find((option) => option.value === params.style)?.label ?? params.style;
    const modeConstraint = params.scriptMode === "monologue"
        ? "The topic must fit a single-speaker spoken monologue (teacher, explainer, storyteller, or personal sharing)."
        : params.scriptMode === "dialogue"
            ? "The topic must naturally fit a 2-4 speaker dialogue with turn-taking."
            : "The topic must naturally fit a podcast-style host and guests conversation (2-4 speakers).";

    return `
You generate one high-quality listening topic for spoken English script creation.

Constraints:
- ${modeConstraint}
- Style preference: ${styleLabel} (${styleToneInstruction(params.style)})
- CEFR target: ${params.cefrLevel}
- Sentence length preference: ${params.sentenceLength}
- Script length preference: ${params.scriptLength}
- Topic mode context: ${params.topicMode}
- Topic should be practical, life-like, and suitable for immersion listening (not essay-like).
- Output ONLY JSON.

JSON schema:
{
  "topic": "one concise topic sentence in Chinese, directly usable as script prompt"
}
`.trim();
}

export function buildListeningCabinRepairPrompt(params: {
    request: ListeningCabinGenerationRequest;
    effectivePrompt: string;
    profile: ListeningCabinLengthProfile;
    speakerPlan: ListeningCabinSpeakerPlan;
    previousDraft: {
        title: string;
        sentences: ListeningCabinSentence[];
    };
    issues: string[];
}) {
    return `
The previous listening script draft did not pass quality checks.
Regenerate the full JSON from scratch and fix all issues.

Issues:
${params.issues.map((issue) => `- ${issue}`).join("\n")}

Previous draft JSON:
${JSON.stringify(params.previousDraft, null, 2)}

Regenerate now with the same task setup:
${buildListeningCabinPrompt({
        request: params.request,
        effectivePrompt: params.effectivePrompt,
        profile: params.profile,
        speakerPlan: params.speakerPlan,
    })}
`.trim();
}

export function countEnglishWords(text: string) {
    const normalized = normalizeSentenceText(text);
    if (!normalized) return 0;
    return normalized
        .split(/\s+/)
        .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
        .filter(Boolean)
        .length;
}

export function lintListeningCabinDraft(params: {
    title: string;
    sentences: ListeningCabinSentence[];
    request: ListeningCabinGenerationRequest;
    profile: ListeningCabinLengthProfile;
}): ListeningCabinDraftLintResult {
    const { title, sentences, request, profile } = params;
    const issues: string[] = [];
    const totalWords = sentences.reduce((sum, sentence) => sum + countEnglishWords(sentence.english), 0);
    const averageWordsPerSentence = sentences.length > 0 ? totalWords / sentences.length : 0;
    const speakers = Array.from(new Set(
        sentences
            .map((sentence) => normalizeSpeakerName(sentence.speaker, ""))
            .filter(Boolean),
    ));
    const isUltraLong = request.scriptLength === "ultra_long";
    const maxSentenceOverflow = isUltraLong ? 22 : 10;
    const minWordThreshold = isUltraLong
        ? Math.max(90, Math.round(profile.targetWordRange.min * 0.34))
        : Math.max(45, Math.round(profile.targetWordRange.min * 0.5));
    const maxWordThreshold = isUltraLong
        ? Math.round(profile.targetWordRange.max * 1.95)
        : Math.round(profile.targetWordRange.max * 1.6);
    const minAverageWords = isUltraLong
        ? Math.max(4.5, profile.sentenceWordRange.min - 5)
        : Math.max(5, profile.sentenceWordRange.min - 3);
    const maxAverageWords = isUltraLong
        ? profile.sentenceWordRange.max + 10
        : profile.sentenceWordRange.max + 6;

    if (!title.trim()) {
        issues.push("title is empty");
    }

    if (sentences.length < 3) {
        issues.push("sentence count is too low for listening flow");
    }

    if (sentences.length < profile.targetSentenceRange.min) {
        issues.push("sentence count is too low for the selected script length");
    }

    if (sentences.length > profile.targetSentenceRange.max + maxSentenceOverflow) {
        issues.push("sentence count is too high and may cause fragmented subtitles");
    }

    if (totalWords < minWordThreshold) {
        issues.push("overall script is too short for the selected script length");
    }

    if (totalWords > maxWordThreshold) {
        issues.push("overall script is too long for the selected script length");
    }

    if (averageWordsPerSentence < minAverageWords) {
        issues.push("sentence rhythm is too choppy; lines are too short");
    }

    if (averageWordsPerSentence > maxAverageWords) {
        issues.push("sentence rhythm is too dense; lines are too long");
    }

    const essayLikePattern = /\b(in conclusion|this essay|firstly|secondly|to summarize|moreover)\b/i;
    const speakerLabelPattern = /^\s*[A-Za-z][A-Za-z0-9 ]{0,16}\s*[:：]/;

    if (request.scriptMode === "monologue") {
        const hasSpeakerLabels = sentences.some((sentence) => speakerLabelPattern.test(sentence.english));
        if (hasSpeakerLabels) {
            issues.push("monologue output contains speaker labels");
        }

        if (speakers.length > 1) {
            issues.push("monologue output has multiple speakers");
        }
    } else {
        const modeLabel = request.scriptMode === "podcast" ? "podcast" : "dialogue";
        if (speakers.length < LISTENING_CABIN_MULTI_SPEAKER_MIN) {
            issues.push(`${modeLabel} output must include at least two speakers`);
        }
        if (speakers.length > LISTENING_CABIN_MULTI_SPEAKER_MAX) {
            issues.push(`${modeLabel} output has too many speakers`);
        }
    }

    const essayLineCount = sentences.filter((sentence) => essayLikePattern.test(sentence.english)).length;
    if (essayLineCount >= 2) {
        issues.push("script sounds like a written essay instead of spoken audio");
    }

    const missingChinese = sentences.some((sentence) => !normalizeSentenceText(sentence.chinese));
    if (missingChinese) {
        issues.push("some sentences are missing Chinese translation");
    }

    return {
        isValid: issues.length === 0,
        issues,
        metrics: {
            sentenceCount: sentences.length,
            totalWords,
            averageWordsPerSentence: Number(averageWordsPerSentence.toFixed(2)),
            uniqueSpeakers: speakers.length,
        },
    };
}

export function normalizeListeningCabinSentences(
    raw: unknown,
    fallbackCount: number,
    scriptMode: ListeningCabinScriptMode,
) {
    if (!Array.isArray(raw)) {
        return [];
    }

    const sentences = raw
        .map((item, index) => {
            const english = normalizeSentenceText((item as { english?: unknown })?.english);
            const chinese = normalizeSentenceText((item as { chinese?: unknown })?.chinese);
            const speaker = normalizeSpeakerName((item as { speaker?: unknown })?.speaker, "");
            const emotion = normalizeSentenceEmotion((item as { emotion?: unknown })?.emotion);
            const pace = normalizeSentencePace((item as { pace?: unknown })?.pace);
            if (!english || !chinese) {
                return null;
            }

            return {
                index: index + 1,
                english,
                chinese,
                emotion,
                pace,
                ...(isListeningCabinMultiSpeakerMode(scriptMode) && speaker ? { speaker } : {}),
            } as ListeningCabinSentence;
        })
        .filter((item): item is ListeningCabinSentence => item !== null);

    return sentences.slice(0, fallbackCount);
}

function buildSpeakerAliasMap(
    scriptMode: ListeningCabinScriptMode,
    speakerPlan: ListeningCabinSpeakerPlan,
) {
    const aliasMap = new Map<string, string>();
    const assignments = speakerPlan.assignments;

    const addAlias = (alias: string | undefined, speakerName: string) => {
        const normalized = normalizeSentenceText(alias).toLowerCase().replace(/[\s_:\-]+/g, "");
        if (!normalized) {
            return;
        }
        if (!aliasMap.has(normalized)) {
            aliasMap.set(normalized, speakerName);
        }
    };

    assignments.forEach((assignment, index) => {
        const speakerName = assignment.speaker;
        addAlias(speakerName, speakerName);
        addAlias(`speaker ${String.fromCharCode(65 + index)}`, speakerName);
        addAlias(`${String.fromCharCode(65 + index)}`, speakerName);
        addAlias(`${String.fromCharCode(97 + index)}`, speakerName);
        addAlias(`speaker ${index + 1}`, speakerName);
        addAlias(`${index + 1}`, speakerName);
        if (scriptMode === "podcast") {
            addAlias(index === 0 ? "host" : `guest ${index}`, speakerName);
            addAlias(index === 0 ? "host" : `guest${index}`, speakerName);
        }
    });

    return aliasMap;
}

export function canonicalizeListeningCabinSentenceSpeakers(params: {
    scriptMode: ListeningCabinScriptMode;
    speakerPlan: ListeningCabinSpeakerPlan;
    sentences: ListeningCabinSentence[];
}) {
    if (!isListeningCabinMultiSpeakerMode(params.scriptMode)) {
        return params.sentences.map((sentence) => ({
            ...sentence,
            speaker: undefined,
        }));
    }

    const assignments = params.speakerPlan.assignments;
    const aliasMap = buildSpeakerAliasMap(params.scriptMode, params.speakerPlan);
    const defaultSpeaker = assignments[0]?.speaker ?? "Narrator";
    let previousSpeaker = defaultSpeaker;

    return params.sentences.map((sentence, index) => {
        const rawSpeaker = normalizeSentenceText(sentence.speaker);
        const aliasKey = rawSpeaker.toLowerCase().replace(/[\s_:\-]+/g, "");
        const mappedSpeaker = aliasMap.get(aliasKey);
        const existingSpeaker = rawSpeaker && assignments.some((assignment) => assignment.speaker === rawSpeaker)
            ? rawSpeaker
            : "";
        const canonicalSpeaker = mappedSpeaker
            || existingSpeaker
            || previousSpeaker
            || assignments[index % Math.max(1, assignments.length)]?.speaker
            || defaultSpeaker;

        previousSpeaker = canonicalSpeaker;
        return {
            ...sentence,
            speaker: canonicalSpeaker,
        };
    });
}

export function buildListeningCabinTopicSeed() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getListeningCabinRandomTopicPoolSize(scriptMode: ListeningCabinScriptMode) {
    return LISTENING_CABIN_RANDOM_TOPIC_POOLS[scriptMode]?.length ?? 0;
}

export function pickListeningCabinRandomTopic(
    seed: string,
    scriptMode: ListeningCabinScriptMode = "monologue",
) {
    const pool = LISTENING_CABIN_RANDOM_TOPIC_POOLS[scriptMode] ?? LISTENING_CABIN_RANDOM_TOPIC_POOLS.monologue;
    if (pool.length === 0) {
        return "一次贴近日常生活的英语口播";
    }

    const hash = seed.split("").reduce((acc, char) => {
        return (acc * 31 + char.charCodeAt(0)) >>> 0;
    }, 0);
    const index = hash % pool.length;
    return pool[index];
}

export function resolveListeningCabinTopicPrompt(request: ListeningCabinGenerationRequest) {
    const manualPrompt = normalizeSentenceText(request.prompt);

    if (request.topicMode === "manual") {
        return {
            effectivePrompt: manualPrompt,
            topicSeed: null as string | null,
            randomTopic: null as string | null,
        };
    }

    const topicSeed = buildListeningCabinTopicSeed();
    const randomTopic = pickListeningCabinRandomTopic(topicSeed, request.scriptMode);

    if (request.topicMode === "random") {
        return {
            effectivePrompt: manualPrompt || randomTopic,
            topicSeed,
            randomTopic,
        };
    }

    const effectivePrompt = request.topicSource === "ai" && manualPrompt
        ? manualPrompt
        : [manualPrompt, `你可以融合这个随机主题：${randomTopic}`].filter(Boolean).join("；");

    return {
        effectivePrompt: effectivePrompt || randomTopic,
        topicSeed,
        randomTopic,
    };
}

export function resolveListeningCabinSpeakerPlanForGeneration(
    request: ListeningCabinGenerationRequest,
    seedSource: string,
) {
    const fallbackVoice = normalizeListeningCabinVoice(request.speakerPlan.primaryVoice, DEFAULT_TTS_VOICE);

    if (isListeningCabinMultiSpeakerMode(request.scriptMode)) {
        const mode = request.scriptMode as Exclude<ListeningCabinScriptMode, "monologue">;
        const fallbackAssignments = buildDefaultMultiSpeakerAssignments(mode, fallbackVoice);
        const rawAssignments = request.speakerPlan.assignments.slice(0, LISTENING_CABIN_MULTI_SPEAKER_MAX);
        const expectedCount = Math.min(
            LISTENING_CABIN_MULTI_SPEAKER_MAX,
            Math.max(LISTENING_CABIN_MULTI_SPEAKER_MIN, rawAssignments.length),
        );
        const assignments = Array.from({ length: expectedCount }, (_, index) => {
            const existing = rawAssignments[index];
            const fallback = fallbackAssignments[index] ?? {
                speaker: getVoiceLabel(fallbackVoice),
                voice: fallbackVoice,
            };
            const voice = normalizeListeningCabinVoice(existing?.voice, fallback.voice);
            const preferredSpeaker = normalizeSpeakerName(existing?.speaker, getVoiceLabel(voice));
            const speaker = isGenericSpeakerName(preferredSpeaker) ? getVoiceLabel(voice) : preferredSpeaker;

            return {
                speaker,
                voice,
            } satisfies ListeningCabinSpeakerAssignment;
        });
        const uniqueVoiceAssignments = ensureUniqueVoiceAssignments(assignments, fallbackVoice);
        const usedSpeakerNames = new Set<string>();
        const normalizedUniqueAssignments = uniqueVoiceAssignments.map((assignment, index) => {
            const baseName = normalizeSpeakerName(assignment.speaker, getVoiceLabel(assignment.voice)) || getVoiceLabel(assignment.voice);
            let uniqueName = baseName;
            if (usedSpeakerNames.has(uniqueName)) {
                uniqueName = `${baseName} ${index + 1}`;
            }
            usedSpeakerNames.add(uniqueName);
            return {
                speaker: uniqueName,
                voice: assignment.voice,
            } satisfies ListeningCabinSpeakerAssignment;
        });

        return {
            strategy: "mixed_dialogue",
            primaryVoice: normalizedUniqueAssignments[0]?.voice ?? fallbackVoice,
            assignments: normalizedUniqueAssignments,
        } satisfies ListeningCabinSpeakerPlan;
    }

    if (request.speakerPlan.strategy === "random_single") {
        const hash = seedSource.split("").reduce((acc, char) => ((acc * 33) ^ char.charCodeAt(0)) >>> 0, 5381);
        const voice = ENGLISH_TTS_VOICES[hash % ENGLISH_TTS_VOICES.length] ?? fallbackVoice;
        return {
            strategy: "random_single",
            primaryVoice: voice,
            assignments: [{ speaker: getVoiceLabel(voice), voice }],
        } satisfies ListeningCabinSpeakerPlan;
    }

    return {
        strategy: "fixed",
        primaryVoice: fallbackVoice,
        assignments: [{ speaker: "Narrator", voice: fallbackVoice }],
    } satisfies ListeningCabinSpeakerPlan;
}

export function buildListeningCabinNarrationText(sentences: ListeningCabinSentence[]) {
    return sentences
        .map((sentence) => normalizeSentenceText(sentence.english))
        .filter(Boolean)
        .join(" ");
}

export function buildListeningCabinNarrationSegments(params: {
    sentences: ListeningCabinSentence[];
    scriptMode: ListeningCabinScriptMode;
    speakerPlan: ListeningCabinSpeakerPlan;
}) {
    const speakerVoiceMap = new Map<string, TtsVoice>();
    params.speakerPlan.assignments.forEach((assignment) => {
        speakerVoiceMap.set(normalizeSpeakerName(assignment.speaker, assignment.speaker), assignment.voice);
    });

    if (!isListeningCabinMultiSpeakerMode(params.scriptMode)) {
        return params.sentences
            .map((sentence) => {
                const text = normalizeSentenceText(sentence.english);
                if (!text) {
                    return null;
                }
                return {
                    text,
                    voice: params.speakerPlan.primaryVoice,
                    rate: listeningCabinSentencePaceToTtsRate(sentence.pace),
                };
            })
            .filter((segment): segment is { text: string; voice: TtsVoice; rate: string } => Boolean(segment));
    }

    const fallbackSpeaker = normalizeSpeakerName(
        params.speakerPlan.assignments[0]?.speaker,
        params.scriptMode === "podcast" ? "Host" : "Speaker A",
    );

    return params.sentences
        .map((sentence) => {
            const text = normalizeSentenceText(sentence.english);
            if (!text) {
                return null;
            }
            const speaker = normalizeSpeakerName(sentence.speaker, fallbackSpeaker);
            return {
                text,
                voice: speakerVoiceMap.get(speaker) ?? params.speakerPlan.primaryVoice,
                rate: listeningCabinSentencePaceToTtsRate(sentence.pace),
            };
        })
        .filter((segment): segment is { text: string; voice: TtsVoice; rate: string } => Boolean(segment));
}

export function buildListeningCabinPlaybackChunks(sentences: ListeningCabinSentence[]) {
    return sentences
        .map((sentence) => {
            const text = normalizeSentenceText(sentence.english);
            if (!text) {
                return null;
            }

            return {
                id: `${sentence.index}`,
                sentenceIndexes: [sentence.index - 1],
                text,
            } satisfies ListeningCabinPlaybackChunk;
        })
        .filter((chunk): chunk is ListeningCabinPlaybackChunk => Boolean(chunk));
}

export function buildListeningCabinSentenceTimings(
    sentences: ListeningCabinSentence[],
    marks: TtsWordMark[],
): ListeningCabinSentenceTiming[] {
    const narrationText = buildListeningCabinNarrationText(sentences);
    if (!narrationText) {
        return [];
    }

    const boundaries: number[] = [0];
    let cursor = 0;

    sentences.forEach((sentence, index) => {
        const normalizedEnglish = normalizeSentenceText(sentence.english);
        cursor += normalizedEnglish.length;
        boundaries.push(cursor);
        if (index < sentences.length - 1) {
            cursor += 1;
        }
    });

    const sentenceUnits = buildSentenceUnits(narrationText, boundaries);
    const wordMarks = marks.filter((mark) => mark.type === "word" && typeof mark.value === "string");
    const tokens = extractWordTokens(narrationText);
    const tokenToMark = alignTokensToMarks(tokens, wordMarks);

    const timings = sentenceUnits.map((unit, unitIndex) => {
        const unitTokens = tokens.filter((token) => token.start >= unit.start && token.end <= unit.end);
        const matchedMarkIndexes = unitTokens
            .map((token) => tokenToMark.get(token.index))
            .filter((markIndex): markIndex is number => typeof markIndex === "number");

        const firstMark = matchedMarkIndexes.length > 0 ? wordMarks[matchedMarkIndexes[0]] : null;
        const lastMark = matchedMarkIndexes.length > 0 ? wordMarks[matchedMarkIndexes[matchedMarkIndexes.length - 1]] : null;

        return {
            index: sentences[unitIndex]?.index ?? unitIndex + 1,
            startMs: firstMark?.time ?? lastMark?.time ?? 0,
            endMs: lastMark?.end ?? firstMark?.end ?? firstMark?.time ?? 0,
        } satisfies ListeningCabinSentenceTiming;
    });

    return timings.map((timing, index) => {
        const nextTiming = timings[index + 1];
        const startMs = index === 0 ? Math.max(0, timing.startMs) : Math.max(timings[index - 1].endMs, timing.startMs);
        const endMs = nextTiming ? Math.max(timing.endMs, nextTiming.startMs - 24) : Math.max(timing.endMs, startMs);

        return {
            index: timing.index,
            startMs,
            endMs,
        };
    });
}

export function buildListeningCabinAudioCacheKey(text: string, voice: string, playbackRate: number) {
    return JSON.stringify({
        text: normalizeSentenceText(text),
        voice,
        playbackRate: Number(playbackRate.toFixed(2)),
    });
}

export function buildListeningCabinMixedAudioCacheKey(
    segments: Array<{ text: string; voice: string; rate?: string }>,
    playbackRate: number,
) {
    return JSON.stringify({
        schemaVersion: "mixed-v2",
        segments: segments.map((segment) => ({
            text: normalizeSentenceText(segment.text),
            voice: segment.voice,
            rate: segment.rate ?? "+0%",
        })),
        playbackRate: Number(playbackRate.toFixed(2)),
    });
}

export function listeningCabinSentencePaceToTtsRate(pace: ListeningCabinSentencePace | undefined) {
    switch (pace) {
        case "slow":
            return "-12%";
        case "fast":
            return "+10%";
        case "normal":
        default:
            return "+0%";
    }
}

export function playbackRateToTtsRate(playbackRate: number) {
    const percentage = Math.round((playbackRate - 1) * 100);
    return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

export function generateListeningCabinSessionId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `listening-cabin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createListeningCabinSession(params: {
    response: ListeningCabinGenerationResponse;
    request: ListeningCabinGenerationRequest;
    showChineseSubtitle: boolean;
}): ListeningCabinSession {
    const now = Date.now();
    const resolvedSpeakerPlan = params.response.meta.resolvedSpeakerPlan ?? params.request.speakerPlan;
    const primaryVoice = resolvedSpeakerPlan.primaryVoice || params.request.speakerPlan.primaryVoice || DEFAULT_TTS_VOICE;

    return {
        id: generateListeningCabinSessionId(),
        created_at: now,
        updated_at: now,
        sourcePrompt: params.response.sourcePrompt,
        title: params.response.title,
        sentences: params.response.sentences,
        meta: params.response.meta,
        topicMode: params.request.topicMode,
        topicSource: params.request.topicSource,
        scriptMode: params.request.scriptMode,
        thinkingMode: params.request.thinkingMode,
        style: params.request.style,
        focusTags: params.request.focusTags,
        cefrLevel: params.request.cefrLevel,
        lexicalDensity: params.request.lexicalDensity,
        sentenceLength: params.request.sentenceLength,
        scriptLength: params.request.scriptLength,
        speakerPlan: resolvedSpeakerPlan,
        sentenceCount: params.response.sentences.length,
        topicSeed: params.response.meta.topicSeed ?? null,
        voice: primaryVoice,
        playbackRate: 1,
        showChineseSubtitle: params.showChineseSubtitle,
        lastSentenceIndex: 0,
        lastPlayedAt: null,
    };
}
