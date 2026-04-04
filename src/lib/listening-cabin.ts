import type { EnglishLevel, TtsVoice } from "@/lib/profile-settings";
import {
    alignTokensToMarks,
    buildSentenceUnits,
    extractWordTokens,
    type TtsWordMark,
} from "@/lib/read-speaking";

export type ListeningCabinScriptStyle =
    | "daily_conversation"
    | "storytelling"
    | "news_explainer"
    | "workplace"
    | "travel"
    | "interview"
    | "academic_mini_talk";

export type ListeningCabinFocusTag =
    | "reduced_forms"
    | "linking"
    | "everyday_vocabulary"
    | "business_vocabulary"
    | "numbers_and_dates"
    | "fast_speech"
    | "accent_exposure";

export interface ListeningCabinSentence {
    index: number;
    english: string;
    chinese: string;
}

export interface ListeningCabinGenerationRequest {
    prompt: string;
    style: ListeningCabinScriptStyle;
    focusTags: ListeningCabinFocusTag[];
    cefrLevel: EnglishLevel;
    targetDurationMinutes: number;
    sentenceCount: number;
}

export interface ListeningCabinGenerationResponse {
    title: string;
    sourcePrompt: string;
    sentences: ListeningCabinSentence[];
    meta: {
        cefrLevel: EnglishLevel;
        targetDurationMinutes: number;
        sentenceCount: number;
        model: string;
    };
}

