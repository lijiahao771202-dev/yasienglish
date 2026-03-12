import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

interface TutorTurn {
    question?: string;
    answer?: string;
}

type TutorQuestionType = "pattern" | "word_choice" | "example" | "unlock_answer" | "follow_up";
type TutorAction = "ask" | "drill_check";
type TutorUiSurface = "battle" | "score";
type TutorIntent = "translate" | "grammar" | "lexical";

interface TutorMicroDrill {
    prompt_cn: string;
    expected_pattern_en: string;
}

interface TutorResponsePayload {
    coach_cn: string;
    pattern_en: string[];
    contrast: string;
    next_task: string;
    answer_revealed: boolean;
    full_answer?: string;
    answer_reason_cn?: string;
    teaching_point: string;
    direct_answer_en: string;
    error_tags: string[];
    micro_drill: TutorMicroDrill;
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
    teachingPoint: string;
    improvedVersion: string;
    referenceEnglish: string;
    allowRevealAnswer: boolean;
    chineseSource: string;
    userAttempt: string;
    drillInput: string;
}

const ERROR_TAG_SET = new Set(["word_choice", "word_order", "grammar", "register", "collocation", "tense"]);

function clampHintLevel(value: unknown): number {
    if (typeof value !== "number" || Number.isNaN(value)) return 1;
    return Math.max(1, Math.min(4, Math.floor(value)));
}

function safeString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
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

function normalizeAction(value: unknown): TutorAction {
    return safeString(value) === "drill_check" ? "drill_check" : "ask";
}

function normalizeUiSurface(value: unknown): TutorUiSurface {
    return safeString(value) === "battle" ? "battle" : "score";
}

