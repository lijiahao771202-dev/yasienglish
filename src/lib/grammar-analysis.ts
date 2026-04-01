export type GrammarMode = "basic" | "deep";

export const GRAMMAR_BASIC_MODEL = "deepseek-chat";
export const GRAMMAR_DEEP_MODEL = "deepseek-chat";
export const GRAMMAR_BASIC_PROMPT_VERSION = "2026-04-01-basic-v3";
export const GRAMMAR_DEEP_PROMPT_VERSION = "2026-04-01-deep-v2";

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
- "type" must be Simplified Chinese.
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
      "explanation": "详细解释"
    }
  ]
}

CONSTRAINTS:
- Keep "sentence" exactly same as input sentence.
- sentence_tree.label must be Simplified Chinese.
- analysis_results must be an array (can be empty).
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

        const type = toFiniteString(payload?.type) || "语法点";
        const explanation = toFiniteString(payload?.explanation) || "该片段在句中承担特定语法功能。";
        const segmentTranslation = toFiniteString(payload?.segment_translation);

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

    if (expectedSentences.length > 0) {
        expectedSentences.forEach((sentence) => {
            const matched = matchRawSentenceItem(rawSentenceItems, sentence, used) ?? {};
            const translation = toFiniteString(matched.translation);
            const highlights = sanitizeHighlights(matched.highlights, sentence, issues);
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

    return {
        data: {
            mode: "basic",
            tags: uniqueStrings(rawTags, 12).length > 0 ? uniqueStrings(rawTags, 12) : fallback.tags,
            overview,
            difficult_sentences: difficultSentences.length > 0 ? difficultSentences : fallback.difficult_sentences,
        },
        issues,
        retryRecommended: issues.length > 0 && (highlightCount === 0 || difficultSentences.length === 0),
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
        const explanation = toFiniteString(pointPayload?.explanation);
        if (!point || !explanation) {
            issues.push(`analysis_results[${index}] is incomplete`);
            return;
        }
        analysisResults.push({ point, explanation });
    });

    const normalizedSentence = toFiniteString(payload.sentence) || sentence;
    if (sentenceIdentity(normalizedSentence) !== sentenceIdentity(sentence)) {
        issues.push("sentence field mismatches request sentence");
    }

    return {
        data: {
            sentence,
            sentence_tree: tree ?? fallback.sentence_tree,
            analysis_results: analysisResults,
        },
        issues,
        retryRecommended: issues.length > 0 && !tree && analysisResults.length === 0,
    };
}
