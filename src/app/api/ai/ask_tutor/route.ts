import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

interface TutorTurn {
    question?: string;
    answer?: string;
}

type TutorQuestionType = "pattern" | "word_choice" | "example" | "unlock_answer" | "follow_up";
type TutorAction = "ask" | "drill_check";
type TutorUiSurface = "battle" | "score" | "rebuild_floating_teacher";
type TutorIntent = "translate" | "grammar" | "lexical" | "rebuild";
type TutorThinkingMode = "chat" | "deep";
type TutorResponseIntent =
    | "word_meaning"
    | "collocation"
    | "partial_phrase"
    | "pattern"
    | "naturalness"
    | "full_sentence"
    | "unlock_answer";

interface TutorMicroDrill {
    prompt_cn: string;
    expected_pattern_en: string;
}

interface TutorExampleSentence {
    label_cn?: string;
    sentence_en: string;
    sentence_en_tokens: string[];
    note_cn?: string;
}

interface TutorKnownKnowledge {
    session_known: string[];
    attempt_known: string[];
    topic_known: string[];
    recent_mastery: string[];
}

interface TutorResponsePayload {
    coach_markdown: string;
    response_intent?: TutorResponseIntent;
    coach_cn?: string;
    pattern_en?: string[];
    contrast?: string;
    next_task?: string;
    answer_revealed: boolean;
    full_answer?: string;
    answer_reason_cn?: string;
    example_sentences?: TutorExampleSentence[];
    teaching_point: string;
    direct_answer_en?: string;
    error_tags: string[];
    micro_drill?: TutorMicroDrill;
    quality_flags: string[];
    drill_feedback_cn?: string;
    revised_sentence_en?: string;
    next_micro_drill?: TutorMicroDrill;
}

interface StreamChunk {
    choices?: Array<{
        delta?: {
            content?: string | null;
        };
    }>;
}

interface PayloadBuildContext {
    question: string;
    questionType: TutorQuestionType;
    action: TutorAction;
    uiSurface: TutorUiSurface;
    teachingPoint: string;
    improvedVersion: string;
    referenceEnglish: string;
    allowRevealAnswer: boolean;
    chineseSource: string;
    userAttempt: string;
    drillInput: string;
    focusSpan: string;
    knownKnowledge: string;
    knownKnowledgeDetails: TutorKnownKnowledge;
    responseIntent: TutorResponseIntent;
    sessionBootstrapped: boolean;
}

const ERROR_TAG_SET = new Set(["word_choice", "word_order", "grammar", "register", "collocation", "tense"]);

function safeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function stripQuestionTail(text: string): string {
    return safeString(text)
        .replace(/[？?！!。.\s]+$/g, "")
        .replace(/(的)?英文(是)?(啥|什么|怎么说|怎么讲|怎么写)?$/u, "")
        .replace(/(这个|这块|这一块|这一段|这个词|这个短语)?(怎么翻译|怎么翻|怎么说成英文|怎么说|什么意思|啥意思|怎么理解)$/u, "")
        .replace(/(怎么翻译呢|怎么翻呢|怎么说呢|怎么表达呢)$/u, "")
        .replace(/(英文|翻译|意思|表达|说法)$/u, "")
        .trim();
}

