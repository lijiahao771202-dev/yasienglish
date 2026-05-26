import type { LocalUserProfile } from "@/lib/db";
import { glmModelSupportsThinking } from "@/lib/glm-model-catalog";
import {
    normalizeAiProvider,
    normalizeProfileDeepSeekModel,
    normalizeProfileDeepSeekReasoningEffort,
    normalizeProfileDeepSeekThinkingMode,
    normalizeProfileGithubModel,
    normalizeProfileGlmModel,
    normalizeProfileGlmThinkingMode,
    normalizeProfileMimoModel,
    normalizeProfileNvidiaModel,
} from "@/lib/profile-settings";

export type GrammarMode = "basic" | "deep";

export const GRAMMAR_BASIC_MODEL = "deepseek-chat";
export const GRAMMAR_BASIC_PROMPT_VERSION = "2026-05-26-basic-v13";

type GrammarProfileSource = Pick<
    LocalUserProfile,
    | "ai_provider"
    | "deepseek_model"
    | "deepseek_thinking_mode"
    | "deepseek_reasoning_effort"
    | "glm_model"
    | "glm_thinking_mode"
    | "nvidia_model"
    | "github_model"
    | "mimo_model"
>;

export function buildReadingGrammarExecutionSignature(profile?: Partial<GrammarProfileSource> | null) {
    const provider = normalizeAiProvider(profile?.ai_provider);

    if (provider === "github") {
        return `${provider}:${normalizeProfileGithubModel(profile?.github_model)}`;
    }

    if (provider === "nvidia") {
        return `${provider}:${normalizeProfileNvidiaModel(profile?.nvidia_model)}`;
    }

    if (provider === "mimo") {
        return `${provider}:${normalizeProfileMimoModel(profile?.mimo_model)}`;
    }

    if (provider === "glm") {
        const glmModel = normalizeProfileGlmModel(profile?.glm_model);
        return glmModelSupportsThinking(glmModel)
            ? `${provider}:${glmModel}:thinking=${normalizeProfileGlmThinkingMode(profile?.glm_thinking_mode)}`
            : `${provider}:${glmModel}`;
    }

    const deepSeekModel = normalizeProfileDeepSeekModel(profile?.deepseek_model);
    const deepSeekThinkingMode = normalizeProfileDeepSeekThinkingMode(profile?.deepseek_thinking_mode);
    const deepSeekReasoningEffort = deepSeekThinkingMode === "on"
        ? normalizeProfileDeepSeekReasoningEffort(profile?.deepseek_reasoning_effort)
        : undefined;

    return `${provider}:${deepSeekModel}:thinking=${deepSeekThinkingMode}:reasoning=${deepSeekReasoningEffort ?? "off"}`;
}

export interface GrammarBasicHighlight {
    substring: string;
    type: string;
    explanation: string;
    segment_translation?: string;
}

export interface GrammarBasicSentence {
    sentence: string;
    translation: string;
    highlights: GrammarBasicHighlight[];
}

export interface GrammarBasicResult {
    mode: "basic";
    tags: string[];
    overview: string;
    difficult_sentences: GrammarBasicSentence[];
}

export interface GrammarBasicPromptOptions {
    repairHints?: string[];
    repairCategories?: string[];
    patchMode?: boolean;
    existingAnalyses?: GrammarBasicSentence[];
}

export type GrammarSentenceSource = string | string[];

export interface GrammarSanitizeResult<T> {
    data: T;
    issues: string[];
    retryRecommended: boolean;
    qualityScore: number;
}

export type GrammarRepairCategory =
    | "missing_translation"
    | "missing_highlights"
    | "coarse_chunking";

export function hasUsableBasicGrammarResult(
    result: Pick<GrammarBasicResult, "difficult_sentences"> | null | undefined,
) {
    const sentences = Array.isArray(result?.difficult_sentences) ? result.difficult_sentences : [];
    if (sentences.length === 0) return false;

    return sentences.some((sentence) => {
        const highlights = Array.isArray(sentence?.highlights) ? sentence.highlights : [];
        return highlights.length > 0;
    });
}

