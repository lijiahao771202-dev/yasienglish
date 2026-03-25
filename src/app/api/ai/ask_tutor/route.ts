import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

interface TutorTurn {
    question?: string;
    answer?: string;
}

type TutorQuestionType = "pattern" | "word_choice" | "example" | "unlock_answer" | "follow_up";
type TutorAction = "ask" | "drill_check";
type TutorUiSurface = "battle" | "score";
type TutorIntent = "translate" | "grammar" | "lexical" | "rebuild";
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

    const stripped = stripQuestionTail(input);
    if (stripped && /^[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z\s'-]{0,24}$/.test(stripped)) {
        return stripped.slice(0, 24).trim();
    }

    const quoted = input.match(/[“"]([^”"]{1,24})[”"]/u)?.[1]?.trim();
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
    return safeString(value) === "battle" ? "battle" : "score";
}

function normalizeIntent(value: unknown): TutorIntent {
    const normalized = safeString(value);
    if (normalized === "grammar" || normalized === "lexical" || normalized === "rebuild") return normalized;
    return "translate";
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
    ];

    for (const [pattern, replacement] of replacements) {
        normalized = normalized.replace(pattern, replacement);
    }

    normalized = normalized
        .replace(/\b([a-z]{2,})someone([a-z]{2,})\b/gi, "$1 someone $2")
        .replace(/\b([a-z]{2,})something([a-z]{2,})\b/gi, "$1 something $2")
        .replace(/\b([a-z]{2,})tosomeone\b/gi, "$1 to someone")
        .replace(/\b([a-z]{2,})tosomething\b/gi, "$1 to something")
        .replace(/\b([a-z]{3,})as(a|an|the)([a-z]{3,})\b/gi, "$1 as $2 $3")
        .replace(/\b([a-z]{3,})(a|an|the)([a-z]{3,})\b/gi, "$1 $2 $3");

    return normalized;
}