function normalizeFocusSpanText(text: string): string {
    const input = safeString(text);
    if (!input) return "";

    // Reject full meta-instruction phrases like "解释一下这句话的语法"
    const metaVerbRe = /^(解释|分析|讲解?|说说?|告诉我|帮我|为什么|我说|能说|能讲|能解释)/u;
    if (metaVerbRe.test(input.trim())) return "";
    const fullMetaRe = /(解释|分析|讲解?|说说?)(一下|简单|详细)?.*(语法|词义|用法|结构|意思|搭配|句型)/u;
    if (fullMetaRe.test(input.trim())) return "";

    const stripped = stripQuestionTail(input);
    if (stripped && /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z\s'-]{0,24}$/.test(stripped)) {
        return stripped.slice(0, 24).trim();
    }

    const quoted = input.match(/["\u201c]([^"\u201d]{1,24})["\u201d]/u)?.[1]?.trim();
    if (quoted) return stripQuestionTail(quoted).slice(0, 24);

    const englishChunk = input.match(/[A-Za-z][A-Za-z\s'-]{1,24}/)?.[0]?.trim();
    if (englishChunk) return englishChunk.slice(0, 24);

    const chineseChunk = input.match(/[\u4e00-\u9fa5]{2,10}/u)?.[0]?.trim();
    return chineseChunk ? chineseChunk.slice(0, 10) : "";
}

function looksLikeQuestionPhrase(text: string): boolean {
    const value = safeString(text);
    if (!value) return false;
    return /(怎么|什么意思|啥意思|英文|翻译|表达|说法|呢|吗|是不是)/u.test(value);
}

function isReasonablePhonetic(text: string): boolean {
    const value = safeString(text);
    if (!value) return false;
    if (value.length > 40) return false;
    if (/[0-9]/.test(value)) return false;
    if (/[A-Za-z]{2,}/.test(value)) return false;
    return true;
}

function normalizeTurns(value: unknown): TutorTurn[] {
    if (!Array.isArray(value)) return [];
    return value
        .slice(-6)
        .map((item) => ({
            question: safeString((item as TutorTurn)?.question),
            answer: safeString((item as TutorTurn)?.answer),
        }))
        .filter((item) => item.question || item.answer);
}

function normalizeRecentMastery(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return uniqueNonEmpty(
        value.map((item) => safeString(item)).filter(Boolean).slice(-8),
        8,
    );
}

function uniqueNonEmpty(values: string[], limit: number): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const normalized = safeString(value).trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
        if (result.length >= limit) break;
    }

    return result;
}

function extractKnownUnits(text: string): string[] {
    const input = safeString(text);
    if (!input) return [];

    const values: string[] = [];
    const regexes = [
        /`([^`]{1,40})`/g,
        /“([^”]{1,20})”/g,
        /"([^"]{1,20})"/g,
        /'([^']{1,20})'/g,
    ];

    for (const pattern of regexes) {
        for (const match of input.matchAll(pattern)) {
            const candidate = safeString(match[1]).trim();
            if (candidate) values.push(candidate);
        }
    }

    if (values.length === 0) {
        const shortChineseQuestion = input.replace(/[？?！!。.\s]/g, "").trim();
        if (/^[\u4e00-\u9fa5]{2,10}$/.test(shortChineseQuestion)) {
            values.push(shortChineseQuestion);
        }
    }

    return uniqueNonEmpty(values, 4);
}

function buildKnownKnowledgeDetails(
    turns: TutorTurn[],
    teachingPoint: string,
    focusSpan: string,
    userAttempt: string,
    recentMastery: string[],
): TutorKnownKnowledge {
    const recentTurns = turns.slice(-3);
    const sessionKnown = uniqueNonEmpty(
        recentTurns.flatMap((item) => [
            ...extractKnownUnits(item.question || ""),
            ...extractKnownUnits(item.answer || ""),
        ]),
        4,
    );

    const attemptKnown = (userAttempt.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
        .slice(0, 4)
        .map((item) => item.trim());

    const topicKnown = [focusSpan, teachingPoint]
        .map((item) => safeString(item))
        .filter(Boolean)
        .slice(0, 2);

    return {
        session_known: sessionKnown,
        attempt_known: attemptKnown,
        topic_known: topicKnown,
        recent_mastery: recentMastery.slice(-4),
    };
}

function buildKnownKnowledgeSummary(known: TutorKnownKnowledge): string {
    const parts: string[] = [];

    if (known.session_known.length > 0) {
        parts.push(`最近已经讲过：${known.session_known.join(" / ")}`);
    }
    if (known.attempt_known.length > 0) {
        parts.push(`用户已经写出来的词：${known.attempt_known.join(", ")}`);
    }
    if (known.topic_known.length > 0) {
        parts.push(`当前题的线索：${known.topic_known.join(" / ")}`);
    }
    if (known.recent_mastery.length > 0) {
        parts.push(`最近几题已经练过：${known.recent_mastery.join(" / ")}`);
    }

    return parts.length > 0
        ? parts.join("；")
        : "默认从用户已经熟悉的主干结构、基础搭配和简单语序出发，再引出新点。";
}

function normalizeAction(value: unknown): TutorAction {
    return safeString(value) === "drill_check" ? "drill_check" : "ask";
}

function normalizeUiSurface(value: unknown): TutorUiSurface {
    const normalized = safeString(value);
    if (normalized === "battle") return "battle";
    if (normalized === "rebuild_floating_teacher") return "rebuild_floating_teacher";
    return "score";
}

function normalizeIntent(value: unknown): TutorIntent {
    const normalized = safeString(value);
    if (normalized === "grammar" || normalized === "lexical" || normalized === "rebuild") return normalized;
    return "translate";
}

function normalizeThinkingMode(value: unknown): TutorThinkingMode {
    return safeString(value) === "deep" ? "deep" : "chat";
}

function getTutorModel(thinkingMode: TutorThinkingMode) {
    return thinkingMode === "deep" ? "deepseek-reasoner" : "deepseek-chat";
}

function parseJsonFromModel(content: string): Partial<TutorResponsePayload> | null {
    const trimmed = content.trim();
    const candidates: string[] = [];

    candidates.push(trimmed);

    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
        candidates.push(fencedMatch[1].trim());
    }

    const jsonBlockMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonBlockMatch?.[0]) {
        candidates.push(jsonBlockMatch[0].trim());
    }

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object") {
                return parsed as Partial<TutorResponsePayload>;
            }
        } catch {
            continue;
        }
    }

    return null;
}

function extractCoachMarkdownPartial(content: string): string {
    const keyMatch = content.match(/"(coach_markdown|coach_cn)"\s*:\s*"/i);
    if (!keyMatch || keyMatch.index === undefined) return "";

    let index = keyMatch.index + keyMatch[0].length;
    let value = "";

    while (index < content.length) {
        const character = content[index];

        if (character === "\\") {
            const nextCharacter = content[index + 1];
            if (!nextCharacter) break;
            if (nextCharacter === "n") value += "\n";
            else value += nextCharacter;
            index += 2;
            continue;
        }

        if (character === '"') break;

        value += character;
        index += 1;
    }

    return value.trim();
}

function escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinEnglishTokens(tokens: string[]): string {
    return tokens
        .filter(Boolean)
        .join(" ")
        .replace(/\s+([,.!?;:)\]])/g, "$1")
        .replace(/([(\[])\s+/g, "$1")
        .replace(/\s+'/g, "'")
        .replace(/'\s+/g, "'")
        .trim();
}

function normalizeEnglishTokenArray(value: unknown, referenceEnglish = ""): string[] {
    const lexicon = buildCollapsedEnglishLexicon(referenceEnglish);

    const rawParts = Array.isArray(value)
        ? value.flatMap((item) => safeString(item).split(/\s+/))
        : safeString(value).split(/\s+/);

    return rawParts
        .map((item) => safeString(item))
        .filter(Boolean)
        .flatMap((token) => {
            if (/^[A-Za-z]{10,}$/.test(token)) {
                const repaired = splitCollapsedEnglishToken(token, lexicon);
                if (repaired) return repaired.split(/\s+/);
            }
            return [token];
        })
        .map((token) => normalizeCollapsedEnglish(token))
        .filter(Boolean);
}

function normalizeExampleSentences(raw: unknown, referenceEnglish = ""): TutorExampleSentence[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    const normalized: TutorExampleSentence[] = [];

    for (const item of raw) {
        const input = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const tokens = normalizeEnglishTokenArray(
            input.sentence_en_tokens ?? input.sentence_en ?? input.example_en,
            referenceEnglish,
        );
        const sentenceEn = joinEnglishTokens(tokens);
        if (!sentenceEn) continue;
        normalized.push({
            label_cn: safeString(input.label_cn) || undefined,
            sentence_en: sentenceEn,
            sentence_en_tokens: tokens,
            note_cn: normalizeMixedScriptSpacing(normalizeCollapsedEnglish(safeString(input.note_cn) || safeString(input.example_cn))) || undefined,
        });
        if (normalized.length >= 3) break;
    }

    return normalized.length > 0 ? normalized : undefined;
}

function autoMarkCoachText(text: string, patterns: string[]): string {
    if (!text) return text;
    if (text.includes("**")) return text;

    const chinesePriority = [
        "主干结构",
        "时间从句",
        "条件句",
        "词汇搭配",
        "语序",
        "时态",
        "介词",
        "表达重心",
        "自然表达",
    ];

    const englishTerms = patterns
        .flatMap((pattern) => pattern.match(/[A-Za-z][A-Za-z'-]{2,}/g) || [])
        .map((term) => term.trim())
        .filter(Boolean);

    const candidates = [...englishTerms, ...chinesePriority];
    let marked = text;
    let count = 0;

    for (const term of candidates) {
        if (count >= 3) break;
        const regex = new RegExp(escapeRegExp(term));
        if (regex.test(marked)) {
            marked = marked.replace(regex, `**${term}**`);
            count += 1;
        }
    }

    return marked;
}

function normalizeMarkdownSyntax(text: string): string {
    if (!text) return text;

    return text
        .replace(/(^|\n)(#{1,6})([^\s#])/g, "$1$2 $3")
        .replace(/(^|\n)\s*([-*_])(?:\s*\2){2,}\s*(?=\n|$)/g, "$1---");
}

function softenMarkdownNoise(text: string): string {
    if (!text) return text;

    let headingCount = 0;
    let boldCount = 0;
    let codeCount = 0;

    const softenedLines = normalizeMarkdownSyntax(text).split("\n").map((line) => {
        let nextLine = line;

        if (/^\s*#{1,6}\s+/.test(nextLine)) {
            headingCount += 1;
            if (headingCount > 1) {
                nextLine = nextLine.replace(/^\s*#{1,6}\s+/, "- ");
            }
        }

        nextLine = nextLine.replace(/\*\*([^*]+)\*\*/g, (_, inner: string) => {
            boldCount += 1;
            return boldCount <= 3 ? `**${inner}**` : inner;
        });

        nextLine = nextLine.replace(/`([^`]+)`/g, (_, inner: string) => {
            codeCount += 1;
            return codeCount <= 4 ? `\`${inner}\`` : inner;
        });

        return nextLine;
    });

    return softenedLines
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/(?:\n\s*---\s*\n){2,}/g, "\n---\n")
        .trim();
}

function hasMarkdownStructure(text: string): boolean {
    if (!text) return false;
    return /(^|\n)\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|---\s*$|\|.+\|)/m.test(text) || /\*\*[^*]+\*\*/.test(text) || /`[^`]+`/.test(text);
}

function ensureReadableMarkdown(text: string): string {
    const normalized = normalizeMarkdownSyntax(safeString(text));
    if (!normalized) return normalized;
    if (hasMarkdownStructure(normalized)) return normalized;

    const sentences = normalized
        .split(/(?<=[。！？!?])\s*/u)
        .map((item) => item.trim())
        .filter(Boolean);

    if (sentences.length <= 1) {
        return `### 直接回答\n\n${normalized}`;
    }

    const [first, ...rest] = sentences;
    const bullets = rest.slice(0, 3).map((item) => `- ${item}`).join("\n");
    return `### 直接回答\n\n${first}\n\n---\n\n${bullets}`.trim();
}

const COMMON_ENGLISH_SEGMENT_WORDS = [
    "a", "an", "and", "are", "as", "at", "be", "between", "but", "by", "do", "does", "did",
    "follow", "for", "from", "go", "good", "had", "has", "have", "he", "her", "here", "him", "his",
    "how", "i", "if", "in", "into", "is", "it", "its", "just", "lottery", "me", "more",
    "natural", "noted", "of", "off", "on", "or", "our", "romantic", "said", "she", "sorry",
    "some", "someone", "something", "spark", "that", "the", "their", "them", "there", "these", "they", "thing", "things",
    "this", "to", "turn", "up", "us", "was", "we", "well", "went", "what", "when", "with", "won",
    "word", "words", "you", "your",
] as const;