const CANONICAL_GRAMMAR_TYPES = [
    "主语",
    "谓语",
    "宾语",
    "表语",
    "定语",
    "前置定语",
    "后置定语",
    "状语",
    "时间状语",
    "地点状语",
    "原因状语",
    "目的状语",
    "条件状语",
    "让步状语",
    "结果状语",
    "方式状语",
    "程度状语",
    "伴随状语",
    "补语",
    "同位语",
    "主句",
    "并列句",
    "并列主句",
    "从句",
    "主语从句",
    "宾语从句",
    "表语从句",
    "同位语从句",
    "名词性从句",
    "定语从句",
    "限制性定语从句",
    "非限制性定语从句",
    "关系从句",
    "状语从句",
    "时间状语从句",
    "地点状语从句",
    "原因状语从句",
    "目的状语从句",
    "条件状语从句",
    "让步状语从句",
    "结果状语从句",
    "方式状语从句",
    "比较状语从句",
    "非谓语",
    "分词短语",
    "不定式短语",
    "动名词短语",
    "介词短语",
    "短语",
    "连接成分",
    "倒装句",
    "虚拟语气",
    "强调句",
    "插入语",
    "语法点",
];

const WEAK_EXPLANATION_PATTERNS = [
    "语法功能",
    "语法成分",
    "特定语法功能",
    "更加丰富",
    "表达更完整",
    "用于强调",
];

function containsCjk(value: string) {
    return /[\u4e00-\u9fff]/.test(value);
}

const COMPLEX_SENTENCE_MARKERS = [
    /\bthat\b/i,
    /\bwhich\b/i,
    /\bwho\b/i,
    /\bwhom\b/i,
    /\bwhose\b/i,
    /\bwhen\b/i,
    /\bwhere\b/i,
    /\bwhile\b/i,
    /\balthough\b/i,
    /\bthough\b/i,
    /\bbecause\b/i,
    /\bif\b/i,
    /\bas\b/i,
    /\bcompared to\b/i,
    /\bpublished in\b/i,
    /\bincorporating\b/i,
    /\bleading to\b/i,
];

const INTERNAL_STRUCTURE_MARKERS = [
    /\bthat\b/i,
    /\bwhich\b/i,
    /\bwho\b/i,
    /\bwhom\b/i,
    /\bwhose\b/i,
    /\bwhen\b/i,
    /\bwhere\b/i,
    /\bwhile\b/i,
    /\balthough\b/i,
    /\bthough\b/i,
    /\bbecause\b/i,
    /\bif\b/i,
    /\bas\b/i,
    /\bcompared to\b/i,
    /\bpublished in\b/i,
    /\bincorporating\b/i,
    /\breceiving\b/i,
    /\bleading to\b/i,
];