function expandCollapsedReferenceRuns(text: string, referenceEnglish: string): string {
    const source = safeString(text);
    const reference = safeString(referenceEnglish);
    if (!source || !reference) return source;

    const referenceTokens = reference
        .match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)
        ?.map((token) => token.toLowerCase())
        .filter((token) => token.length >= 2) || [];

    if (referenceTokens.length < 2) return source;

    const candidateMap = new Map<string, string>();

    for (let start = 0; start < referenceTokens.length; start += 1) {
        let joined = "";
        const parts: string[] = [];
        for (let end = start; end < Math.min(referenceTokens.length, start + 5); end += 1) {
            parts.push(referenceTokens[end]);
            joined += referenceTokens[end];
            if (parts.length >= 2 && joined.length >= 8) {
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

    return normalized;
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
    return /\b[a-z]{5,}(someone|something|to)[a-z]{4,}\b/i.test(text) || /\b[a-z]{18,}\b/i.test(text);
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
    const directAnswer = inferDirectAnswerEn(ctx.question, ctx.improvedVersion, ctx.referenceEnglish);
    const legacyPatterns = ["When ..., ...", "It was only after ... that ..."];
    const bridge = buildKnownToNewBridge(ctx.knownKnowledgeDetails, ctx.focusSpan, ctx.teachingPoint, ctx.responseIntent);

    return {
        coach_markdown: isScoreSurface
            ? "你已经抓住了核心意思。先保留**主干结构**，再只修 1-2 个最关键的**表达点**。"
            : `${bridge}\n\n1. **先回答你现在问的点。**\n2. 这次只补当前卡住的**词/搭配/语序**。\n3. 先把这个点补稳，再决定要不要看整句。`,
        response_intent: isScoreSurface ? undefined : ctx.responseIntent,
        coach_cn: isScoreSurface ? "你已经抓住了核心意思。先保留**主干结构**，再只修 1-2 个最关键的**表达点**。" : undefined,
        pattern_en: isScoreSurface ? legacyPatterns : undefined,
        contrast: isScoreSurface ? "中式常逐词直译，地道表达更强调主干先行与信息重心。" : undefined,
        next_task: isScoreSurface ? "请按一个模板重写一句，只改一个关键点再发我。" : undefined,
        answer_revealed: false,
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
    const rawCoachMarkdown = normalizeCollapsedEnglish(safeString(parsed?.coach_markdown) || safeString(parsed?.coach_cn) || fallback.coach_markdown);
    const coachMarkdownWithBridge = ctx.uiSurface === "battle"
        ? `${bridge}\n\n${rawCoachMarkdown.replace(new RegExp(`^${bridge}\\s*`, "u"), "").trim()}`
        : rawCoachMarkdown;

    const payload: TutorResponsePayload = {
        coach_markdown: coachMarkdownWithBridge,
        response_intent: ctx.uiSurface === "battle" ? responseIntent : undefined,
        coach_cn: ctx.uiSurface === "score"
            ? normalizeCollapsedEnglish(safeString(parsed?.coach_cn) || fallback.coach_cn || "")
            : undefined,
        pattern_en: ctx.uiSurface === "score" ? legacyPatterns : undefined,
        contrast: ctx.uiSurface === "score"
            ? normalizeCollapsedEnglish(safeString(parsed?.contrast) || fallback.contrast || "")
            : undefined,
        next_task: ctx.uiSurface === "score"
            ? normalizeCollapsedEnglish(safeString(parsed?.next_task) || fallback.next_task || "")
            : undefined,
        answer_revealed: ctx.allowRevealAnswer,
        teaching_point: safeString(parsed?.teaching_point) || fallback.teaching_point,
        direct_answer_en: ctx.uiSurface === "score"
            ? normalizeCollapsedEnglish(safeString(parsed?.direct_answer_en) || fallback.direct_answer_en || inferDirectAnswerEn(ctx.question, ctx.improvedVersion, ctx.referenceEnglish))
            : undefined,
        error_tags: normalizeErrorTags(parsed?.error_tags, fallback.error_tags),
        micro_drill: ctx.uiSurface === "score" && fallback.micro_drill
            ? normalizeMicroDrill(parsed?.micro_drill, fallback.micro_drill)
            : undefined,
        quality_flags: [],
        drill_feedback_cn: ctx.uiSurface === "score"
            ? normalizeCollapsedEnglish(safeString(parsed?.drill_feedback_cn) || fallback.drill_feedback_cn || "")
            : undefined,
        revised_sentence_en: ctx.uiSurface === "score"
            ? normalizeCollapsedEnglish(safeString(parsed?.revised_sentence_en) || fallback.revised_sentence_en || "")
            : undefined,
        next_micro_drill: ctx.uiSurface === "score" && fallback.micro_drill
            ? normalizeMicroDrill(parsed?.next_micro_drill, fallback.micro_drill)
            : undefined,
    };

    payload.coach_markdown = autoMarkCoachText(normalizeListLayout(payload.coach_markdown), [
        ...legacyPatterns,
    ]);

    if (ctx.allowRevealAnswer) {
        payload.full_answer =
            normalizeCollapsedEnglish(safeString(parsed?.full_answer)) ||
            ctx.improvedVersion ||
            ctx.referenceEnglish;
        payload.answer_reason_cn =
            normalizeCollapsedEnglish(safeString(parsed?.answer_reason_cn)) ||
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
    };

    const preFlags = collectQualityFlags(patched, ctx);
    const needsAnchor = preFlags.includes("missing_context_anchor");
    const needsBridge = preFlags.includes("missing_known_bridge");

    if (needsAnchor) {
        const anchor = safeString(ctx.chineseSource).split(/[，。！？；]/).find((item) => safeString(item)) || ctx.chineseSource;
        patched.coach_markdown = `${patched.coach_markdown}\n\n结合你这题的“${anchor.slice(0, 14)}”，先保证主干自然，再微调词汇。`;
    }

    if (needsBridge) {
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
        flag === "missing_known_bridge" ||
        flag === "missing_micro_drill" ||
        flag === "missing_drill_feedback" ||
        flag === "missing_revised_sentence"
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
        repairMode,
    } = params;

    const roleInstruction = intent === "rebuild"
        ? "You are a patient English teacher for Chinese learners. The learner is weak in grammar, phrases, collocations, and word usage. Explain why this English sentence is written this way, in clear Chinese, without sounding like a scoring judge."
        : uiSurface === "score" && intent !== "translate"
            ? "You are an English usage coach for Chinese learners. Focus on questions about English wording, phrases, collocations, and grammar inside one finished sentence. Do not roleplay as a tutor or scoring judge."
            : "You are an IELTS translation tutor for Chinese native speakers. Teaching style must be: teacher-like guidance + Chinese explanation + gentle correction + teach from known to new.";

    const baseContext = `
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
${repairMode ? '15) REPAIR MODE: 这次回复必须补齐之前缺失字段，并强制贴合当前题目上下文。' : ""}
        `;
    }

    if (intent === "rebuild") {
        return `
${baseContext}

Output STRICT JSON ONLY with this exact schema:
{
  "coach_markdown": "Markdown 中文回答，直接回答用户的英文问题",
  "answer_revealed": false,
  "full_answer": "仅当允许公开答案时提供",
  "answer_reason_cn": "仅当允许公开答案时提供，解释标准句为何这样组织",
  "teaching_point": "围绕语法/短语/搭配/词序的教学点",
  "error_tags": ["word_choice","word_order"]
}

Rules:
1) 你是英语老师，不是评分官，不要写评分讲评。
2) 用户在语法、短语、搭配上比较弱，解释时要照顾这一点，但不要太啰嗦。
3) 只围绕这句标准英文回答：为什么这样写、这个短语什么意思、这个语法点怎么理解。
4) 把 Recent turns 当成同一题内的连续对话。若用户在追问，必须接着上一轮讲，不要假装忘记前文。
5) 第一行必须直接回答用户当前问题，不要空泛开场。
6) 默认简洁清楚；只有当用户明显追问细节时，才展开多讲一点。
7) 如果用户只问一个词、短语或局部语法，就只解释那个点，不要把整句全拆一遍。
8) coach_markdown 必须始终输出 Markdown，不能只给纯段落。
9) 至少包含 1 个 Markdown 结构：\`###\` 小标题、项目列表、编号列表、引用块、表格，任选其一；如果适合比较词义/语法/搭配，优先使用表格。
10) 推荐写法：先用一个短标题 + 1 小段直接回答；如有必要，再补一个最多 3 条的短列表或一个 2-3 行的小表格。
11) 表格要小而清楚，优先 2 列：\`点\` / \`解释\`，不要做大表。
12) 如果使用 **重点**，优先标英文词、英文短语，或“英文 + 极短中文标签”；不要只高亮整段中文解释。
13) 不要写成长文，不要堆太多高亮，不要把很多短语都包成 code。
14) 行内代码 \`...\` 只用于单个英文词或很短的短语。
15) Must anchor explanation to this exact English sentence: quote at least one word, phrase, or chunk from the sentence.
16) English phrases must use normal spaces. Never output collapsed tokens.
17) If Allow full answer now is NO, set answer_revealed to false and DO NOT provide full_answer.
18) If Allow full answer now is YES, you may provide full_answer + answer_reason_cn.
19) error_tags 只用: word_choice, word_order, grammar, register, collocation, tense。
${repairMode ? '20) REPAIR MODE: 这次回复必须补齐之前缺失字段，并贴合当前这句英文与前文上下文。' : ""}
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

async function runNonStreamModel(prompt: string): Promise<string> {
    const completion = await deepseek.chat.completions.create({
        messages: [
            { role: "system", content: "You are a structured English learning assistant. Output strict JSON only." },
            { role: "user", content: prompt },
        ],
        model: "deepseek-chat",
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
        const normalizedFocusSpan = safeString(focusSpan);
        const normalizedDrillInput = safeString(drillInput);
        const turns = normalizeTurns(recentTurns ?? conversation);
        const normalizedRecentMastery = normalizeRecentMastery(recentMastery);
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
            repairMode,
        });

        if (!isStreaming) {
            let content = await runNonStreamModel(makePrompt(false));
            let result = buildValidatedPayload(content);

            if (result.shouldRetry) {
                content = await runNonStreamModel(makePrompt(true));
                result = buildValidatedPayload(content);
            }

            return NextResponse.json(result.payload);
        }

        const completionStream = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a structured English learning assistant. Output strict JSON only." },
                { role: "user", content: makePrompt(false) },
            ],
            model: "deepseek-chat",
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
                        const repairedContent = await runNonStreamModel(makePrompt(true));
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

                        const repairedContent = await runNonStreamModel(makePrompt(true));
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
