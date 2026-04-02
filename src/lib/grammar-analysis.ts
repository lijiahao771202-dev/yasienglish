export type GrammarMode = "basic" | "deep";

export const GRAMMAR_BASIC_MODEL = "deepseek-chat";
export const GRAMMAR_DEEP_MODEL = "deepseek-chat";
export const GRAMMAR_BASIC_PROMPT_VERSION = "2026-04-02-basic-v4";
export const GRAMMAR_DEEP_PROMPT_VERSION = "2026-04-02-deep-v3";

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

export interface GrammarDeepTreeNode {
    label: string;
    text: string;
    children: GrammarDeepTreeNode[];
}

export interface GrammarDeepPoint {
    point: string;
    explanation: string;
}

export interface GrammarDeepSentenceResult {
    sentence: string;
    sentence_tree: GrammarDeepTreeNode | null;
    analysis_results: GrammarDeepPoint[];
}

export interface GrammarDeepResult {
    mode: "deep";
    difficult_sentences: GrammarDeepSentenceResult[];
    partial_failures: number;
}

export interface GrammarSanitizeResult<T> {
    data: T;
    issues: string[];
    retryRecommended: boolean;
    qualityScore: number;
}

const CANONICAL_GRAMMAR_TYPES = [
    "主语",
    "谓语",
    "宾语",
    "表语",
    "定语",
    "状语",
    "补语",
    "同位语",
    "从句",
    "非谓语",
    "短语",
    "连接成分",
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

function normalizeGrammarType(rawType: string) {
    const type = rawType.trim();
    if (!type) return "语法点";
    if (CANONICAL_GRAMMAR_TYPES.includes(type)) return type;

    const normalized = type
        .replace(/\s+/g, "")
        .replace(/[()（）]/g, "")
        .toLowerCase();
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
    const safeChunk = substring.trim() || "该片段";
    return `结构判断：${safeChunk}主要作${type}；句中作用：帮助明确句子主干与语义关系。`;
}

function normalizeSegmentTranslation(rawTranslation: string, substring: string) {
    const translation = rawTranslation.trim();
    if (translation && containsCjk(translation)) return translation;
    const safeChunk = substring.trim();
    if (!safeChunk) return "";
    return `在本句中可理解为“${safeChunk}”所指的语义片段`;
}

function enrichDeepExplanation(raw: string, point: string) {
    const normalized = raw.trim();
    if (!isWeakExplanation(normalized)) return normalized;
    const safePoint = point.trim() || "该语法点";
    return `结构判断：句子包含${safePoint}；句中作用：支撑语义组织并影响信息重心。`;
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
    return normalizeGrammarText(sentence).replace(/\s+/g, " ").toLowerCase();
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

export function buildGrammarBasicPrompt(text: string, repairHints: string[] = []) {
    const repairBlock = repairHints.length > 0
        ? `
REPAIR REQUIREMENTS:
- You previously missed required fields.
- Fix the following issues exactly:
${repairHints.map((hint) => `- ${hint}`).join("\n")}
`
        : "";

    return `
Analyze the grammar of the following English paragraph for a Chinese native speaker learning English.

Paragraph:
"""${text}"""

OBJECTIVE:
1. Split the paragraph into individual sentences. You MUST include EVERY sentence.
2. For EACH sentence, provide a natural Chinese translation.
3. Analyze sentence structure with high coverage:
   - Main components: Subject (主语), Predicate/Verb (谓语), Object/Predicative (宾语/表语).
   - Modifiers: Attributive (定语), Adverbial (状语), Complement (补语), Appositive (同位语).
   - Clauses/structures when present.
4. Every highlight.explanation MUST include:
   - 结构判断（该片段属于什么结构）
   - 句中作用（该结构在本句承担什么功能）
   - Optional 易错点（若容易误判）
5. Every segment_translation MUST be contextual (in THIS sentence), not dictionary-only.

OUTPUT STRICT JSON ONLY:
{
  "tags": ["Tag1", "Tag2"],
  "overview": "Brief summary",
  "difficult_sentences": [
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
- Keep sentence order exactly as original paragraph.
- "sentence" must be an exact substring.
- "type" must be Simplified Chinese and should prefer: 主语/谓语/宾语/表语/定语/状语/补语/同位语/从句/非谓语/短语/连接成分.
- Each sentence should contain at least one highlight unless truly trivial.
- Return JSON object only, no markdown, no extra text.
${repairBlock}
`.trim();
}

export function buildGrammarDeepPrompt(sentence: string, repairHints: string[] = []) {
    const repairBlock = repairHints.length > 0
        ? `
REPAIR REQUIREMENTS:
- Your previous output missed required fields.
- Fix these issues exactly:
${repairHints.map((hint) => `- ${hint}`).join("\n")}
`
        : "";

    return `
Analyze the deep grammar structure of one English sentence for a Chinese learner.

Sentence:
"""${sentence}"""

OUTPUT STRICT JSON ONLY:
{
  "sentence": "Exact sentence",
  "sentence_tree": {
    "label": "主句",
    "text": "full or partial sentence chunk",
    "children": [
      {
        "label": "状语",
        "text": "chunk",
        "children": []
      }
    ]
  },
  "analysis_results": [
    {
      "point": "语法点名称",
      "explanation": "必须包含结构判断和句中作用，必要时补充易错点"
    }
  ]
}

CONSTRAINTS:
- Keep "sentence" exactly same as input sentence.
- sentence_tree.label must be Simplified Chinese.
- analysis_results must be an array (can be empty).
- Each explanation should be concrete and sentence-specific; avoid vague generic text.
- Return JSON object only.
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

function buildFallbackBasic(paragraphText: string): GrammarBasicResult {
    const sentences = splitGrammarSentences(paragraphText);
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

export function sanitizeGrammarBasicPayload(raw: unknown, paragraphText: string): GrammarSanitizeResult<GrammarBasicResult> {
    const issues: string[] = [];
    const fallback = buildFallbackBasic(paragraphText);
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

    const expectedSentences = splitGrammarSentences(paragraphText);
    const rawTags = Array.isArray(payload.tags) ? payload.tags.map((item) => toFiniteString(item)) : [];
    if (!Array.isArray(payload.tags)) {
        issues.push("tags is missing or not an array");
    }

    const overview = toFiniteString(payload.overview) || fallback.overview;
    if (!toFiniteString(payload.overview)) {
        issues.push("overview is missing");
    }

    const rawSentenceItems = Array.isArray(payload.difficult_sentences)
        ? payload.difficult_sentences.map((item) => (item && typeof item === "object" ? item as Record<string, unknown> : {}))
        : [];
    if (!Array.isArray(payload.difficult_sentences)) {
        issues.push("difficult_sentences is missing or not an array");
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
    const sentenceCount = Math.max(1, expectedSentences.length || data.difficult_sentences.length);
    const severeCoverageIssue =
        missingHighlightSentenceCount > Math.floor(sentenceCount * 0.45)
        || missingTranslationCount > Math.floor(sentenceCount * 0.45);

    return {
        data,
        issues,
        retryRecommended: severeCoverageIssue || (issues.length > 0 && (highlightCount === 0 || difficultSentences.length === 0 || qualityScore < 0.52)),
        qualityScore,
    };
}

function sanitizeTreeNode(raw: unknown, fallbackText: string, depth = 0): GrammarDeepTreeNode | null {
    if (!raw || typeof raw !== "object") return null;
    if (depth > 8) return null;

    const payload = raw as Record<string, unknown>;
    const label = toFiniteString(payload.label) || "语法成分";
    const text = toFiniteString(payload.text) || fallbackText;
    const childrenRaw = Array.isArray(payload.children) ? payload.children : [];
    const children = childrenRaw
        .map((item) => sanitizeTreeNode(item, fallbackText, depth + 1))
        .filter((item): item is GrammarDeepTreeNode => Boolean(item))
        .slice(0, 12);

    return {
        label,
        text,
        children,
    };
}

function buildFallbackDeepSentence(sentence: string): GrammarDeepSentenceResult {
    return {
        sentence,
        sentence_tree: {
            label: "主句",
            text: sentence,
            children: [],
        },
        analysis_results: [],
    };
}

export function sanitizeGrammarDeepSentencePayload(raw: unknown, sentence: string): GrammarSanitizeResult<GrammarDeepSentenceResult> {
    const issues: string[] = [];
    const fallback = buildFallbackDeepSentence(sentence);
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

    const tree = sanitizeTreeNode(payload.sentence_tree, sentence);
    if (!tree) {
        issues.push("sentence_tree is missing or invalid");
    }

    const resultsRaw = Array.isArray(payload.analysis_results) ? payload.analysis_results : [];
    if (!Array.isArray(payload.analysis_results)) {
        issues.push("analysis_results is missing or not an array");
    }

    const analysisResults: GrammarDeepPoint[] = [];
    resultsRaw.forEach((item, index) => {
        const pointPayload = item as Record<string, unknown>;
        const point = toFiniteString(pointPayload?.point);
        const explanationRaw = toFiniteString(pointPayload?.explanation);
        if (!point || !explanationRaw) {
            issues.push(`analysis_results[${index}] is incomplete`);
            return;
        }
        analysisResults.push({
            point,
            explanation: enrichDeepExplanation(explanationRaw, point),
        });
    });

    const normalizedSentence = toFiniteString(payload.sentence) || sentence;
    if (sentenceIdentity(normalizedSentence) !== sentenceIdentity(sentence)) {
        issues.push("sentence field mismatches request sentence");
    }

    const data: GrammarDeepSentenceResult = {
        sentence,
        sentence_tree: tree ?? fallback.sentence_tree,
        analysis_results: analysisResults,
    };
    const detailedCount = data.analysis_results.filter((item) => !isWeakExplanation(item.explanation)).length;
    const qualityScore = Number((
        (data.sentence_tree ? 0.4 : 0)
        + (data.analysis_results.length > 0 ? 0.3 : 0)
        + (data.analysis_results.length > 0 ? (detailedCount / data.analysis_results.length) * 0.3 : 0)
    ).toFixed(4));

    return {
        data,
        issues,
        retryRecommended: (issues.length > 0 && (!tree || analysisResults.length === 0)) || qualityScore < 0.42,
        qualityScore,
    };
}