function normalizeGrammarType(rawType: string) {
    const type = rawType.trim();
    if (!type) return "语法点";
    if (CANONICAL_GRAMMAR_TYPES.includes(type)) return type;

    const normalized = type
        .replace(/[\s()（）_-]+/g, "")
        .toLowerCase();
    if (normalized.includes("mainclause") || normalized.includes("主句")) return "主句";
    if (normalized.includes("coordinateclause") || normalized.includes("并列主句")) return "并列主句";
    if (normalized.includes("coordinatesentence") || normalized.includes("并列句")) return "并列句";
    if (normalized.includes("subjectclause") || normalized.includes("主语从句")) return "主语从句";
    if (normalized.includes("objectclause") || normalized.includes("宾语从句")) return "宾语从句";
    if (normalized.includes("predicativeclause") || normalized.includes("表语从句")) return "表语从句";
    if (normalized.includes("appositiveclause") || normalized.includes("同位语从句")) return "同位语从句";
    if (normalized.includes("nounclause") || normalized.includes("名词性从句")) return "名词性从句";
    if (normalized.includes("nonrestrictiverelativeclause") || normalized.includes("nondefiningrelativeclause") || normalized.includes("非限制性定语从句") || normalized.includes("非限定性定语从句")) return "非限制性定语从句";
    if (normalized.includes("restrictiverelativeclause") || normalized.includes("definingrelativeclause") || normalized.includes("限制性定语从句")) return "限制性定语从句";
    if (normalized.includes("relativeclause") || normalized.includes("adjectiveclause") || normalized.includes("关系从句") || normalized.includes("定语从句")) return "定语从句";
    if (normalized.includes("timeadverbialclause") || normalized.includes("时间状语从句")) return "时间状语从句";
    if (normalized.includes("placeadverbialclause") || normalized.includes("地点状语从句")) return "地点状语从句";
    if (normalized.includes("causeadverbialclause") || normalized.includes("reasonadverbialclause") || normalized.includes("原因状语从句")) return "原因状语从句";
    if (normalized.includes("purposeadverbialclause") || normalized.includes("目的状语从句")) return "目的状语从句";
    if (normalized.includes("conditionadverbialclause") || normalized.includes("条件状语从句")) return "条件状语从句";
    if (normalized.includes("concessionadverbialclause") || normalized.includes("让步状语从句")) return "让步状语从句";
    if (normalized.includes("resultadverbialclause") || normalized.includes("结果状语从句")) return "结果状语从句";
    if (normalized.includes("manneradverbialclause") || normalized.includes("方式状语从句")) return "方式状语从句";
    if (normalized.includes("comparisonadverbialclause") || normalized.includes("比较状语从句")) return "比较状语从句";
    if (normalized.includes("adverbialclause") || normalized.includes("状语从句")) return "状语从句";
    if (normalized.includes("prepositiveattributive") || normalized.includes("前置定语")) return "前置定语";
    if (normalized.includes("postpositiveattributive") || normalized.includes("后置定语")) return "后置定语";
    if (normalized.includes("timeadverbial") || normalized.includes("时间状语")) return "时间状语";
    if (normalized.includes("placeadverbial") || normalized.includes("地点状语")) return "地点状语";
    if (normalized.includes("reasonadverbial") || normalized.includes("causeadverbial") || normalized.includes("原因状语")) return "原因状语";
    if (normalized.includes("purposeadverbial") || normalized.includes("目的状语")) return "目的状语";
    if (normalized.includes("conditionadverbial") || normalized.includes("条件状语")) return "条件状语";
    if (normalized.includes("concessionadverbial") || normalized.includes("让步状语")) return "让步状语";
    if (normalized.includes("resultadverbial") || normalized.includes("结果状语")) return "结果状语";
    if (normalized.includes("manneradverbial") || normalized.includes("方式状语")) return "方式状语";
    if (normalized.includes("degreeadverbial") || normalized.includes("程度状语")) return "程度状语";
    if (normalized.includes("accompanyingadverbial") || normalized.includes("accompanimentadverbial") || normalized.includes("伴随状语")) return "伴随状语";
    if (normalized.includes("prepositionalphrase") || normalized.includes("prepphrase") || normalized.includes("介词短语")) return "介词短语";
    if (normalized.includes("participlephrase") || normalized.includes("分词短语")) return "分词短语";
    if (normalized.includes("infinitivephrase") || normalized.includes("不定式短语")) return "不定式短语";
    if (normalized.includes("gerundphrase") || normalized.includes("动名词短语")) return "动名词短语";
    if (normalized.includes("inversion") || normalized.includes("倒装")) return "倒装句";
    if (normalized.includes("subjunctive") || normalized.includes("虚拟")) return "虚拟语气";
    if (normalized.includes("cleft") || normalized.includes("emphatic") || normalized.includes("强调句")) return "强调句";
    if (normalized.includes("parenthetical") || normalized.includes("插入语")) return "插入语";
    if (normalized.includes("subject") || normalized.includes("主语")) return "主语";
    if (normalized.includes("predicate") || normalized.includes("谓语")) return "谓语";
    if (normalized.includes("object") || normalized.includes("宾语")) return "宾语";
    if (normalized.includes("predicative") || normalized.includes("表语")) return "表语";
    if (normalized.includes("attributive") || normalized.includes("定语")) return "定语";
    if (normalized.includes("adverbial") || normalized.includes("状语")) return "状语";
    if (normalized.includes("complement") || normalized.includes("补语")) return "补语";
    if (normalized.includes("appositive") || normalized.includes("同位语")) return "同位语";
    if (normalized.includes("clause") || normalized.includes("从句")) return "从句";
    if (normalized.includes("nonfinite") || normalized.includes("非谓语")) return "非谓语";
    if (normalized.includes("phrase") || normalized.includes("短语")) return "短语";
    return "语法点";
}