export interface ListeningCabinSession extends ListeningCabinGenerationResponse {
    id: string;
    created_at: number;
    updated_at: number;
    style: ListeningCabinScriptStyle;
    focusTags: ListeningCabinFocusTag[];
    cefrLevel: EnglishLevel;
    targetDurationMinutes: number;
    sentenceCount: number;
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

type Option<T extends string> = {
    value: T;
    label: string;
    hint: string;
};

export const LISTENING_CABIN_SCRIPT_STYLE_OPTIONS: Array<Option<ListeningCabinScriptStyle>> = [
    { value: "daily_conversation", label: "日常对话", hint: "自然口语、生活场景、语速稳。" },
    { value: "storytelling", label: "故事讲述", hint: "更有画面感，适合练长句节奏。" },
    { value: "news_explainer", label: "新闻解释", hint: "信息密度高，适合精听关键信息。" },
    { value: "workplace", label: "职场沟通", hint: "会议、汇报、同事沟通类表达。" },
    { value: "travel", label: "旅行场景", hint: "问路、订票、酒店与突发情况。" },
    { value: "interview", label: "面试表达", hint: "问答明确，适合练正式口语。" },
    { value: "academic_mini_talk", label: "学术短讲", hint: "更偏课堂和 mini lecture 风格。" },
];

export const LISTENING_CABIN_FOCUS_OPTIONS: Array<Option<ListeningCabinFocusTag>> = [
    { value: "reduced_forms", label: "弱读缩读", hint: "练 can't, gonna, wanna 这类口语化弱读。" },
    { value: "linking", label: "连读", hint: "让句子更像真实口语，不是单词拼接。" },
    { value: "everyday_vocabulary", label: "日常词汇", hint: "生活、学习、社交高频表达。" },
    { value: "business_vocabulary", label: "商务词汇", hint: "会议、汇报、合作与工作场景。" },
    { value: "numbers_and_dates", label: "数字日期", hint: "金额、日期、时间与数量信息。" },
    { value: "fast_speech", label: "快语速", hint: "提高抗压和抓重点能力。" },
    { value: "accent_exposure", label: "口音暴露", hint: "保留更自然的表达差异感。" },
];

export const LISTENING_CABIN_CEFR_OPTIONS: EnglishLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const LISTENING_CABIN_DURATION_OPTIONS = [2, 3, 5, 8, 10];
export const LISTENING_CABIN_SENTENCE_COUNT_OPTIONS = [4, 5, 6, 8, 10, 12];
export const LISTENING_CABIN_PLAYBACK_RATE_OPTIONS = [0.85, 0.95, 1, 1.1, 1.2];

export const DEFAULT_LISTENING_CABIN_REQUEST: ListeningCabinGenerationRequest = {
    prompt: "",
    style: "daily_conversation",
    focusTags: ["everyday_vocabulary"],
    cefrLevel: "B1",
    targetDurationMinutes: 3,
    sentenceCount: 6,
};

const SCRIPT_STYLE_SET = new Set<ListeningCabinScriptStyle>(
    LISTENING_CABIN_SCRIPT_STYLE_OPTIONS.map((option) => option.value),
);
const FOCUS_TAG_SET = new Set<ListeningCabinFocusTag>(
    LISTENING_CABIN_FOCUS_OPTIONS.map((option) => option.value),
);
const CEFR_SET = new Set<EnglishLevel>(LISTENING_CABIN_CEFR_OPTIONS);

function normalizeSentenceText(value: unknown) {
    return typeof value === "string"
        ? value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()
        : "";
}

export function normalizeListeningCabinRequest(
    payload: Partial<ListeningCabinGenerationRequest> | null | undefined,
): ListeningCabinGenerationRequest {
    const prompt = normalizeSentenceText(payload?.prompt);
    const style = SCRIPT_STYLE_SET.has(payload?.style as ListeningCabinScriptStyle)
        ? payload?.style as ListeningCabinScriptStyle
        : DEFAULT_LISTENING_CABIN_REQUEST.style;
    const focusTags = Array.isArray(payload?.focusTags)
        ? Array.from(new Set(payload.focusTags.filter((tag): tag is ListeningCabinFocusTag => FOCUS_TAG_SET.has(tag as ListeningCabinFocusTag))))
        : DEFAULT_LISTENING_CABIN_REQUEST.focusTags;
    const cefrLevel = CEFR_SET.has(payload?.cefrLevel as EnglishLevel)
        ? payload?.cefrLevel as EnglishLevel
        : DEFAULT_LISTENING_CABIN_REQUEST.cefrLevel;
    const rawTargetDurationMinutes = payload?.targetDurationMinutes;
    const rawSentenceCount = payload?.sentenceCount;
    const targetDurationMinutes = typeof rawTargetDurationMinutes === "number" && Number.isFinite(rawTargetDurationMinutes)
        ? Math.round(rawTargetDurationMinutes)
        : DEFAULT_LISTENING_CABIN_REQUEST.targetDurationMinutes;
    const sentenceCount = typeof rawSentenceCount === "number" && Number.isFinite(rawSentenceCount)
        ? Math.round(rawSentenceCount)
        : DEFAULT_LISTENING_CABIN_REQUEST.sentenceCount;

    return {
        prompt,
        style,
        focusTags: focusTags.length > 0 ? focusTags : DEFAULT_LISTENING_CABIN_REQUEST.focusTags,
        cefrLevel,
        targetDurationMinutes,
        sentenceCount,
    };
}

export function validateListeningCabinRequest(request: ListeningCabinGenerationRequest) {
    if (!request.prompt.trim()) {
        return "Prompt is required.";
    }

    if (!CEFR_SET.has(request.cefrLevel)) {
        return "Invalid CEFR level.";
    }

    if (!SCRIPT_STYLE_SET.has(request.style)) {
        return "Invalid script style.";
    }

    if (request.sentenceCount < 3 || request.sentenceCount > 24) {
        return "Sentence count must be between 3 and 24.";
    }

    if (request.targetDurationMinutes < 1 || request.targetDurationMinutes > 15) {
        return "Target duration must be between 1 and 15 minutes.";
    }

    return null;
}

export function normalizeListeningCabinSentences(raw: unknown, fallbackCount: number) {
    if (!Array.isArray(raw)) {
        return [];
    }

    const sentences = raw
        .map((item, index) => {
            const english = normalizeSentenceText((item as { english?: unknown })?.english);
            const chinese = normalizeSentenceText((item as { chinese?: unknown })?.chinese);
            if (!english || !chinese) {
                return null;
            }

            return {
                index: index + 1,
                english,
                chinese,
            } satisfies ListeningCabinSentence;
        })
        .filter((item): item is ListeningCabinSentence => Boolean(item));

    return sentences.slice(0, fallbackCount);
}

export function buildListeningCabinPrompt(request: ListeningCabinGenerationRequest) {
    const styleLabel = LISTENING_CABIN_SCRIPT_STYLE_OPTIONS.find((option) => option.value === request.style)?.label ?? request.style;
    const focusLabels = request.focusTags
        .map((tag) => LISTENING_CABIN_FOCUS_OPTIONS.find((option) => option.value === tag)?.label ?? tag)
        .join("、");
    const targetWordCount = Math.max(120, Math.round(request.targetDurationMinutes * 145));
    const preferredSentenceCount = Math.max(3, request.sentenceCount);
    const averageWordsPerSentence = Math.max(14, Math.round(targetWordCount / preferredSentenceCount));

    return `
You are creating an English listening training script for a Chinese learner.

Goal:
- Write a natural SPOKEN monologue for immersive listening practice.
- The learner should feel like one person is giving a smooth voice-over, not having a dialogue.
- The script will be shown sentence by sentence as subtitles, but the audio will be synthesized as one full narration.

Request:
- Learner prompt: ${request.prompt}
- Script style: ${styleLabel}
- CEFR level: ${request.cefrLevel}
- Target duration: around ${request.targetDurationMinutes} minutes of spoken audio
- Target word count: around ${targetWordCount} English words total
- Preferred subtitle chunks: around ${preferredSentenceCount} sentences
- Preferred average sentence length: around ${averageWordsPerSentence} words
- Listening focus: ${focusLabels || "自然口语"}

Hard requirements:
- Return exactly one JSON object.
- Title should be concise and practical.
- The script must be a SINGLE-SPEAKER spoken monologue.
- No dialogue, no back-and-forth, no interviewer/interviewee structure, no speaker labels.
- Sentences must sound like natural voice-over English, not like a textbook essay.
- Do not make the sentences too short or choppy.
- Each sentence should usually be medium-length, flowing, and natural for one breath group.
- Prioritize natural pacing and target duration over rigid sentence count.
- Each sentence must include:
  - english: one natural spoken-English sentence
  - chinese: one concise Chinese translation
- Keep transitions smooth between sentences.
- Make the full script feel continuous from beginning to end.
- Avoid long paragraphs, quotes, markdown, or explanations outside JSON.
- Do not generate reading-article style introductions or conclusions.

Return this exact JSON shape:
{
  "title": "short title",
  "sentences": [
    { "english": "sentence 1", "chinese": "句子1翻译" }
  ]
}
`.trim();
}

export function buildListeningCabinNarrationText(sentences: ListeningCabinSentence[]) {
    return sentences
        .map((sentence) => normalizeSentenceText(sentence.english))
        .filter(Boolean)
        .join(" ");
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
    voice: TtsVoice;
    playbackRate: number;
    showChineseSubtitle: boolean;
}): ListeningCabinSession {
    const now = Date.now();

    return {
        id: generateListeningCabinSessionId(),
        created_at: now,
        updated_at: now,
        sourcePrompt: params.response.sourcePrompt,
        title: params.response.title,
        sentences: params.response.sentences,
        meta: params.response.meta,
        style: params.request.style,
        focusTags: params.request.focusTags,
        cefrLevel: params.request.cefrLevel,
        targetDurationMinutes: params.request.targetDurationMinutes,
        sentenceCount: params.response.meta.sentenceCount,
        voice: params.voice,
        playbackRate: params.playbackRate,
        showChineseSubtitle: params.showChineseSubtitle,
        lastSentenceIndex: 0,
        lastPlayedAt: null,
    };
}