function buildCollapsedEnglishLexicon(referenceEnglish = ""): Set<string> {
    const lexicon = new Set<string>(COMMON_ENGLISH_SEGMENT_WORDS);
    const referenceTokens = referenceEnglish.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
    for (const token of referenceTokens) {
        lexicon.add(token.toLowerCase());
    }
    return lexicon;
}

function splitCollapsedEnglishToken(token: string, lexicon: Set<string>): string | null {
    const original = safeString(token);
    const lower = original.toLowerCase();
    if (lower.length < 10 || lexicon.has(lower)) return null;

    const best: Array<Array<[number, number]> | null> = Array.from({ length: lower.length + 1 }, () => null);
    best[0] = [];

    for (let start = 0; start < lower.length; start += 1) {
        const current = best[start];
        if (!current) continue;

        for (let end = start + 1; end <= Math.min(lower.length, start + 14); end += 1) {
            const part = lower.slice(start, end);
            if (!lexicon.has(part)) continue;
            const candidate = [...current, [start, end] as [number, number]];
            const existing = best[end];
            if (!existing || candidate.length < existing.length) {
                best[end] = candidate;
            }
        }
    }

    const solution = best[lower.length];
    if (!solution || solution.length < 2) return null;
    return solution.map(([start, end]) => original.slice(start, end)).join(" ");
}

function repairCollapsedEnglishRuns(text: string, referenceEnglish = ""): string {
    const source = safeString(text);
    if (!source) return source;
    const lexicon = buildCollapsedEnglishLexicon(referenceEnglish);
    return source.replace(/\b[A-Za-z]{10,}\b/g, (token) => splitCollapsedEnglishToken(token, lexicon) ?? token);
}