function isWeakExplanation(value: string) {
    if (!value) return true;
    if (value.length < 10) return true;
    const lowered = value.toLowerCase();
    return WEAK_EXPLANATION_PATTERNS.some((pattern) => lowered.includes(pattern.toLowerCase()));
}

function enrichBasicExplanation(type: string, substring: string, rawExplanation: string) {
    const normalized = rawExplanation.trim();
    if (!isWeakExplanation(normalized)) return normalized;
    const safeType = type.trim() || "语法点";
    return `**结构判断**：这部分属于${safeType}。\n\n**句中作用**：帮助你看清这句话里的意思。`;
}

function normalizeSegmentTranslation(rawTranslation: string, substring: string) {
    const translation = rawTranslation.trim();
    if (translation && containsCjk(translation)) return translation;
    const safeChunk = substring.trim();
    if (!safeChunk) return "";
    return `在本句中可理解为“${safeChunk}”所指的语义片段`;
}

function toFiniteString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: string[], max: number) {
    const set = new Set<string>();
    for (const value of values) {
        if (!value) continue;
        if (set.size >= max) break;
        set.add(value);
    }
    return Array.from(set);
}

function hashFNV1a(input: string) {
    let hash = 0x811c9dc5;
    for (let idx = 0; idx < input.length; idx += 1) {
        hash ^= input.charCodeAt(idx);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeGrammarText(text: string) {
    return text
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\u00a0/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export function sentenceIdentity(sentence: string) {
    return normalizeGrammarText(sentence)
        .replace(/\s+/g, " ")
        .replace(/[“”]/g, "\"")
        .replace(/[‘’]/g, "'")
        .replace(/[—–]/g, "-")
        .replace(/\s*([,.;:!?])/g, "$1")
        .toLowerCase();
}

export function normalizeGrammarSentenceList(input: GrammarSentenceSource) {
    if (Array.isArray(input)) {
        return input
            .map((item) => normalizeGrammarText(typeof item === "string" ? item : ""))
            .filter(Boolean);
    }

    return splitGrammarSentences(input);
}

export function splitGrammarSentences(text: string) {
    const normalized = normalizeGrammarText(text);
    if (!normalized) return [];

    const matched = normalized.match(/[^.!?。！？\n]+(?:[.!?。！？]+|$)/g) ?? [];
    const sentences = matched
        .map((item) => item.trim())
        .filter(Boolean);

    if (sentences.length > 0) return sentences;

    return normalized
        .split(/\n+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function buildGrammarCacheKey(params: {
    text: string;
    mode: GrammarMode;
    promptVersion: string;
    model: string;
}) {
    const normalizedText = normalizeGrammarText(params.text);
    const signature = `${params.mode}\n${params.promptVersion}\n${params.model}\n${normalizedText}`;
    const digest = hashFNV1a(signature);
    return `grammar:${params.mode}:${params.promptVersion}:${params.model}:${normalizedText.length}:${digest}`;
}

export function buildGrammarBasicPrompt(
    input: GrammarSentenceSource,
    repairHintsOrOptions: string[] | GrammarBasicPromptOptions = [],
) {
    const sentences = normalizeGrammarSentenceList(input);
    const options = Array.isArray(repairHintsOrOptions)
        ? { repairHints: repairHintsOrOptions }
        : repairHintsOrOptions;
    const repairCategories = Array.isArray(options.repairCategories)
        ? Array.from(new Set(options.repairCategories.filter(Boolean)))
        : [];
    const patchMode = options.patchMode === true;
    const existingAnalyses = Array.isArray(options.existingAnalyses) ? options.existingAnalyses : [];

    const repairBlock = repairCategories.length > 0
        ? `
REPAIR REQUIREMENTS:
- You are repairing a previously incomplete sentence batch.
- Repair categories for this batch:
${repairCategories.length > 0 ? repairCategories.map((category) => `- ${category}`).join("\n") : "- unspecified_repair"}
`
        : "";

    const patchContextBlock = patchMode
        ? `
PATCH MODE:
- This request is repairing a small sentence batch, not regenerating the whole paragraph.
- Return analysis ONLY for the sentences inside this batch.
- Keep any already-correct coverage and only patch missing translations, missing highlights, or coarse chunking.
- Do not drop a sentence that already appears in this batch.
${existingAnalyses.length > 0 ? `CURRENT BATCH STATUS:
${existingAnalyses.map((item, index) => {
    const translationStatus = item.translation.trim() ? "present" : "missing";
    const highlightStatus = item.highlights.length > 0 ? `present(${Math.min(item.highlights.length, 4)})` : "missing";
    return `- Sentence ${index + 1}: "${item.sentence}"\n  - translation_status: ${translationStatus}\n  - highlight_status: ${highlightStatus}`;
}).join("\n")}` : ""}
`
        : "";

    return `
Analyze the grammar of the following English sentences for a Chinese native speaker learning English.

OBJECTIVE:
1. For EACH target sentence, provide a natural Chinese translation.
2. Use a clause-first workflow before highlighting:
   - Identify the main clause first.
   - Then identify subordinate clauses / relative clauses / adverbial clauses / non-finite structures / parenthetical inserts.
   - For long sentences, prioritize the real backbone over decorative wording.
3. Analyze sentence structure with high coverage:
   - Main components: Subject (主语), Predicate/Verb (谓语), Object/Predicative (宾语/表语).
   - Modifiers: Attributive (定语), Adverbial (状语), Complement (补语), Appositive (同位语).
   - Clauses/structures when present.
   - The goal is teaching-ready chunking, not minimum-viable labeling.
4. Prefer the most specific grammar type possible for highlight.type.
   - Use 时间状语从句 / 条件状语从句 / 让步状语从句 / 原因状语从句 / 目的状语从句 when the subtype is clear.
   - Use 宾语从句 / 主语从句 / 表语从句 / 同位语从句 instead of generic 从句 or 名词性从句 when the clause role is clear.
   - Use 定语从句 instead of generic 从句 when it modifies a noun.
   - Use 介词短语 / 分词短语 / 不定式短语 / 动名词短语 instead of generic 短语 when the phrase form is clear.
   - Use 非谓语 only when the exact phrase form is not clear.
   - Do NOT collapse a specific structure into a broad label unless you genuinely cannot identify the subtype.
5. Every highlight.explanation MUST be Markdown-ready and teacher-like.
   - Lead with one bold judgment sentence.
   - Then use 1 to 2 short lines or bullets to explain the role in the sentence.
   - Explain: 这部分是什么 + 它在句里干什么 + 为什么值得单独标出来.
   - If a grammar term is hard, immediately unpack it in simpler words.
   - Avoid rigid textbook labels as section headers; prefer natural explanation.
6. Every segment_translation MUST be contextual (in THIS sentence), not dictionary-only.
7. Chunking Rules for long / complex sentences:
   - Do NOT stop at the outer clause boundary.
   - If a chunk still contains an internal clause, non-finite modifier, appositive, comparison, publication/source detail, or time detail, split it again.
   - Avoid oversized chunks. Each chunk should usually carry one main grammar job only.
   - Long noun phrases must be decomposed when they contain post-modifiers such as relative clauses, participial phrases, prepositional phrases, appositives, publication/source details, or year/time details.
   - After labeling a clause such as 宾语从句 / 定语从句 / 状语从句, continue exposing its internal backbone when that backbone is still pedagogically important.
   - Prefer 5-12 meaningful chunks for a long complex sentence rather than 2-4 oversized chunks.
   - Never merge a clause label and all of its internal content into one giant chunk when the internal structure is still analyzable.
8. Overlap control:
   - For the same substring span, return only ONE best grammar label.
   - Do NOT stack competing labels onto the same text span.

Target sentences:
${sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join("\n")}

OUTPUT STRICT JSON ONLY:
{
  "tags": ["Tag1", "Tag2"],
  "overview": "Brief summary",
  "sentences": [
    {
      "sentence": "Exact substring from original text",
      "translation": "Chinese translation",
      "highlights": [
        {
          "substring": "exact substring in sentence",
          "type": "主语",
          "explanation": "Explanation",
          "segment_translation": "Translation"
        }
      ]
    }
  ]
}

CONSTRAINTS:
- Keep sentence order exactly as listed in Target sentences.
- You MUST return one entry for every target sentence. Do not skip short, simple, or summary-like sentences.
- "sentence" must be an exact substring.
- "type" must be Simplified Chinese and should prefer specific labels such as 主语/谓语/宾语/表语/定语/状语/补语/同位语/主句/宾语从句/主语从句/表语从句/同位语从句/定语从句/时间状语从句/原因状语从句/目的状语从句/条件状语从句/让步状语从句/介词短语/分词短语/不定式短语/动名词短语/倒装句/虚拟语气/强调句.
- Each sentence should contain at least one highlight unless truly trivial.
- For long sentences, at least one highlight should capture the clause backbone, not only isolated words.
- Do NOT stop at the outer clause boundary for long sentences.
- Avoid oversized chunks.
- Do NOT return duplicate labels for the exact same substring span.
- Long noun phrases must be decomposed when they include internal modifiers or source/time tails.
- Explanations should sound like a teacher speaking to a learner in simple Chinese.
- Keep each explanation compact and easy to scan.
- Return JSON object only, no markdown, no extra text.
${patchContextBlock}
${repairBlock}
`.trim();
}

function coerceSubstringFromSentence(sentence: string, rawSubstring: string) {
    const direct = rawSubstring.trim();
    if (!direct) return "";
    if (sentence.includes(direct)) return direct;

    const sentenceLower = sentence.toLowerCase();
    const directLower = direct.toLowerCase();
    const start = sentenceLower.indexOf(directLower);
    if (start === -1) return "";
    return sentence.slice(start, start + direct.length);
}

function sanitizeHighlights(rawHighlights: unknown, sentence: string, issues: string[]) {
    if (!Array.isArray(rawHighlights)) {
        return [] as GrammarBasicHighlight[];
    }

    const highlights: GrammarBasicHighlight[] = [];
    rawHighlights.forEach((item, index) => {
        const payload = item as Record<string, unknown>;
        const substring = coerceSubstringFromSentence(sentence, toFiniteString(payload?.substring));
        if (!substring) {
            issues.push(`highlights[${index}] substring missing or out of sentence`);
            return;
        }

        const type = normalizeGrammarType(toFiniteString(payload?.type));
        const explanation = enrichBasicExplanation(
            type,
            substring,
            toFiniteString(payload?.explanation) || "",
        );
        const segmentTranslation = normalizeSegmentTranslation(
            toFiniteString(payload?.segment_translation),
            substring,
        );

        highlights.push({
            substring,
            type,
            explanation,
            ...(segmentTranslation ? { segment_translation: segmentTranslation } : {}),
        });
    });

    return highlights.slice(0, 20);
}

function matchRawSentenceItem(
    rawItems: Array<Record<string, unknown>>,
    sentence: string,
    used: Set<number>,
) {
    const exactIndex = rawItems.findIndex((item, idx) => {
        if (used.has(idx)) return false;
        return toFiniteString(item?.sentence) === sentence;
    });
    if (exactIndex >= 0) {
        used.add(exactIndex);
        return rawItems[exactIndex];
    }

    const target = sentenceIdentity(sentence);
    const fuzzyIndex = rawItems.findIndex((item, idx) => {
        if (used.has(idx)) return false;
        const candidate = sentenceIdentity(toFiniteString(item?.sentence));
        return candidate === target;
    });
    if (fuzzyIndex >= 0) {
        used.add(fuzzyIndex);
        return rawItems[fuzzyIndex];
    }

    return null;
}

function buildFallbackBasic(source: GrammarSentenceSource): GrammarBasicResult {
    const sentences = normalizeGrammarSentenceList(source);
    return {
        mode: "basic",
        tags: ["句子主干", "结构拆分"],
        overview: "已生成基础语法骨架，建议展开重点句继续深度分析。",
        difficult_sentences: sentences.map((sentence) => ({
            sentence,
            translation: "",
            highlights: [],
        })),
    };
}

function scoreBasicQuality(result: GrammarBasicResult, expectedSentences: string[]) {
    const sentenceCount = Math.max(1, expectedSentences.length || result.difficult_sentences.length);
    const translatedCount = result.difficult_sentences.filter((item) => item.translation.trim().length > 0).length;
    const highlightedCount = result.difficult_sentences.filter((item) => item.highlights.length > 0).length;
    const totalHighlights = result.difficult_sentences.reduce((sum, item) => sum + item.highlights.length, 0);
    const detailedHighlights = result.difficult_sentences.reduce((sum, item) => (
        sum + item.highlights.filter((h) => !isWeakExplanation(h.explanation)).length
    ), 0);
    const contextualSegments = result.difficult_sentences.reduce((sum, item) => (
        sum + item.highlights.filter((h) => Boolean(h.segment_translation && containsCjk(h.segment_translation))).length
    ), 0);

    const translationCoverage = translatedCount / sentenceCount;
    const sentenceHighlightCoverage = highlightedCount / sentenceCount;
    const detailCoverage = totalHighlights > 0 ? detailedHighlights / totalHighlights : 0;
    const segmentCoverage = totalHighlights > 0 ? contextualSegments / totalHighlights : 0;
    const overviewScore = result.overview.trim().length >= 12 ? 1 : 0;

    return Number((
        translationCoverage * 0.28
        + sentenceHighlightCoverage * 0.28
        + detailCoverage * 0.2
        + segmentCoverage * 0.14
        + overviewScore * 0.1
    ).toFixed(4));
}

function countAsciiWords(value: string) {
    return (value.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).length;
}

function isComplexSentenceLikely(sentence: string) {
    const normalized = normalizeGrammarText(sentence);
    if (countAsciiWords(normalized) >= 25) return true;
    return COMPLEX_SENTENCE_MARKERS.some((pattern) => pattern.test(normalized));
}

function isStructurallyRichType(type: string) {
    return /(从句|短语|状语|定语|同位语|补语|插入语|非谓语)/.test(type);
}

function sentenceHasCoarseChunking(sentence: GrammarBasicSentence) {
    if (!isComplexSentenceLikely(sentence.sentence)) return false;

    const highlights = sentence.highlights;
    if (highlights.length <= 3) return true;

    const sentenceWordCount = countAsciiWords(sentence.sentence);
    if (sentenceWordCount < 22) return false;

    const oversizedStructuredChunks = highlights.filter((highlight) => {
        if (!isStructurallyRichType(highlight.type)) return false;
        const wordCount = countAsciiWords(highlight.substring);
        if (wordCount < 12) return false;
        return INTERNAL_STRUCTURE_MARKERS.some((pattern) => pattern.test(highlight.substring));
    });

    return oversizedStructuredChunks.length > 0;
}

export function sanitizeGrammarBasicPayload(raw: unknown, source: GrammarSentenceSource): GrammarSanitizeResult<GrammarBasicResult> {
    const issues: string[] = [];
    const fallback = buildFallbackBasic(source);
    const payload = raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
    if (!payload) {
        issues.push("payload is not an object");
        return {
            data: fallback,
            issues,
            retryRecommended: true,
            qualityScore: 0,
        };
    }

    const expectedSentences = normalizeGrammarSentenceList(source);
    const rawTags = Array.isArray(payload.tags) ? payload.tags.map((item) => toFiniteString(item)) : [];
    if (!Array.isArray(payload.tags)) {
        issues.push("tags is missing or not an array");
    }

    const overview = toFiniteString(payload.overview) || fallback.overview;
    if (!toFiniteString(payload.overview)) {
        issues.push("overview is missing");
    }

    const rawSentenceSource = Array.isArray(payload.sentences)
        ? payload.sentences
        : (Array.isArray(payload.difficult_sentences) ? payload.difficult_sentences : []);
    const rawSentenceItems = rawSentenceSource
        .map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : {}));
    if (!Array.isArray(payload.sentences) && !Array.isArray(payload.difficult_sentences)) {
        issues.push("sentences is missing or not an array");
    }

    const used = new Set<number>();
    const difficultSentences: GrammarBasicSentence[] = [];
    let missingTranslationCount = 0;
    let missingHighlightSentenceCount = 0;

    if (expectedSentences.length > 0) {
        expectedSentences.forEach((sentence) => {
            const matched = matchRawSentenceItem(rawSentenceItems, sentence, used) ?? {};
            const translation = toFiniteString(matched.translation);
            if (!translation) {
                missingTranslationCount += 1;
                issues.push(`sentence "${sentence.slice(0, 32)}" translation is missing`);
            }
            const highlights = sanitizeHighlights(matched.highlights, sentence, issues);
            if (highlights.length === 0) {
                missingHighlightSentenceCount += 1;
                issues.push(`sentence "${sentence.slice(0, 32)}" has no valid highlights`);
            }
            difficultSentences.push({
                sentence,
                translation,
                highlights,
            });
        });
    } else {
        rawSentenceItems.forEach((item, index) => {
            const sentence = toFiniteString(item.sentence);
            if (!sentence) {
                issues.push(`difficult_sentences[${index}].sentence is missing`);
                return;
            }
            difficultSentences.push({
                sentence,
                translation: toFiniteString(item.translation),
                highlights: sanitizeHighlights(item.highlights, sentence, issues),
            });
        });
    }

    if (difficultSentences.length === 0) {
        issues.push("no valid sentence entries");
    }

    const coarseChunkedSentences = difficultSentences.filter(sentenceHasCoarseChunking);
    coarseChunkedSentences.forEach((sentence) => {
        issues.push(`sentence "${sentence.sentence.slice(0, 32)}" chunking is too coarse for a complex sentence`);
    });

    const highlightCount = difficultSentences.reduce((sum, sentence) => sum + sentence.highlights.length, 0);
    if (highlightCount === 0) {
        issues.push("no valid highlights");
    }

    const data: GrammarBasicResult = {
        mode: "basic",
        tags: uniqueStrings(rawTags, 12).length > 0 ? uniqueStrings(rawTags, 12) : fallback.tags,
        overview,
        difficult_sentences: difficultSentences.length > 0 ? difficultSentences : fallback.difficult_sentences,
    };
    const qualityScore = scoreBasicQuality(data, expectedSentences);
    const severeCoverageIssue =
        missingHighlightSentenceCount > 0
        || missingTranslationCount > 0
        || coarseChunkedSentences.length > 0;

    return {
        data,
        issues,
        retryRecommended: severeCoverageIssue || (issues.length > 0 && (highlightCount === 0 || difficultSentences.length === 0 || qualityScore < 0.52)),
        qualityScore,
    };
}