function normalizeIntent(value: unknown): TutorIntent {
    const normalized = safeString(value);
    if (normalized === "grammar" || normalized === "lexical") return normalized;
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

function extractCoachCnPartial(content: string): string {
    const keyMatch = content.match(/"coach_cn"\s*:\s*"/i);
    if (!keyMatch || keyMatch.index === undefined) {
        return "";
    }

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

    const candidates = [...chinesePriority, ...englishTerms];
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
    ];

    for (const [pattern, replacement] of replacements) {
        normalized = normalized.replace(pattern, replacement);
    }

    normalized = normalized
        .replace(/\b([a-z]{2,})someone([a-z]{2,})\b/gi, "$1 someone $2")
        .replace(/\b([a-z]{2,})something([a-z]{2,})\b/gi, "$1 something $2")
        .replace(/\b([a-z]{2,})tosomeone\b/gi, "$1 to someone")
        .replace(/\b([a-z]{2,})tosomething\b/gi, "$1 to something");

    return normalized;
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

function requiresDirectAnswer(question: string): boolean {
    return /怎么翻译|怎么说|英文怎么说|怎么表达|怎么写成英文|what'?s.*english/i.test(question);
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

function buildFallbackPayload(ctx: PayloadBuildContext): TutorResponsePayload {
    const fallbackMicroDrill = inferMicroDrill(ctx.teachingPoint);
    return {
        coach_cn: "你已经抓住了核心意思。先保留**主干结构**，再只修 1-2 个最关键的**表达点**。",
        pattern_en: ["When ..., ...", "It was only after ... that ..."],
        contrast: "中式常逐词直译，地道表达更强调主干先行与信息重心。",
        next_task: "请按一个模板重写一句，只改一个关键点再发我。",
        answer_revealed: false,
        teaching_point: ctx.teachingPoint,
        direct_answer_en: inferDirectAnswerEn(ctx.question, ctx.improvedVersion, ctx.referenceEnglish),
        error_tags: inferErrorTags(ctx.questionType, ctx.teachingPoint),
        micro_drill: fallbackMicroDrill,
        quality_flags: [],
        drill_feedback_cn: ctx.action === "drill_check" ? "你这句方向是对的，先调整一个关键点再提交一次。" : undefined,
        revised_sentence_en: ctx.action === "drill_check" ? (ctx.referenceEnglish || ctx.improvedVersion || undefined) : undefined,
        next_micro_drill: ctx.action === "drill_check" ? fallbackMicroDrill : undefined,
    };
}

function buildResponsePayload(parsed: Partial<TutorResponsePayload> | null, ctx: PayloadBuildContext): TutorResponsePayload {
    const fallback = buildFallbackPayload(ctx);
    const payload: TutorResponsePayload = {
        coach_cn: normalizeCollapsedEnglish(safeString(parsed?.coach_cn) || fallback.coach_cn),
        pattern_en: Array.isArray(parsed?.pattern_en)
            ? parsed.pattern_en
                .map((item) => normalizeCollapsedEnglish(safeString(item)))
                .filter(Boolean)
                .slice(0, 2)
            : fallback.pattern_en,
        contrast: normalizeCollapsedEnglish(safeString(parsed?.contrast) || fallback.contrast),
        next_task: normalizeCollapsedEnglish(safeString(parsed?.next_task) || fallback.next_task),
        answer_revealed: ctx.allowRevealAnswer,
        teaching_point: safeString(parsed?.teaching_point) || fallback.teaching_point,
        direct_answer_en: normalizeCollapsedEnglish(safeString(parsed?.direct_answer_en) || fallback.direct_answer_en),
        error_tags: normalizeErrorTags(parsed?.error_tags, fallback.error_tags),
        micro_drill: normalizeMicroDrill(parsed?.micro_drill, fallback.micro_drill),
        quality_flags: [],
        drill_feedback_cn: normalizeCollapsedEnglish(safeString(parsed?.drill_feedback_cn) || fallback.drill_feedback_cn || ""),
        revised_sentence_en: normalizeCollapsedEnglish(safeString(parsed?.revised_sentence_en) || fallback.revised_sentence_en || ""),
        next_micro_drill: normalizeMicroDrill(parsed?.next_micro_drill, fallback.micro_drill),
    };

    payload.coach_cn = autoMarkCoachText(payload.coach_cn, payload.pattern_en);

    if (ctx.allowRevealAnswer) {
        payload.full_answer =
            normalizeCollapsedEnglish(safeString(parsed?.full_answer)) ||
            ctx.improvedVersion ||
            ctx.referenceEnglish;
        payload.answer_reason_cn =
            normalizeCollapsedEnglish(safeString(parsed?.answer_reason_cn)) ||
            "先保证主干自然，再把时间/语气信息放在英语更常见的位置，这样更地道也更稳定。";
    }

    if (!payload.drill_feedback_cn) delete payload.drill_feedback_cn;
    if (!payload.revised_sentence_en) delete payload.revised_sentence_en;
    if (!payload.next_micro_drill?.prompt_cn) delete payload.next_micro_drill;

    return payload;
}

function collectQualityFlags(payload: TutorResponsePayload, ctx: PayloadBuildContext): string[] {
    const flags: string[] = [];
    const requiresDirect = requiresDirectAnswer(ctx.question);
    const combinedText = `${payload.coach_cn}\n${payload.contrast}\n${payload.next_task}\n${payload.direct_answer_en}`;
    const anchors = gatherAnchors(ctx.chineseSource, ctx.userAttempt);

    if (requiresDirect && !payload.direct_answer_en) flags.push("missing_direct_answer");
    if (!hasContextAnchor(combinedText, anchors)) flags.push("missing_context_anchor");
    if (hasCollapsedEnglish(combinedText)) flags.push("collapsed_english");
    if (!payload.micro_drill.prompt_cn || !payload.micro_drill.expected_pattern_en) flags.push("missing_micro_drill");
    if (ctx.action === "drill_check" && !payload.drill_feedback_cn) flags.push("missing_drill_feedback");
    if (ctx.action === "drill_check" && !payload.revised_sentence_en) flags.push("missing_revised_sentence");

    return Array.from(new Set(flags));
}

function applyQualityGuards(payload: TutorResponsePayload, ctx: PayloadBuildContext): { payload: TutorResponsePayload; shouldRetry: boolean } {
    const patched: TutorResponsePayload = {
        ...payload,
        coach_cn: normalizeCollapsedEnglish(payload.coach_cn),
        contrast: normalizeCollapsedEnglish(payload.contrast),
        next_task: normalizeCollapsedEnglish(payload.next_task),
        direct_answer_en: normalizeCollapsedEnglish(payload.direct_answer_en),
        micro_drill: {
            prompt_cn: payload.micro_drill.prompt_cn,
            expected_pattern_en: normalizeCollapsedEnglish(payload.micro_drill.expected_pattern_en),
        },
        drill_feedback_cn: normalizeCollapsedEnglish(payload.drill_feedback_cn || ""),
        revised_sentence_en: normalizeCollapsedEnglish(payload.revised_sentence_en || ""),
        next_micro_drill: payload.next_micro_drill
            ? {
                prompt_cn: payload.next_micro_drill.prompt_cn,
                expected_pattern_en: normalizeCollapsedEnglish(payload.next_micro_drill.expected_pattern_en),
            }
            : undefined,
    };

    const preFlags = collectQualityFlags(patched, ctx);
    const needsDirect = preFlags.includes("missing_direct_answer");
    const needsAnchor = preFlags.includes("missing_context_anchor");

    if (needsDirect) {
        patched.direct_answer_en = inferDirectAnswerEn(ctx.question, ctx.improvedVersion, ctx.referenceEnglish);
        patched.coach_cn = `先给你可直接用的说法：\`${patched.direct_answer_en}\`。\n${patched.coach_cn}`;
    }

    if (needsAnchor) {
        const anchor = safeString(ctx.chineseSource).split(/[，。！？；]/).find((item) => safeString(item)) || ctx.chineseSource;
        patched.coach_cn = `${patched.coach_cn}\n\n结合你这题的“${anchor.slice(0, 14)}”，先保证主干自然，再微调词汇。`;
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
        flag === "missing_direct_answer" ||
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
    hintLevel: number;
    questionType: TutorQuestionType;
    allowRevealAnswer: boolean;
    conversationText: string;
    action: TutorAction;
    drillInput: string;
    uiSurface: TutorUiSurface;
    intent: TutorIntent;
    focusSpan: string;
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
        hintLevel,
        questionType,
        allowRevealAnswer,
        conversationText,
        action,
        drillInput,
        uiSurface,
        intent,
        focusSpan,
        repairMode,
    } = params;

    const baseContext = `
You are an IELTS translation tutor for Chinese native speakers.
Teaching style must be: progressive guidance + Chinese explanation + gentle correction.

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
- Hint level: ${hintLevel}
- Question type: "${questionType}"
- Action: "${action}"
- Allow full answer now: ${allowRevealAnswer ? "YES" : "NO"}
- Recent turns:
${conversationText}
- User question: "${question}"
- User micro drill input: "${drillInput || "N/A"}"
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
1) If Allow full answer now is NO, set answer_revealed to false and DO NOT provide full_answer.
2) If Allow full answer now is YES, you may provide full_answer + answer_reason_cn.
3) pattern_en must contain 1-2 short reusable patterns.
4) Keep concise and practical for immediate reuse.
5) In coach_cn, automatically mark 2-3 key learning points using markdown bold: **key point**.
6) Markdown is fully allowed in coach_cn/contrast/next_task: headings, blockquotes, lists, inline code, code fences, tables.
7) Use 0-2 relevant emojis when helpful (e.g., ✨🧠📌), avoid overuse.
8) Answer the user's current question directly in the FIRST sentence; avoid generic opening.
9) Must anchor explanation to this exact drill: reference at least one phrase from Chinese sentence or user attempt.
10) If Recent turns is not N/A, connect to prior turn briefly so the user feels continuity.
11) If user asks "怎么翻译/英文怎么说", first sentence MUST give one direct translation in backticks, then explain.
12) English phrases must use normal spaces. Never output collapsed tokens like "asksomeoneabout" or "gathercouragetodosomething".
13) Always include micro_drill with prompt_cn + expected_pattern_en.
14) error_tags 只用: word_choice, word_order, grammar, register, collocation, tense。
${repairMode ? '15) REPAIR MODE: 这次回复必须补齐之前缺失字段，并强制贴合当前题目上下文。' : ""}
    `;
}

async function runNonStreamModel(prompt: string): Promise<string> {
    const completion = await deepseek.chat.completions.create({
        messages: [
            { role: "system", content: "You are a structured IELTS tutor. Output strict JSON only." },
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
            hintLevel,
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
        const normalizedHintLevel = clampHintLevel(hintLevel);
        const normalizedQuestionType: TutorQuestionType = (
            safeString(questionType) || "follow_up"
        ) as TutorQuestionType;
        const normalizedAction = normalizeAction(action);
        const normalizedSurface = normalizeUiSurface(uiSurface);
        const normalizedIntent = normalizeIntent(intent);
        const normalizedFocusSpan = safeString(focusSpan);
        const normalizedDrillInput = safeString(drillInput);
        const turns = normalizeTurns(recentTurns ?? conversation);
        const allowRevealAnswer =
            normalizedQuestionType === "unlock_answer" ||
            revealAnswer === true ||
            normalizedHintLevel >= 3;
        const isStreaming = stream === true && normalizedAction === "ask";

        const chineseSource = safeString(drillContext.chinese);
        const referenceEnglish = safeString(drillContext.reference_english);
        const conversationText = turns.length > 0
            ? turns
                .slice(-4)
                .map((item, idx) => `Q${idx + 1}: ${item.question || ""}\nA${idx + 1}: ${item.answer || ""}`)
                .join("\n")
            : "N/A";

        const payloadContext: PayloadBuildContext = {
            question: normalizedQuestion,
            questionType: normalizedQuestionType,
            action: normalizedAction,
            teachingPoint: normalizedTeachingPoint,
            improvedVersion: normalizedImprovedVersion,
            referenceEnglish,
            allowRevealAnswer,
            chineseSource,
            userAttempt: normalizedAttempt,
            drillInput: normalizedDrillInput,
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
            hintLevel: normalizedHintLevel,
            questionType: normalizedQuestionType,
            allowRevealAnswer,
            conversationText,
            action: normalizedAction,
            drillInput: normalizedDrillInput,
            uiSurface: normalizedSurface,
            intent: normalizedIntent,
            focusSpan: normalizedFocusSpan,
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
                { role: "system", content: "You are a structured IELTS tutor. Output strict JSON only." },
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
                        const partialCoach = extractCoachCnPartial(fullContent);
                        if (partialCoach && partialCoach !== lastPartialCoach) {
                            lastPartialCoach = partialCoach;
                            controller.enqueue(encoder.encode(sseChunk("chunk", { coach_cn: partialCoach })));
                        }
                    }

                    let result = buildValidatedPayload(fullContent);
                    if (!result.parsed && lastPartialCoach) {
                        result.payload.coach_cn = autoMarkCoachText(normalizeCollapsedEnglish(lastPartialCoach), result.payload.pattern_en);
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
