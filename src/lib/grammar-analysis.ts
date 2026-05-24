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
export const GRAMMAR_DEEP_MODEL = "deepseek-chat";
export const GRAMMAR_BASIC_PROMPT_VERSION = "2026-05-17-basic-v10";
export const GRAMMAR_DEEP_PROMPT_VERSION = "2026-04-26-deep-v5";

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

function enrichDeepExplanation(raw: string, point: string) {
    const normalized = raw.trim();
    if (!isWeakExplanation(normalized)) return normalized;
    const safePoint = point.trim() || "该语法点";
    return `**结构判断**：句子包含${safePoint}。\n\n**句中作用**：支撑语义组织并影响信息重心。`;
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
3. Use a clause-first workflow before highlighting:
   - Identify the main clause first.
   - Then identify subordinate clauses / relative clauses / adverbial clauses / non-finite structures / parenthetical inserts.
   - For long sentences, prioritize the real backbone over decorative wording.
4. Analyze sentence structure with high coverage:
   - Main components: Subject (主语), Predicate/Verb (谓语), Object/Predicative (宾语/表语).
   - Modifiers: Attributive (定语), Adverbial (状语), Complement (补语), Appositive (同位语).
   - Clauses/structures when present.
   - The goal is teaching-ready chunking, not minimum-viable labeling.
5. Prefer the most specific grammar type possible for highlight.type.
   - Use 时间状语从句 / 条件状语从句 / 让步状语从句 / 原因状语从句 / 目的状语从句 when the subtype is clear.
   - Use 宾语从句 / 主语从句 / 表语从句 / 同位语从句 instead of generic 从句 or 名词性从句 when the clause role is clear.
   - Use 定语从句 instead of generic 从句 when it modifies a noun.
   - Use 介词短语 / 分词短语 / 不定式短语 / 动名词短语 instead of generic 短语 when the phrase form is clear.
   - Use 非谓语 only when the exact phrase form is not clear.
   - Do NOT collapse a specific structure into a broad label unless you genuinely cannot identify the subtype.
6. Every highlight.explanation MUST be Markdown-ready and teacher-like.
   - Lead with one bold judgment sentence.
   - Then use 1 to 3 short lines, bullets, or a short blockquote to explain the role in the sentence.
   - Explain: 这部分是什么 + 它在句里干什么 + 为什么值得单独标出来.
   - If a grammar term is hard, immediately unpack it in simpler words.
   - Avoid rigid textbook labels as section headers; prefer natural explanation.
7. Every segment_translation MUST be contextual (in THIS sentence), not dictionary-only.
8. Chunking Rules for long / complex sentences:
   - Do NOT stop at the outer clause boundary.
   - If a chunk still contains an internal clause, non-finite modifier, appositive, comparison, publication/source detail, or time detail, split it again.
   - Avoid oversized chunks. Each chunk should usually carry one main grammar job only.
   - Long noun phrases must be decomposed when they contain post-modifiers such as relative clauses, participial phrases, prepositional phrases, appositives, publication/source details, or year/time details.
   - After labeling a clause such as 宾语从句 / 定语从句 / 状语从句, continue exposing its internal backbone when that backbone is still pedagogically important.
   - Prefer 5-12 meaningful chunks for a long complex sentence rather than 2-4 oversized chunks.
   - Never merge a clause label and all of its internal content into one giant chunk when the internal structure is still analyzable.

FEW-SHOT EXAMPLE 1:
Sentence: "When students feel lost, they often look for a checklist."
Good JSON fragment:
{
      "sentence": "When students feel lost, they often look for a checklist.",
      "translation": "当学生感到迷茫时，他们往往会去找一份清单。",
      "highlights": [
        {
          "substring": "When students feel lost",
          "type": "时间状语从句",
          "explanation": "**这部分是 when 引导的时间状语从句。**\n\n- 它交代后面动作发生的时间。\n- 这里不要把它当成主句。\n\n> 提醒：先抓主句，再看这个从句。",
          "segment_translation": "当学生感到迷茫时"
        },
        {
          "substring": "they",
          "type": "主语",
          "explanation": "**they 是主语。**\n\n- 它表示“谁”在做事。\n- 这里具体指前面的学生。",
          "segment_translation": "他们"
        },
        {
          "substring": "look for a checklist",
          "type": "谓语",
          "explanation": "**这是谓语部分。**\n\n- 它表示动作本身。\n- 这里说明主语具体做了什么。",
          "segment_translation": "寻找一份清单"
        }
      ]
}

FEW-SHOT EXAMPLE 2:
Sentence: "By explicitly rating options according to agreed criteria, individuals decrease the chance of being influenced by transient emotions."
Good JSON fragment:
{
      "sentence": "By explicitly rating options according to agreed criteria, individuals decrease the chance of being influenced by transient emotions.",
      "translation": "通过按照既定标准明确地给选项打分，人们会降低被短暂情绪影响的可能性。",
      "highlights": [
        {
          "substring": "By explicitly rating options according to agreed criteria",
          "type": "介词短语",
          "explanation": "**这是 by 引导的方式状语。**\n\n- 它补充说明“怎么做”。\n- 这里强调动作是通过什么方式实现的。",
          "segment_translation": "通过按照既定标准明确地给选项打分"
        },
        {
          "substring": "individuals",
          "type": "主语",
          "explanation": "**individuals 是主语。**\n\n- 它就是“谁”在做 decrease。\n- 指的是这些人。",
          "segment_translation": "人们"
        },
        {
          "substring": "of being influenced by transient emotions",
          "type": "介词短语",
          "explanation": "**这是 of 后面的补充短语。**\n\n- 它在解释 the chance 具体指什么。\n- 这样整句的意思更完整。",
          "segment_translation": "被短暂情绪影响"
        }
      ]
}

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
- Keep sentence order exactly as original paragraph.
- You MUST return one entry for every input sentence. Do not skip short, simple, or summary-like sentences.
- "sentence" must be an exact substring.
- "type" must be Simplified Chinese and should prefer specific labels such as 主语/谓语/宾语/表语/定语/状语/补语/同位语/主句/宾语从句/主语从句/表语从句/同位语从句/定语从句/时间状语从句/原因状语从句/目的状语从句/条件状语从句/让步状语从句/介词短语/分词短语/不定式短语/动名词短语/倒装句/虚拟语气/强调句.
- Each sentence should contain at least one highlight unless truly trivial.
- For long sentences, at least one highlight should capture the clause backbone, not only isolated words.
- Prefer exact clause spans over dictionary-like single-word labels when a clause is doing the real grammar work.
- Do NOT stop at the outer clause boundary for long sentences.
- Avoid oversized chunks.
- Long noun phrases must be decomposed when they include internal modifiers or source/time tails.
- Explanations should sound like a teacher speaking to a learner in simple Chinese.
- Markdown is allowed inside explanation string values, but the outer response must remain valid JSON.
- Keep each explanation compact and easy to scan.
- Imagine the learner does not really understand grammar terms yet.
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

WORKFLOW:
1. Identify the main clause first.
2. Then place subordinate clauses / non-finite phrases / inserted structures under the correct parent.
3. In analysis_results, explain the real grammatical leverage points, not generic textbook definitions. Markdown is allowed inside the explanation strings.

FEW-SHOT EXAMPLE:
Sentence: "When students feel lost, they often look for a checklist that gives them a starting point."
Good JSON:
{
  "sentence": "When students feel lost, they often look for a checklist that gives them a starting point.",
  "sentence_tree": {
    "label": "主句",
    "text": "they often look for a checklist that gives them a starting point",
    "children": [
      {
        "label": "状语从句",
        "text": "When students feel lost",
        "children": []
      },
      {
        "label": "定语从句",
        "text": "that gives them a starting point",
        "children": []
      }
    ]
  },
  "analysis_results": [
    {
      "point": "时间状语从句",
      "explanation": "**When students feel lost 是时间状语从句。**\n\n- 它交代主句动作发生的时间背景。\n- 先看主句 they often look for a checklist，再看这块怎么挂上去。"
    },
    {
      "point": "定语从句修饰先行词",
      "explanation": "**that gives them a starting point 是修饰 checklist 的定语从句。**\n\n- 它补充说明 checklist 的具体功能。\n- 它依附在先行词 checklist 后面，不属于主句主干。"
    }
  ]
}

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
- For long sentences, explicitly separate the backbone clause from dependent structures.
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