function normalizeMixedScriptSpacing(text: string): string {
    return safeString(text)
        .replace(/([\u4e00-\u9fa5])([A-Za-z][A-Za-z'-]*)/g, "$1 $2")
        .replace(/([A-Za-z][A-Za-z'-]*)([\u4e00-\u9fa5])/g, "$1 $2");
}

function normalizeCollapsedEnglish(text: string): string {
    if (!text) return text;

    let normalized = text;
    const replacements: Array<[RegExp, string]> = [
        [/\bgathercouragetodosomething\b/gi, "gather courage to do something"],
        [/\basksomeoneabout\b/gi, "ask someone about"],
        [/\bspilledthebeans\b/gi, "spill the beans"],
        [/\bearlyrevelation\b/gi, "early revelation"],
        [/\bmessedup\b/gi, "messed up"],
        [/\btechpioneer\b/gi, "tech pioneer"],
        [/\bacademicpioneer\b/gi, "academic pioneer"],
        [/\bconcerthall\b/gi, "concert hall"],
        [/\bticketcounter\b/gi, "ticket counter"],
        [/\bviewingexperience\b/gi, "viewing experience"],
        [/\bmovie-watchingexperience\b/gi, "movie-watching experience"],
        [/\bruiningtheentireviewingexperience\b/gi, "ruining the entire viewing experience"],
        [/\btheentire\b/gi, "the entire"],
        [/\bcoffeebreak\b/gi, "coffee break"],
        [/\bteabreak\b/gi, "tea break"],
        [/\blunchbreak\b/gi, "lunch break"],
        [/\btextmessage\b/gi, "text message"],
        [/\bsparekey\b/gi, "spare key"],
        [/\bcompetitionbreak\b/gi, "competition break"],
        [/\banintensecompetitionbreak\b/gi, "an intense competition break"],
        [/\bfollowupwithsomeone\b/gi, "follow up with someone"],
        [/\bfollowuponsomething\b/gi, "follow up on something"],
        [/\bfollowupwith\b/gi, "follow up with"],
        [/\bfollowupon\b/gi, "follow up on"],
    ];

    for (const [pattern, replacement] of replacements) {
        normalized = normalized.replace(pattern, replacement);
    }

    normalized = normalized
        .replace(/([,;:!?])([A-Za-z])/g, "$1 $2")
        .replace(/\b([a-z]{2,})someone([a-z]{2,})\b/gi, "$1 someone $2")
        .replace(/\b([a-z]{2,})something([a-z]{2,})\b/gi, "$1 something $2")
        .replace(/\b([a-z]{2,})tosomeone\b/gi, "$1 to someone")
        .replace(/\b([a-z]{2,})tosomething\b/gi, "$1 to something");

    normalized = repairCollapsedEnglishRuns(normalized);
    normalized = normalizeMixedScriptSpacing(normalized);

    return normalized;
}

function expandCollapsedReferenceRuns(text: string, referenceEnglish: string): string {
    const source = safeString(text);
    const reference = safeString(referenceEnglish);
    if (!source || !reference) return source;

    const referenceTokensOriginal =
        reference.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.filter((token) => token.length >= 1) || [];
    const referenceTokens = referenceTokensOriginal.map((token) => token.toLowerCase());

    if (referenceTokens.length < 2) return source;

    const candidateMap = new Map<string, string>();

    for (let start = 0; start < referenceTokens.length; start += 1) {
        let joined = "";
        const parts: string[] = [];
        for (let end = start; end < referenceTokens.length; end += 1) {
            parts.push(referenceTokensOriginal[end]);
            joined += referenceTokens[end];
            if (parts.length >= 2 && joined.length >= 6) {
                candidateMap.set(joined, parts.join(" "));
            }
        }
    }

    const sortedCandidates = Array.from(candidateMap.entries()).sort((a, b) => b[0].length - a[0].length);
    let normalized = source;

    for (const [collapsed, spaced] of sortedCandidates) {
        const pattern = new RegExp(`\\b${escapeRegExp(collapsed)}\\b`, "gi");
        normalized = normalized.replace(pattern, spaced);
    }

    return normalizeMixedScriptSpacing(repairCollapsedEnglishRuns(normalized, reference));
}

function hasLatinText(text: string): boolean {
    return /[A-Za-z]/.test(text);
}

function looksRelevantToFocus(text: string, focusSpan: string): boolean {
    const source = safeString(text);
    const focus = safeString(focusSpan);
    if (!source || !focus) return true;
    return source.includes(focus) || focus.includes(source);
}

function normalizeListLayout(text: string): string {
    if (!text) return text;

    let normalized = text;
    // Force line breaks before numbered markers when model outputs "1 ... 2 ... 3 ..."
    normalized = normalized
        .replace(/\s+([2-9][\.\)]\s+)/g, (match, marker, offset, source) => {
            const prevSlice = source.slice(Math.max(0, offset - 4), offset);
            if (/\n\s*$/.test(prevSlice)) return match;
            return `\n${marker}`;
        })
        .replace(/(^|\n)\s*([0-9][\.\)])\s*/g, "$1$2 ");

    // Ensure markdown list style if starts with "1."
    if (/^\s*1[\.\)]\s+/m.test(normalized) && !/\n/.test(normalized.trim())) {
        normalized = normalized.replace(/\s+([2-9][\.\)]\s+)/g, "\n$1");
    }

    return normalized.trim();
}

function normalizeMicroDrill(raw: unknown, fallback: TutorMicroDrill): TutorMicroDrill {
    if (!raw || typeof raw !== "object") return fallback;
    const input = raw as Record<string, unknown>;
    return {
        prompt_cn: safeString(input.prompt_cn) || fallback.prompt_cn,
        expected_pattern_en: normalizeCollapsedEnglish(safeString(input.expected_pattern_en) || fallback.expected_pattern_en),
    };
}

function inferErrorTags(questionType: TutorQuestionType, teachingPoint: string): string[] {
    if (questionType === "word_choice" || /词汇|搭配/.test(teachingPoint)) return ["word_choice", "collocation"];
    if (/语序|从句/.test(teachingPoint)) return ["word_order", "grammar"];
    return ["grammar"];
}

function inferMicroDrill(teachingPoint: string): TutorMicroDrill {
    if (/时间/.test(teachingPoint)) {
        return {
            prompt_cn: "把“我到站后才发现票丢了”翻成英文，优先体现时间关系。",
            expected_pattern_en: "It was only after ... that ...",
        };
    }
    if (/词汇|搭配/.test(teachingPoint)) {
        return {
            prompt_cn: "用“spark / ignite”相关搭配，重写一句“我们之间有了感觉”。",
            expected_pattern_en: "A romantic spark ignited between ...",
        };
    }
    return {
        prompt_cn: "把“他开口前先深呼吸了一下”翻成英文，注意自然语序。",
        expected_pattern_en: "Before ..., ...",
    };
}

function inferDirectAnswerEn(question: string, improvedVersion: string, referenceEnglish: string): string {
    if (improvedVersion) return normalizeCollapsedEnglish(improvedVersion);
    if (referenceEnglish) return normalizeCollapsedEnglish(referenceEnglish);
    const fallback = safeString(question).replace(/[?？]+/g, "");
    return fallback ? `You can say: ${fallback}.` : "Use a natural expression that fits this sentence context.";
}

function hasCollapsedEnglish(text: string): boolean {
    if (/\b[a-z]{5,}(someone|something|to)[a-z]{4,}\b/i.test(text)) return true;
    if (/\b[a-z]{18,}\b/i.test(text)) return true;
    // Common small-word combinations that shouldn't be joined (10+ chars)
    if (/\b[a-z]{3,}(money|short|when|that|this|have|with|from|they|work|time)[a-z]{2,}\b/i.test(text)) return true;
    return false;
}

function gatherAnchors(chineseSource: string, userAttempt: string): string[] {
    const chineseAnchors = chineseSource
        .split(/[，。！？；、“”‘’（）()《》\s]/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .slice(0, 6);

    const englishAnchors = (userAttempt.match(/[A-Za-z][A-Za-z'-]{3,}/g) || [])
        .map((item) => item.toLowerCase())
        .slice(0, 6);

    return [...chineseAnchors, ...englishAnchors];
}

function hasContextAnchor(text: string, anchors: string[]): boolean {
    if (!text || anchors.length === 0) return false;
    const lower = text.toLowerCase();
    return anchors.some((anchor) => lower.includes(anchor.toLowerCase()));
}

function normalizeErrorTags(raw: unknown, fallback: string[]): string[] {
    if (!Array.isArray(raw)) return fallback;
    const tags = raw
        .map((item) => safeString(item).toLowerCase())
        .filter((tag) => ERROR_TAG_SET.has(tag));
    return tags.length > 0 ? Array.from(new Set(tags)).slice(0, 4) : fallback;
}

function classifyResponseIntent(question: string, questionType: TutorQuestionType, focusSpan: string): TutorResponseIntent {
    if (questionType === "unlock_answer") return "unlock_answer";
    if (questionType === "pattern" || /模板|句型|结构|骨架/.test(question)) return "pattern";
    if (questionType === "example") return "pattern";
    if (/搭配|怎么用|用法|配什么|和.*搭/.test(question)) return "collocation";
    if (/自然|地道|顺口|别扭/.test(question)) return "naturalness";
    if (/半句|这部分|这段|这一块/.test(question)) return "partial_phrase";
    if (/整句|全句|完整(答案|表达|译文)|参考(表达|答案)|我想看(参考|答案)|直接给我|整道题|整句话/.test(question)) {
        return "full_sentence";
    }
    if (/(这句|这一句|这整句).*(怎么翻|怎么说|英文)/.test(question)) return "full_sentence";
    if (/怎么翻译|怎么翻|怎么说成英文/i.test(question)) return focusSpan ? "partial_phrase" : "partial_phrase";
    if (/什么意思|啥意思|怎么理解|这个词|这个短语/.test(question)) return "word_meaning";
    if (focusSpan && focusSpan.length <= 8 && !/[。？！?]/.test(question)) return "word_meaning";
    return "partial_phrase";
}

function buildKnownToNewBridge(known: TutorKnownKnowledge, focusSpan: string, teachingPoint: string, intent: TutorResponseIntent): string {
    const knownPoint =
        known.session_known[known.session_known.length - 1] ||
        known.recent_mastery[known.recent_mastery.length - 1] ||
        (known.attempt_known.length > 0 ? `主干里的 ${known.attempt_known.slice(0, 2).join(" / ")}` : "") ||
        "这句的主干意思";
    const newPoint = focusSpan || (
        intent === "collocation"
            ? "这个搭配"
            : intent === "pattern"
                ? "这个句型骨架"
                : intent === "naturalness"
                    ? "更自然的说法"
                    : "当前这小段"
    );

    if (intent === "word_meaning") {
        return `你前面已经有“${knownPoint}”这个底子，这次只补“${newPoint}”这个词块，不展开整句。`;
    }
    if (intent === "collocation") {
        return `你已经知道“${knownPoint}”的大意，这次只补“${newPoint}”常和什么一起搭。`;
    }
    if (intent === "pattern") {
        return `你已经抓住“${knownPoint}”的意思，这次只把它放进一个更稳的英语骨架里。`;
    }
    if (intent === "naturalness") {
        return `你已经说出“${knownPoint}”的大意了，这次只把“${newPoint}”调成更自然的英语说法。`;
    }
    if (intent === "full_sentence" || intent === "unlock_answer") {
        return `你已经知道“${knownPoint}”这个核心点，现在如果你想看整句，老师再给完整答案。`;
    }
    return `你已经抓住“${knownPoint}”，这次只补“${newPoint}”这一小段，不直接展开整句。`;
}

function buildFallbackPayload(ctx: PayloadBuildContext): TutorResponsePayload {
    const fallbackMicroDrill = inferMicroDrill(ctx.teachingPoint);
    const isScoreSurface = ctx.uiSurface === "score";
    const isRebuildFloatingSurface = ctx.uiSurface === "rebuild_floating_teacher";
    const directAnswer = inferDirectAnswerEn(ctx.question, ctx.improvedVersion, ctx.referenceEnglish);
    const legacyPatterns = ["When ..., ...", "It was only after ... that ..."];
    const bridge = buildKnownToNewBridge(ctx.knownKnowledgeDetails, ctx.focusSpan, ctx.teachingPoint, ctx.responseIntent);

    return {
        coach_markdown: isScoreSurface
            ? "你已经抓住了核心意思。先保留**主干结构**，再只修 1-2 个最关键的**表达点**。"
            : isRebuildFloatingSurface
                ? "### 先回答你卡住的点\n\n- **先只讲一个重点**，不把整句全部拆散。\n- 必要时用一个小表格，帮你看清词义、搭配或语序。"
                : `${bridge}\n\n1. **先回答你现在问的点。**\n2. 这次只补当前卡住的**词/搭配/语序**。\n3. 先把这个点补稳，再决定要不要看整句。`,
        response_intent: isScoreSurface ? undefined : ctx.responseIntent,
        coach_cn: isScoreSurface ? "你已经抓住了核心意思。先保留**主干结构**，再只修 1-2 个最关键的**表达点**。" : undefined,
        pattern_en: isScoreSurface ? legacyPatterns : undefined,
        contrast: isScoreSurface ? "中式常逐词直译，地道表达更强调主干先行与信息重心。" : undefined,
        next_task: isScoreSurface ? "请按一个模板重写一句，只改一个关键点再发我。" : undefined,
        answer_revealed: false,
        example_sentences: undefined,
        teaching_point: ctx.teachingPoint,
        direct_answer_en: directAnswer,
        error_tags: inferErrorTags(ctx.questionType, ctx.teachingPoint),
        micro_drill: isScoreSurface ? fallbackMicroDrill : undefined,
        quality_flags: [],
        drill_feedback_cn: ctx.action === "drill_check" ? "你这句方向是对的，先调整一个关键点再提交一次。" : undefined,
        revised_sentence_en: ctx.action === "drill_check" ? (ctx.referenceEnglish || ctx.improvedVersion || undefined) : undefined,
        next_micro_drill: ctx.action === "drill_check" ? fallbackMicroDrill : undefined,
    };
}

function buildResponsePayload(parsed: Partial<TutorResponsePayload> | null, ctx: PayloadBuildContext): TutorResponsePayload {
    const fallback = buildFallbackPayload(ctx);
    const legacyPatterns = Array.isArray(parsed?.pattern_en)
        ? parsed.pattern_en.map((item) => normalizeCollapsedEnglish(safeString(item))).filter(Boolean).slice(0, 2)
        : (fallback.pattern_en || []);
    const responseIntent = ctx.responseIntent;
    const bridge = buildKnownToNewBridge(ctx.knownKnowledgeDetails, ctx.focusSpan, ctx.teachingPoint, responseIntent);
    const isBattleSurface = ctx.uiSurface === "battle";
    const isScoreSurface = ctx.uiSurface === "score";
    const rawCoachMarkdown = normalizeCollapsedEnglish(safeString(parsed?.coach_markdown) || safeString(parsed?.coach_cn) || fallback.coach_markdown);
    const exampleSentences = normalizeExampleSentences(parsed?.example_sentences, ctx.referenceEnglish);
    const coachMarkdownWithBridge = isBattleSurface
        ? `${bridge}\n\n${rawCoachMarkdown.replace(new RegExp(`^${bridge}\\s*`, "u"), "").trim()}`
        : rawCoachMarkdown;

    const payload: TutorResponsePayload = {
        coach_markdown: coachMarkdownWithBridge,
        response_intent: isScoreSurface ? undefined : responseIntent,
        coach_cn: isScoreSurface
            ? normalizeCollapsedEnglish(safeString(parsed?.coach_cn) || fallback.coach_cn || "")
            : undefined,
        pattern_en: isScoreSurface ? legacyPatterns : undefined,
        contrast: isScoreSurface
            ? normalizeCollapsedEnglish(safeString(parsed?.contrast) || fallback.contrast || "")
            : undefined,
        next_task: isScoreSurface
            ? normalizeCollapsedEnglish(safeString(parsed?.next_task) || fallback.next_task || "")
            : undefined,
        answer_revealed: ctx.allowRevealAnswer,
        example_sentences: exampleSentences,
        teaching_point: safeString(parsed?.teaching_point) || fallback.teaching_point,
        direct_answer_en: isScoreSurface
            ? normalizeCollapsedEnglish(safeString(parsed?.direct_answer_en) || fallback.direct_answer_en || inferDirectAnswerEn(ctx.question, ctx.improvedVersion, ctx.referenceEnglish))
            : undefined,
        error_tags: normalizeErrorTags(parsed?.error_tags, fallback.error_tags),
        micro_drill: isScoreSurface && fallback.micro_drill
            ? normalizeMicroDrill(parsed?.micro_drill, fallback.micro_drill)
            : undefined,
        quality_flags: [],
        drill_feedback_cn: isScoreSurface
            ? normalizeCollapsedEnglish(safeString(parsed?.drill_feedback_cn) || fallback.drill_feedback_cn || "")
            : undefined,
        revised_sentence_en: isScoreSurface
            ? normalizeCollapsedEnglish(safeString(parsed?.revised_sentence_en) || fallback.revised_sentence_en || "")
            : undefined,
        next_micro_drill: isScoreSurface && fallback.micro_drill
            ? normalizeMicroDrill(parsed?.next_micro_drill, fallback.micro_drill)
            : undefined,
    };

    payload.coach_markdown = autoMarkCoachText(normalizeListLayout(payload.coach_markdown), [
        ...legacyPatterns,
    ]);

    if (ctx.allowRevealAnswer) {
        payload.full_answer =
            expandCollapsedReferenceRuns(normalizeCollapsedEnglish(safeString(parsed?.full_answer)), ctx.referenceEnglish) ||
            ctx.improvedVersion ||
            ctx.referenceEnglish;
        payload.answer_reason_cn =
            expandCollapsedReferenceRuns(normalizeCollapsedEnglish(safeString(parsed?.answer_reason_cn)), ctx.referenceEnglish) ||
            "先保证主干自然，再把时间/语气信息放在英语更常见的位置，这样更地道也更稳定。";
    }

    if (!payload.coach_cn) delete payload.coach_cn;
    if (!payload.pattern_en || payload.pattern_en.length === 0) delete payload.pattern_en;
    if (!payload.drill_feedback_cn) delete payload.drill_feedback_cn;
    if (!payload.revised_sentence_en) delete payload.revised_sentence_en;
    if (!payload.next_micro_drill?.prompt_cn) delete payload.next_micro_drill;
    if (!payload.micro_drill?.prompt_cn) delete payload.micro_drill;

    return payload;
}

function collectQualityFlags(payload: TutorResponsePayload, ctx: PayloadBuildContext): string[] {
    const flags: string[] = [];
    const combinedText = [
        payload.coach_markdown,
        payload.coach_cn,
        payload.contrast,
        payload.next_task,
        payload.direct_answer_en,
    ].filter(Boolean).join("\n");
    const anchors = gatherAnchors(ctx.chineseSource, ctx.userAttempt);
    if (!hasContextAnchor(combinedText, anchors)) flags.push("missing_context_anchor");
    if (hasCollapsedEnglish(combinedText)) flags.push("collapsed_english");
    if (ctx.uiSurface === "battle" && !payload.coach_markdown.includes("你已经")) flags.push("missing_known_bridge");
    if (ctx.uiSurface === "score" && (!payload.micro_drill?.prompt_cn || !payload.micro_drill.expected_pattern_en)) flags.push("missing_micro_drill");
    if (ctx.action === "drill_check" && !payload.drill_feedback_cn) flags.push("missing_drill_feedback");
    if (ctx.action === "drill_check" && !payload.revised_sentence_en) flags.push("missing_revised_sentence");
    if (ctx.questionType === "example" && (!payload.example_sentences || payload.example_sentences.length === 0)) flags.push("missing_example_sentences");

    return Array.from(new Set(flags));
}

function applyQualityGuards(payload: TutorResponsePayload, ctx: PayloadBuildContext): { payload: TutorResponsePayload; shouldRetry: boolean } {
    const normalizeWithReference = (value: string | undefined) =>
        value ? softenMarkdownNoise(expandCollapsedReferenceRuns(normalizeCollapsedEnglish(value), ctx.referenceEnglish)) : value;

    const patched: TutorResponsePayload = {
        ...payload,
        coach_markdown: ensureReadableMarkdown(normalizeListLayout(normalizeWithReference(payload.coach_markdown) || "")),
        coach_cn: payload.coach_cn ? normalizeListLayout(normalizeWithReference(payload.coach_cn) || "") : undefined,
        contrast: payload.contrast ? normalizeListLayout(normalizeWithReference(payload.contrast) || "") : undefined,
        next_task: payload.next_task ? normalizeListLayout(normalizeWithReference(payload.next_task) || "") : undefined,
        direct_answer_en: normalizeWithReference(payload.direct_answer_en),
        micro_drill: payload.micro_drill
            ? {
                prompt_cn: payload.micro_drill.prompt_cn,
                expected_pattern_en: expandCollapsedReferenceRuns(normalizeCollapsedEnglish(payload.micro_drill.expected_pattern_en), ctx.referenceEnglish),
            }
            : undefined,
        drill_feedback_cn: payload.drill_feedback_cn ? normalizeWithReference(payload.drill_feedback_cn) : undefined,
        revised_sentence_en: payload.revised_sentence_en ? normalizeWithReference(payload.revised_sentence_en) : undefined,
        next_micro_drill: payload.next_micro_drill
            ? {
                prompt_cn: payload.next_micro_drill.prompt_cn,
                expected_pattern_en: expandCollapsedReferenceRuns(normalizeCollapsedEnglish(payload.next_micro_drill.expected_pattern_en), ctx.referenceEnglish),
            }
            : undefined,
        example_sentences: payload.example_sentences?.map((item) => ({
            ...item,
            sentence_en_tokens: normalizeEnglishTokenArray(item.sentence_en_tokens, ctx.referenceEnglish),
            sentence_en: joinEnglishTokens(normalizeEnglishTokenArray(item.sentence_en_tokens, ctx.referenceEnglish)),
            note_cn: item.note_cn ? normalizeWithReference(item.note_cn) : undefined,
        })),
    };

    const preFlags = collectQualityFlags(patched, ctx);
    const needsAnchor = preFlags.includes("missing_context_anchor");
    const needsBridge = preFlags.includes("missing_known_bridge");

    if (needsAnchor && ctx.uiSurface !== "rebuild_floating_teacher") {
        const anchor = safeString(ctx.chineseSource).split(/[，。！？；]/).find((item) => safeString(item)) || ctx.chineseSource;
        patched.coach_markdown = `${patched.coach_markdown}\n\n结合你这题的“${anchor.slice(0, 14)}”，先保证主干自然，再微调词汇。`;
    }

    if (needsBridge && ctx.uiSurface !== "rebuild_floating_teacher") {
        patched.coach_markdown = `${buildKnownToNewBridge(ctx.knownKnowledgeDetails, ctx.focusSpan, ctx.teachingPoint, ctx.responseIntent)}\n\n${patched.coach_markdown}`;
    }

    if (ctx.action === "drill_check" && !patched.drill_feedback_cn) {
        patched.drill_feedback_cn = "这句方向正确。优先修正一个关键点：主干动词搭配要更自然。";
    }
    if (ctx.action === "drill_check" && !patched.revised_sentence_en) {
        patched.revised_sentence_en = ctx.referenceEnglish || ctx.improvedVersion || patched.direct_answer_en;
    }
    if (ctx.action === "drill_check" && !patched.next_micro_drill) {
        patched.next_micro_drill = inferMicroDrill(patched.teaching_point);
    }

    patched.quality_flags = collectQualityFlags(patched, ctx);
    const shouldRetry = preFlags.some((flag) =>
        flag === "collapsed_english" ||
        flag === "missing_known_bridge" ||
        flag === "missing_micro_drill" ||
        flag === "missing_drill_feedback" ||
        flag === "missing_revised_sentence" ||
        flag === "missing_example_sentences"
    );

    return { payload: patched, shouldRetry };
}

function buildPrompt(params: {
    question: string;
    articleTitle: string;
    chineseSource: string;
    referenceEnglish: string;
    userAttempt: string;
    improvedVersion: string;
    score: unknown;
    teachingPoint: string;
    questionType: TutorQuestionType;
    allowRevealAnswer: boolean;
    conversationText: string;
    action: TutorAction;
    drillInput: string;
    uiSurface: TutorUiSurface;
    intent: TutorIntent;
    focusSpan: string;
    knownKnowledge: string;
    sessionBootstrapped: boolean;
    repairMode: boolean;
}): string {
    const {
        question,
        articleTitle,
        chineseSource,
        referenceEnglish,
        userAttempt,
        improvedVersion,
        score,
        teachingPoint,
        questionType,
        allowRevealAnswer,
        conversationText,
        action,
        drillInput,
        uiSurface,
        intent,
        focusSpan,
        knownKnowledge,
        sessionBootstrapped,
        repairMode,
    } = params;

    const roleInstruction = intent === "rebuild"
        ? "你是一名精准、干练的英语语言教练。你专门帮中国学生理解标准英文句子里的词法、语法和搭配。你的核心风格：① 一次只击穿一个最关键的点，不泛泛而谈；② 永远拿学生面前这句真实的英文句子来说事，不造虚构例子；③ 用中文讲解，但英文词/片段保留英文原文；④ 你记得同一轮对话里之前说过什么——你不会把已经讲透的点再讲一遍，只会接着往深走或换下一个点；⑤ 如果学生追问，说明上轮没讲清楚，你要换个角度或更具体的例子重新讲。"
        : uiSurface === "score" && intent !== "translate"
            ? "You are an English usage coach for Chinese learners. Focus on questions about English wording, phrases, collocations, and grammar inside one finished sentence. Do not roleplay as a tutor or scoring judge."
            : "You are an IELTS translation tutor for Chinese native speakers. Teaching style must be: teacher-like guidance + Chinese explanation + gentle correction + teach from known to new.";

    // For rebuild mode, send a leaner context to prevent hallucinations
    // (improvedVersion == referenceEnglish => redundant; userAttempt from token selection may be garbled)
    const isRebuildSurface = intent === "rebuild" || uiSurface === "rebuild_floating_teacher";
    const baseContext = isRebuildSurface ? `
${roleInstruction}

Context:
- Surface: "${uiSurface}"
- Intent: "rebuild"
- Focus span: "${focusSpan || "N/A"}"
- Article topic: "${articleTitle}"
- Chinese source: "${chineseSource}"
- Standard English sentence (the one the student is studying): "${referenceEnglish}"
- Session bootstrapped: ${sessionBootstrapped ? "YES" : "NO"}
- Allow full answer now: ${allowRevealAnswer ? "YES" : "NO"}
- Recent turns:
${conversationText}
- Student question: "${question}"
` : `
${roleInstruction}

Context:
- Surface: "${uiSurface}"
- Intent: "${intent}"
- Focus span: "${focusSpan || "N/A"}"
- Article topic: "${articleTitle}"
- Chinese sentence: "${chineseSource}"
- Golden reference: "${referenceEnglish}"
- User attempt: "${userAttempt}"
- Improved version: "${improvedVersion}"
- Score: ${typeof score === "number" ? score : "N/A"}
- Teaching point: "${teachingPoint}"
- Question type: "${questionType}"
- Action: "${action}"
- Session bootstrapped: ${sessionBootstrapped ? "YES" : "NO"}
- Allow full answer now: ${allowRevealAnswer ? "YES" : "NO"}
- Recent turns:
${conversationText}
- User question: "${question}"
- User micro drill input: "${drillInput || "N/A"}"
- Known knowledge to connect from: "${knownKnowledge}"
`;

    if (action === "drill_check") {
        return `
${baseContext}

Output STRICT JSON ONLY with this exact schema:
{
  "coach_cn": "不超过3句，先肯定再指出1-2个改进点",
  "pattern_en": ["英文模板1","英文模板2(可选)"],
  "contrast": "本句中的中式问题 vs 地道写法",
  "next_task": "下一步练习要求",
  "answer_revealed": false,
  "teaching_point": "和本题一致的教学点",
  "direct_answer_en": "给出可直接复用的一句改写",
  "error_tags": ["grammar","word_order"],
  "micro_drill": { "prompt_cn": "新的小练习题干", "expected_pattern_en": "要练的结构" },
  "drill_feedback_cn": "针对用户刚提交句子的即时反馈",
  "revised_sentence_en": "用户句子的建议改写",
  "next_micro_drill": { "prompt_cn": "下一道同结构小练习", "expected_pattern_en": "同结构模板" }
}

Rules:
1) drill_feedback_cn 必须引用用户刚提交句子的一个词或片段。
2) revised_sentence_en 必须可直接复用，且避免冗长。
3) error_tags 只用: word_choice, word_order, grammar, register, collocation, tense。
4) 必须给 next_micro_drill，且与 teaching_point 同结构。
5) 中文解释简洁，不超过3句。
${repairMode ? '6) REPAIR MODE: 这次回复必须补齐之前缺失字段，不要泛泛而谈。' : ""}
        `;
    }

    if (uiSurface === "battle") {
        return `
${baseContext}

Output STRICT JSON ONLY with this exact schema:
{
  "response_intent": "word_meaning | collocation | partial_phrase | pattern | naturalness | full_sentence | unlock_answer",
  "coach_markdown": "Markdown 教学内容，最多 3 个编号点，必须有换行和重点高亮",
  "answer_revealed": false,
  "full_answer": "仅当允许公开答案时提供",
  "answer_reason_cn": "仅当公开答案时提供，解释为什么这样说",
  "example_sentences": [
    { "label_cn": "同结构例句", "sentence_en_tokens": ["I","live","in","London","."], "note_cn": "只在用户要求例句/同结构句时提供" }
  ],
  "teaching_point": "和本题一致的教学点",
  "error_tags": ["word_choice","word_order"],
  "quality_flags": []
}

Rules:
1) 你是老师，不是评分官；这是翻译过程中的求助弹窗，不要写评分讲评，不要写“中式 vs 地道”栏目，不要写“下一步”栏目。
2) 必须先从 Known knowledge to connect from 里找一个已知点接上，再讲新的点，体现“从已知到未知”的教学；这部分必须写进 coach_markdown 第一段或第一条编号里，不要输出系统化标签、连接卡或“已知-新知”块。
3) 第一行必须直接回答用户当前卡点，不要空泛开场。
4) 只解决 1 个最关键问题，避免一次讲太多。
5) coach_markdown 必须使用 Markdown；当有 1. 2. 3. 时每条必须换行。
6) If Allow full answer now is NO, set answer_revealed to false and DO NOT provide full_answer.
7) If Allow full answer now is YES, you may provide full_answer + answer_reason_cn.
8) 只有当 response_intent = unlock_answer 或用户明确要求参考表达/完整答案时，才允许输出完整整句。
9) Must anchor explanation to this exact drill: reference at least one phrase from Chinese sentence or user attempt.
10) English phrases must use normal spaces. Never output collapsed tokens.
11) 如果用户只是问词义/搭配/局部表达，不要泄露整句答案。
12) 只有用户明确说“我想看参考表达/完整答案/整句怎么翻”时，才允许 answer_revealed = true 并提供 full_answer。
13) 关键术语必须用 **粗体**，可直接套用的英文必须用反引号 \`...\`。
14) error_tags 只用: word_choice, word_order, grammar, register, collocation, tense。
15) 如果你要给新的英文例句或“同结构句”，必须放进 example_sentences；不要把 5 个词以上的新英文句子直接写进 coach_markdown。
16) example_sentences[].sentence_en_tokens 必须是一词一格的 token 数组，标点单独成 token。
${repairMode ? '17) REPAIR MODE: 这次回复必须补齐之前缺失字段，并强制贴合当前题目上下文。' : ""}
        `;
    }

    if (intent === "rebuild") {
        const sessionHint = sessionBootstrapped
            ? `【追问阶段】Recent turns 里你已经讲过一些内容——不要重复那些点，直接接着继续深入或转至下一个卡点。如果学生两次问同类问题，说明上次没讲清楚，换个角度或更具体的例子重新解释。`
            : `【首次提问】允许先用这句英文里的 1 个真实词或片段当"锚"，快速定位语境，然后直接回答问题。`;

        return `
${baseContext}

## 你的任务
学生正在看这道 Rebuild 题的标准英文答案，遇到不懂的地方来问你。
你只需要帮他理解：这个词/短语/语法点是什么意思、为什么这样写、怎么记住它。

## 对话阶段
${sessionHint}

## 输出格式规则（严格按需，不堆格式）
- **首选**：直接用中文段落回答，用空行分段，长回答最多 2-3 段，每段 1-3 句
- 需要举例/对比 2 个英文词（如 short vs. lacking）：可用一个 2 列小表格，但**只在真正需要并排比较时才用**，其他情况一律不用表格
- 需要列出 3 个以上并列要点：用编号列表，每条 1 行
- 重点词/短语：用 **粗体** 标注英文词，中文解释跟在后面即可
- **严禁**：不要无故用 ### 标题；不要为了"有结构感"而凑表格；不要用表格替代正常的解释段落
- coach_markdown 至少包含一种 Markdown 标记（粗体或反引号），但不要为此强行加不必要的表格或列表

Output STRICT JSON ONLY with this exact schema:
{
  "coach_markdown": "Markdown 中文讲解，直接回答学生的问题，简洁且有结构",
  "answer_revealed": false,
  "full_answer": "仅当 Allow full answer now 为 YES 时填写",
  "answer_reason_cn": "仅当 Allow full answer now 为 YES 时填写，解释标准句为何这样写",
  "example_sentences": [
    { "label_cn": "同结构例句", "sentence_en_tokens": ["I","live","in","London","and","am","familiar","with","its","transit","system","."], "note_cn": "只在用户明确要例句/同结构句时提供" }
  ],
  "teaching_point": "这次解答聚焦的核心语法/词法/搭配点，一句话",
  "error_tags": ["word_choice"]
}

Rules:
1. 只围绕学生问的那个词/短语/语法点回答，不扩展到整句分析。
2. 如果 Recent turns 里此前已解释过某点，这次绝不重复——直接接着讲下一个卡点或追问细节。
3. 第一行必须直接给出答案或核心结论，禁止空泛开场（如"好问题"、"让我来解释"这类废话）。
4. 解释时一定要引用标准英文句子里的至少 1 个真实词或片段，不允许用虚构例子替换。
5. 英文词/短语在中文解释中保留英文原词，不要把它翻译掉写没了。
6. 行内代码反引号只用于单个英文词或极短短语（4 词以内），不要把整句包进去。
7. 长度控制：词义/搭配类问题 3-5 行为宜；回答较长时用空行分段（不超过 3 段），不要堆表格或标题来凑结构。
8. 表格只用于需要并排对比的场景（如 2 个词的含义差异）；能用一句话解释清楚的，绝对不用表格。
9. If Allow full answer now is NO -> answer_revealed = false，不写 full_answer。
10. If Allow full answer now is YES -> 可以提供 full_answer + answer_reason_cn。
11. error_tags 只用: word_choice, word_order, grammar, register, collocation, tense。
12. English phrases must use normal spaces. Never output collapsed tokens.
13. Surface 为 rebuild_floating_teacher 时：更加紧凑，优先 2-3 行核心答案，不用表格，必要时最多 3 条短列表。
14. 如果用户要求“相同句子 / 同结构例句 / 再给一个例句”，新的英文例句只能放进 example_sentences，不要把 5 个词以上的新英文句子直接写进 coach_markdown。
15. example_sentences[].sentence_en_tokens 必须是一词一格的 token 数组，标点单独成 token；note_cn 用中文解释这个例句怎么对应当前结构。
${repairMode ? "16. REPAIR MODE: 必须补齐缺失字段，并引用当前英文句子里的真实片段。" : ""}
        `;
    }


    return `
${baseContext}

Output STRICT JSON ONLY with this exact schema:
{
  "coach_cn": "中文教学讲解，不超过3句，先肯定后纠错，最多指出1-2个关键问题",
  "pattern_en": ["英文模板1","英文模板2(可选)"],
  "contrast": "中式表达 vs 地道表达（聚焦搭配/语序）",
  "next_task": "让用户马上做一个迁移练习",
  "answer_revealed": false,
  "full_answer": "仅当允许公开答案时提供",
  "answer_reason_cn": "仅当公开答案时提供，解释为什么这样说",
  "teaching_point": "和本题一致的教学点",
  "direct_answer_en": "如果用户问'怎么翻译'则必须给",
  "error_tags": ["word_choice","word_order"],
  "micro_drill": { "prompt_cn": "一句可立即练习的题干", "expected_pattern_en": "目标结构模板" }
}

Rules:
1) 这是评分页里的英文问答弹窗，不是 tutor，不要用“老师”口吻，不要写评分讲评。
2) 优先回答英文里的词义、短语、搭配、语法或词序问题，不要泛泛而谈。
3) 第一行必须直接回答用户当前问题，不能空泛开场。
4) If Allow full answer now is NO, set answer_revealed to false and DO NOT provide full_answer.
5) If Allow full answer now is YES, you may provide full_answer + answer_reason_cn.
6) pattern_en must contain 1-2 short reusable patterns.
7) Keep concise and practical for immediate reuse.
8) In coach_cn, automatically mark 2-3 key learning points using markdown bold: **key point**.
9) Markdown is fully allowed in coach_cn/contrast/next_task: headings, blockquotes, lists, inline code, code fences, tables.
10) Must anchor explanation to this exact drill: reference at least one phrase from the English sentence or user attempt.
11) If Recent turns is not N/A, connect to prior turn briefly so the user feels continuity.
12) If user asks "怎么翻译/英文怎么说", first sentence MUST give one direct translation in backticks, then explain.
13) English phrases must use normal spaces. Never output collapsed tokens like "asksomeoneabout" or "gathercouragetodosomething".
14) Always include micro_drill with prompt_cn + expected_pattern_en.
15) error_tags 只用: word_choice, word_order, grammar, register, collocation, tense。
${repairMode ? '16) REPAIR MODE: 这次回复必须补齐之前缺失字段，并强制贴合当前题目上下文。' : ""}
    `;
}

async function runNonStreamModel(prompt: string, thinkingMode: TutorThinkingMode): Promise<string> {
    const completion = await deepseek.chat.completions.create({
        messages: [
            { role: "system", content: "You are a structured English learning assistant. Output strict JSON only." },
            { role: "user", content: prompt },
        ],
        model: getTutorModel(thinkingMode),
        temperature: 0.5,
    });

    return safeString((completion as { choices?: Array<{ message?: { content?: string | null } }> } | null)?.choices?.[0]?.message?.content);
}

function sseChunk(event: string, payload: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export const runtime = "edge";

export async function POST(req: NextRequest) {
    try {
        const {
            query,
            drillContext,
            articleTitle,
            questionType,
            userAttempt,
            userTranslation,
            improvedVersion,
            score,
            recentTurns,
            conversation,
            teachingPoint,
            revealAnswer,
            stream,
            action,
            uiSurface,
            intent,
            focusSpan,
            drillInput,
            recentMastery,
            sessionBootstrapped,
            thinkingMode,
        } = await req.json();

        if (!query || !drillContext) {
            return NextResponse.json(
                { error: "Query and drill context are required" },
                { status: 400 }
            );
        }

        const normalizedQuestion = safeString(query);
        const normalizedAttempt = safeString(userAttempt) || safeString(userTranslation);
        const normalizedImprovedVersion = safeString(improvedVersion);
        const normalizedTeachingPoint = safeString(teachingPoint) || "语序与自然表达";
        const normalizedQuestionType: TutorQuestionType = (
            safeString(questionType) || "follow_up"
        ) as TutorQuestionType;
        const normalizedAction = normalizeAction(action);
        const normalizedSurface = normalizeUiSurface(uiSurface);
        const normalizedIntent = normalizeIntent(intent);
        const normalizedThinkingMode = normalizeThinkingMode(thinkingMode);
        const normalizedFocusSpan = safeString(focusSpan);
        const normalizedDrillInput = safeString(drillInput);
        const turns = normalizeTurns(recentTurns ?? conversation);
        const normalizedRecentMastery = normalizeRecentMastery(recentMastery);
        const normalizedSessionBootstrapped = sessionBootstrapped === true;
        const allowRevealAnswer =
            normalizedQuestionType === "unlock_answer" ||
            revealAnswer === true;
        const isStreaming = stream === true && normalizedAction === "ask";

        const chineseSource = safeString(drillContext.chinese);
        const referenceEnglish = safeString(drillContext.reference_english);
        const conversationText = turns.length > 0
            ? turns
                .slice(-4)
                .map((item, idx) => `Q${idx + 1}: ${item.question || ""}\nA${idx + 1}: ${item.answer || ""}`)
                .join("\n")
            : "N/A";

        const knownKnowledgeDetails = buildKnownKnowledgeDetails(
            turns,
            normalizedTeachingPoint,
            normalizedFocusSpan,
            normalizedAttempt,
            normalizedRecentMastery,
        );
        const responseIntent = classifyResponseIntent(
            normalizedQuestion,
            normalizedQuestionType,
            normalizedFocusSpan,
        );

        const payloadContext: PayloadBuildContext = {
            question: normalizedQuestion,
            questionType: normalizedQuestionType,
            action: normalizedAction,
            uiSurface: normalizedSurface,
            teachingPoint: normalizedTeachingPoint,
            improvedVersion: normalizedImprovedVersion,
            referenceEnglish,
            allowRevealAnswer,
            chineseSource,
            userAttempt: normalizedAttempt,
            drillInput: normalizedDrillInput,
            focusSpan: normalizedFocusSpan,
            knownKnowledgeDetails,
            knownKnowledge: buildKnownKnowledgeSummary(knownKnowledgeDetails),
            responseIntent,
            sessionBootstrapped: normalizedSessionBootstrapped,
        };

        const buildValidatedPayload = (rawContent: string) => {
            const parsed = parseJsonFromModel(rawContent);
            const built = buildResponsePayload(parsed, payloadContext);
            const guarded = applyQualityGuards(built, payloadContext);
            return { parsed, ...guarded };
        };

        const makePrompt = (repairMode: boolean) => buildPrompt({
            question: normalizedQuestion,
            articleTitle: safeString(articleTitle),
            chineseSource,
            referenceEnglish,
            userAttempt: normalizedAttempt,
            improvedVersion: normalizedImprovedVersion,
            score,
            teachingPoint: normalizedTeachingPoint,
            questionType: normalizedQuestionType,
            allowRevealAnswer,
            conversationText,
            action: normalizedAction,
            drillInput: normalizedDrillInput,
            uiSurface: normalizedSurface,
            intent: normalizedIntent,
            focusSpan: normalizedFocusSpan,
            knownKnowledge: payloadContext.knownKnowledge,
            sessionBootstrapped: normalizedSessionBootstrapped,
            repairMode,
        });

        if (!isStreaming) {
            let content = await runNonStreamModel(makePrompt(false), normalizedThinkingMode);
            let result = buildValidatedPayload(content);

            if (result.shouldRetry) {
                content = await runNonStreamModel(makePrompt(true), normalizedThinkingMode);
                result = buildValidatedPayload(content);
            }

            return NextResponse.json(result.payload);
        }

        const completionStream = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a structured English learning assistant. Output strict JSON only." },
                { role: "user", content: makePrompt(false) },
            ],
            model: getTutorModel(normalizedThinkingMode),
            temperature: 0.5,
            stream: true,
        }) as unknown as AsyncIterable<StreamChunk>;

        const encoder = new TextEncoder();
        const streamResponse = new ReadableStream({
            async start(controller) {
                let fullContent = "";
                let lastPartialCoach = "";

                try {
                    for await (const chunk of completionStream) {
                        const delta = safeString(chunk.choices?.[0]?.delta?.content ?? "");
                        if (!delta) continue;

                        fullContent += delta;
                        const partialCoach = ensureReadableMarkdown(softenMarkdownNoise(
                            expandCollapsedReferenceRuns(
                                normalizeCollapsedEnglish(extractCoachMarkdownPartial(fullContent)),
                                payloadContext.referenceEnglish
                            )
                        ));
                        if (partialCoach && partialCoach !== lastPartialCoach) {
                            lastPartialCoach = partialCoach;
                            controller.enqueue(encoder.encode(sseChunk("chunk", { coach_markdown: partialCoach })));
                        }
                    }

                    let result = buildValidatedPayload(fullContent);
                    if (!result.parsed && lastPartialCoach) {
                        result.payload.coach_markdown = autoMarkCoachText(
                            softenMarkdownNoise(expandCollapsedReferenceRuns(normalizeCollapsedEnglish(lastPartialCoach), payloadContext.referenceEnglish)),
                            result.payload.pattern_en || []
                        );
                    }

                    if (result.shouldRetry) {
                        const repairedContent = await runNonStreamModel(makePrompt(true), normalizedThinkingMode);
                        result = buildValidatedPayload(repairedContent);
                    }

                    controller.enqueue(encoder.encode(sseChunk("final", result.payload)));
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (error) {
                    console.error("Ask Tutor Stream Error:", error);

                    try {
                        if (lastPartialCoach) {
                            const fallbackPayload = buildResponsePayload({
                                coach_markdown: lastPartialCoach,
                                teaching_point: payloadContext.teachingPoint,
                                answer_revealed: payloadContext.allowRevealAnswer,
                            }, payloadContext);
                            controller.enqueue(encoder.encode(sseChunk("final", fallbackPayload)));
                            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                            controller.close();
                            return;
                        }

                        const repairedContent = await runNonStreamModel(makePrompt(true), normalizedThinkingMode);
                        const repairedResult = buildValidatedPayload(repairedContent);
                        controller.enqueue(encoder.encode(sseChunk("final", repairedResult.payload)));
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                        controller.close();
                        return;
                    } catch (recoveryError) {
                        console.error("Ask Tutor Stream Recovery Error:", recoveryError);
                    }

                    controller.enqueue(encoder.encode(sseChunk("error", { error: "Tutor stream failed" })));
                    controller.close();
                }
            },
        });

        return new Response(streamResponse, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("Ask Tutor Error:", error);
        return NextResponse.json(
            { error: "Failed to get help" },
            { status: 500 }
        );
    }
}
