export type GuidedModeStatus = "idle" | "loading" | "active" | "complete";
export type GuidedRevealMode = "auto_demo_after_3" | "manual_demo_after_3";
export type GuidedSlotKind = "word" | "phrase";

export interface GuidedChoiceOption {
    text: string;
    isCorrect: boolean;
    why_cn: string;
}

export interface GuidedSummaryAlert {
    wrong: string;
    correct: string;
    explanation: string;
}

export interface GuidedSummary {
    final_sentence: string;
    chinese_meaning: string;
    structure_hint: string;
    chinglish_alerts: GuidedSummaryAlert[];
    memory_anchor: string;
}

export interface GuidedHintLadder {
    level_0: string;
    level_1: string;
    level_2: string;
    level_3?: string;
}

export interface GuidedTemplateSlot {
    id: string;
    slot_index: number;
    slot_kind: GuidedSlotKind;
    answer_text: string;
    display_placeholder: string;
    hint_ladder: GuidedHintLadder;
    hint_focus_cn?: string;
    teacher_goal_cn: string;
    teacher_prompt_cn: string;
    micro_rule_cn: string;
    wrong_feedback_cn: string[];
    stronger_hint_cn: string;
    teacher_demo_en: string;
    multiple_choice?: GuidedChoiceOption[];
    rescue_reason_cn?: string;
    idle_rescue_hint_cn?: string;
    reveal_mode: GuidedRevealMode;
}

export interface GuidedTemplateToken {
    type: "text" | "slot";
    value: string;
    slotId?: string;
    slotIndex?: number;
    status?: "filled" | "current" | "locked";
    inputWidthCh?: number;
}

export interface GuidedScript {
    lesson_intro: string;
    sentence_template: string;
    slots: GuidedTemplateSlot[];
    summary: GuidedSummary;
}

export interface GuidedSessionState {
    status: GuidedModeStatus;
    currentStepIndex: number;
    currentAttemptCount: number;
    guidedChoicesVisible: boolean;
    revealReady: boolean;
    filledFragments: Record<string, string>;
    lastFeedback: string | null;
}

export interface GuidedClozeState {
    currentBlankIndex: number;
    currentAttemptCount: number;
    blankSlotIds: string[];
    revealReady: boolean;
    filledFragments: Record<string, string>;
    lastFeedback: string | null;
    refreshToken: number;
}

export interface GuidedClozeHint {
    primary: string;
    secondary: string | null;
    rescue: string | null;
}

export interface GuidedHintLines {
    primary: string;
    secondary: string | null;
    rescue: string | null;
}

export interface GuidedAiHint {
    primary: string;
    secondary: string | null;
    rescue: string | null;
}

interface SentencePiece {
    prefix: string;
    word: string;
    suffix: string;
}

interface SentenceUnit {
    prefix: string;
    answerText: string;
    suffix: string;
    slotKind: GuidedSlotKind;
    words: string[];
}

interface FallbackSlotDescriptor {
    answerText: string;
    slotKind: GuidedSlotKind;
    displayPlaceholder: string;
    hintLadder: GuidedHintLadder;
    hintFocus?: string;
    teacherGoal: string;
    teacherPrompt: string;
    microRule: string;
    wrongFeedback: string[];
    strongerHint: string;
    successFeedback: string;
    multipleChoice?: GuidedChoiceOption[];
    rescueReason?: string;
    idleRescueHint?: string;
}

const REVEAL_MODE: GuidedRevealMode = "manual_demo_after_3";
const TEMPLATE_SLOT_PATTERN = /\{\{slot_(\d+)\}\}/g;

const ARTICLES = new Set(["a", "an", "the"]);
const PREPOSITIONS = new Set(["to", "at", "in", "on", "for", "from", "with", "by", "of", "into", "over", "under", "after", "before"]);
const PRONOUNS = new Set(["i", "you", "he", "she", "it", "we", "they"]);
const TIME_WORDS = new Set(["yesterday", "today", "tonight", "tomorrow", "now", "last", "next", "this"]);
const IDLE_RESCUE_THRESHOLD_MS = 12000;
const COMMON_VERBS = new Set([
    "am", "is", "are", "was", "were", "be", "been", "being",
    "go", "goes", "went", "gone", "do", "does", "did", "done",
    "have", "has", "had", "make", "made", "missed", "found", "noticed",
    "discovered", "announced", "announcing", "disconnect", "disconnected",
]);
const PHRASE_PATTERNS = [
    ["looked", "for"],
    ["look", "for"],
    ["looking", "for"],
    ["find", "out"],
    ["found", "out"],
    ["according", "to"],
    ["due", "to"],
    ["such", "as"],
    ["instead", "of"],
    ["at", "least"],
    ["at", "first"],
    ["a", "lot", "of"],
    ["in", "front", "of"],
] as const;
const DEFAULT_CLOZE_KEEP_RATIO = 0.5;

function normalizeGuidedAnswer(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");
}

function normalizeSentenceForDraft(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

function parseSentencePieces(referenceEnglish: string) {
    const rawTokens = normalizeSentenceForDraft(referenceEnglish).split(" ").filter(Boolean);
    return rawTokens.reduce<SentencePiece[]>((pieces, rawToken) => {
        const prefixMatch = rawToken.match(/^([("'“‘]+)/u);
        const prefix = prefixMatch?.[0] ?? "";
        const tokenWithoutPrefix = prefix ? rawToken.slice(prefix.length) : rawToken;
        const suffixMatch = tokenWithoutPrefix.match(/([,.;:!?)"”’]+)$/u);
        const suffix = suffixMatch?.[0] ?? "";
        const word = suffix ? tokenWithoutPrefix.slice(0, -suffix.length) : tokenWithoutPrefix;

        if (word) {
            pieces.push({ prefix, word, suffix });
        }

        return pieces;
    }, []);
}

function buildDisplayPlaceholder(answerText: string) {
    return answerText
        .split("")
        .map((character) => (character === " " ? " " : "_"))
        .join("")
        .padEnd(2, "_");
}

function leaksAnswer(text: string, answerText: string) {
    const normalizedText = normalizeGuidedAnswer(text);
    const normalizedAnswer = normalizeGuidedAnswer(answerText);
    return Boolean(normalizedText && normalizedAnswer && normalizedText.includes(normalizedAnswer));
}

function buildSentenceUnits(pieces: SentencePiece[]): SentenceUnit[] {
    const units: SentenceUnit[] = [];

    for (let index = 0; index < pieces.length; index += 1) {
        let matchedPattern: readonly string[] | null = null;

        for (const pattern of PHRASE_PATTERNS) {
            const candidateWords = pieces
                .slice(index, index + pattern.length)
                .map((piece) => normalizeGuidedAnswer(piece.word));

            if (
                candidateWords.length === pattern.length
                && pattern.every((word, patternIndex) => candidateWords[patternIndex] === normalizeGuidedAnswer(word))
            ) {
                matchedPattern = pattern;
                break;
            }
        }

        if (matchedPattern) {
            const groupedPieces = pieces.slice(index, index + matchedPattern.length);
            units.push({
                prefix: groupedPieces[0]?.prefix ?? "",
                answerText: groupedPieces.map((piece) => piece.word).join(" "),
                suffix: groupedPieces[groupedPieces.length - 1]?.suffix ?? "",
                slotKind: "phrase",
                words: groupedPieces.map((piece) => piece.word),
            });
            index += matchedPattern.length - 1;
            continue;
        }

        units.push({
            prefix: pieces[index]?.prefix ?? "",
            answerText: pieces[index]?.word ?? "",
            suffix: pieces[index]?.suffix ?? "",
            slotKind: "word",
            words: [pieces[index]?.word ?? ""],
        });
    }

    return units.filter((unit) => unit.answerText.trim().length > 0);
}

function pickUniqueChoices(answerText: string, candidates: string[]) {
    const normalizedAnswer = normalizeGuidedAnswer(answerText);
    const seen = new Set<string>([normalizedAnswer]);
    const distractors = candidates.filter((candidate) => {
        const normalized = normalizeGuidedAnswer(candidate);
        if (!normalized || seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    }).slice(0, 3);

    if (distractors.length < 2) {
        return undefined;
    }

    return [
        { text: answerText, isCorrect: true, why_cn: "这就是当前空格需要补上的表达。" },
        ...distractors.map((candidate) => ({
            text: candidate,
            isCorrect: false,
            why_cn: `这个选项和当前中文或结构对不上。`,
        })),
    ];
}

function buildRescueChoices(answerText: string, slotKind: GuidedSlotKind) {
    const normalized = normalizeGuidedAnswer(answerText);
    const words = answerText.trim().split(/\s+/);

    if (slotKind === "phrase") {
        const phraseChoices = pickUniqueChoices(answerText, [
            words.slice(0, -1).join(" "),
            `${words[0]} to`,
            words.slice().reverse().join(" "),
        ]);

        return phraseChoices?.map((choice) => ({
            ...choice,
            why_cn: choice.isCorrect
                ? "这一整块要作为固定表达一起补上。"
                : "这个短语和当前中文意思或搭配不对。",
        }));
    }

    if (ARTICLES.has(normalized)) {
        return [
            { text: answerText, isCorrect: true, why_cn: "这里要补名词前的限定词。" },
            { text: "a", isCorrect: normalized === "a", why_cn: "a 只用于泛指单数名词。" },
            { text: "an", isCorrect: normalized === "an", why_cn: "an 只接元音开头发音的单数名词。" },
            { text: "the", isCorrect: normalized === "the", why_cn: "the 用于特指。"},
        ].filter((choice, index, array) => array.findIndex((item) => item.text === choice.text) === index);
    }

    if (PREPOSITIONS.has(normalized)) {
        return [
            { text: answerText, isCorrect: true, why_cn: "这个介词才能把前后结构接顺。" },
            { text: "in", isCorrect: normalized === "in", why_cn: "in 更偏位置或范围，不一定是这里的关系。" },
            { text: "on", isCorrect: normalized === "on", why_cn: "on 更偏接触或媒介，不一定合适。" },
            { text: "to", isCorrect: normalized === "to", why_cn: "to 常表示方向或连接去向。" },
        ].filter((choice, index, array) => array.findIndex((item) => item.text === choice.text) === index);
    }

    if (normalized === "went") {
        return [
            { text: "went", isCorrect: true, why_cn: "这里要用 go 的过去式。" },
            { text: "go", isCorrect: false, why_cn: "go 是原形，时间线不对。" },
            { text: "gone", isCorrect: false, why_cn: "gone 常和 have/has/had 连用。" },
        ];
    }

    if (normalized === "won't") {
        return [
            { text: "won't", isCorrect: true, why_cn: "这里要用 will not 的缩写。" },
            { text: "wouldn't", isCorrect: false, why_cn: "wouldn't 是 would not，不是这里的时态。" },
            { text: "cant", isCorrect: false, why_cn: "cant 既不是规范缩写，也不是这里的意思。" },
        ];
    }

    if (answerText.length >= 7 || /['’-]/u.test(answerText)) {
        const genericChoices = pickUniqueChoices(answerText, [
            answerText.slice(0, -1),
            `${answerText.slice(0, 1)}${"o".repeat(Math.max(answerText.length - 2, 1))}${answerText.slice(-1)}`,
            `${answerText.slice(0, Math.max(answerText.length - 2, 1))}ed`,
        ]);

        return genericChoices?.map((choice) => ({
            ...choice,
            why_cn: choice.isCorrect
                ? "这个拼写和当前中文意思都对上了。"
                : "这个词形或拼写和当前空格不匹配。",
        }));
    }

    return undefined;
}

function describeWordRole(unit: SentenceUnit, index: number, units: SentenceUnit[]) {
    const normalized = normalizeGuidedAnswer(unit.answerText);
    const previousWords = units.slice(Math.max(0, index - 2), index).map((piece) => piece.answerText).join(" ");
    const previousWord = units[index - 1]?.answerText ?? "";
    const nextWord = units[index + 1]?.answerText ?? "";
    const previousHint = previousWords ? `前面已经有 ${previousWords} 了，` : "";
    const nextHint = nextWord ? `后面会接 ${nextWord}，` : "";

    if (unit.slotKind === "phrase") {
        const level0 = `先别拆开背。这里对应中文里同一整块意思，要整块一起写出来。${previousHint}${nextHint}`;
        const level1 = "先把这一整块当成一个意思来看，不要拆成一个个词。";
        const level2 = `回到中文里想想，这里缺的不是单词，而是一整块说法；它从 ${unit.words[0]?.charAt(0).toUpperCase()} 开头。`;
        return {
            hintLadder: {
                level_0: level0,
                level_1: level1,
                level_2: level2,
                level_3: "如果还是卡住，就先看选项，把不可能的搭配排掉。",
            },
            goal: "补这一整块表达",
            prompt: level0,
            rule: "把这一块整体记住更稳，拆碎了反而容易只会单词不会搭配。",
            wrong: [level1, level2],
            strong: `如果还是卡住，就先想第一个词；这一整块是从 ${unit.words[0]?.charAt(0).toUpperCase()} 开头的。`,
            successFeedback: "对，这一整块表达一起补上会更顺。",
            rescueReason: "这一格是整块表达，先用选项排除更稳。",
            idleRescueHint: "如果整块表达一时想不出来，先点“给我选项”。",
        };
    }

    if (index === 0 && PRONOUNS.has(normalized)) {
        const level0 = "先看中文里是谁在做这件事。别急着想整句，先把句首那个主语放上去。";
        const level1 = "先别想动作，这里只写做这件事的人。";
        const level2 = `想想中文里的主语，这一格首字母是 ${unit.answerText.charAt(0).toUpperCase()}。`;
        return {
            hintLadder: {
                level_0: level0,
                level_1: level1,
                level_2: level2,
                level_3: "如果还拿不准，就先用选项排掉宾格和所有格。",
            },
            hintFocus: "主语",
            goal: "先填主语",
            prompt: level0,
            rule: "主语先立住，后面的动作、地点和时间才知道是围着谁展开。",
            wrong: ["先写做这件事的人。", level2],
            strong: "如果还拿不准，就回到中文里的“谁”；这里只要那个主语形式。",
            successFeedback: "对，先把句首的主语立住了。",
            rescueReason: "如果主语形式一时想不起来，可以先用选项排除格位不对的词。",
            idleRescueHint: "卡住了就先点“给我选项”，先把主语位置判断出来。",
        };
    }

    if (index === 1 || COMMON_VERBS.has(normalized) || /ed$/i.test(unit.answerText)) {
        const level0 = `先别想地点和时间，这里只盯中文里“发生了什么/做了什么”那个动作。${previousHint}`;
        const level1 = "I 后面现在先缺动作本身，先把过去发生的那个动作立住。";
        const level2 = `如果你已经想到原形了，再往前走一步：这里要用变过的那个形式，首字母是 ${unit.answerText.charAt(0).toUpperCase()}。`;
        return {
            hintLadder: {
                level_0: level0,
                level_1: level1,
                level_2: level2,
                level_3: "如果还卡住，就先看选项，把原形和别的词形排掉。",
            },
            hintFocus: "动作",
            goal: "现在填动作",
            prompt: level0,
            rule: "先把动作立住，句子的骨架就出来了，后面的地点和对象再往上接。",
            wrong: ["这里只写动作，不要把后面的地点一起带进来。", level2],
            strong: "如果你已经想到动词原形了，再往前推一步：这里要的不是原形，而是变过的那个形式。",
            successFeedback: "对，动作词放对了，句子开始顺起来了。",
            rescueReason: "动作词容易卡在时态上，先用选项判断形式也可以。",
            idleRescueHint: "如果动作形式想不出来，就先点“给我选项”。",
        };
    }

    if (ARTICLES.has(normalized)) {
        const level0 = `${nextHint}先别写后面的名词，这一格只把名词前面那层小限定词补齐。`;
        const level1 = "先处理这个小词，名词本身后面自然会跟上，不用抢着一起写。";
        const level2 = "如果你在 a / an / the 之间犹豫，就先看这里是不是在说特定的那个东西。";
        return {
            hintLadder: {
                level_0: level0,
                level_1: level1,
                level_2: level2,
                level_3: "还是拿不准就先看选项，把不合适的冠词排掉。",
            },
            hintFocus: "限定词",
            goal: "补冠词",
            prompt: level0,
            rule: "这里先补小词，名词本身后面自然会接上，不用抢着一起写。",
            wrong: ["这里只补名词前面的那个小限定词。", "别急着写名词本身，先把前面那层冠词补上。"],
            strong: level2,
            successFeedback: "对，名词前面的限定词补齐了。",
            rescueReason: "冠词很短，但容易在 a/an/the 之间犹豫。",
            idleRescueHint: "如果在冠词之间犹豫，就先看选项排除。",
        };
    }

    if (PREPOSITIONS.has(normalized)) {
        const level0 = `${previousHint}${nextHint}这里缺的是那个很短的连接词，它负责把前面的动作顺顺地带到后面。`;
        const level1 = "先别急着写地点本身，这里先补那个把前后结构接起来的小词。";
        const level2 = "如果还拿不准，就先判断它是在表示方向、位置，还是对象关系。";
        return {
            hintLadder: {
                level_0: level0,
                level_1: level1,
                level_2: level2,
                level_3: "还是卡住就先看选项，用搭配把不对的介词排掉。",
            },
            hintFocus: "连接词",
            goal: "补介词",
            prompt: level0,
            rule: "介词本身意思不重，但它决定前后能不能自然地接起来。",
            wrong: [level1, "想想你平时说“去某地 / 在某处 / 对某人”时靠哪个介词接起来。"],
            strong: level2,
            successFeedback: "对，这个连接词把前后结构接上了。",
            rescueReason: "介词靠搭配判断更稳，用选项排除很有效。",
            idleRescueHint: "介词拿不准时，先点“给我选项”看搭配。",
        };
    }

    if (TIME_WORDS.has(normalized)) {
        const level0 = "现在句子骨架差不多了，最后把中文里的时间线索收进句尾。";
        const level1 = "这里只补时间，不用回头改前面的主干。";
        const level2 = `回到中文里找那个时间词，这一格首字母是 ${unit.answerText.charAt(0).toUpperCase()}。`;
        return {
            hintLadder: {
                level_0: level0,
                level_1: level1,
                level_2: level2,
                level_3: "如果还是想不起来，就先看选项回忆那个时间词。",
            },
            hintFocus: "时间",
            goal: "最后补时间",
            prompt: level0,
            rule: "时间放在句尾会更自然，先把前面的主干说顺，再收时间。",
            wrong: [level1, level2],
            strong: "如果还没想起来，就回到中文里那个表示时间的词；这格就是把它原样换成英文。",
            successFeedback: "对，时间词落在句尾了，整句完成度更高了。",
            rescueReason: "时间词如果想不起来，可以先用选项回忆。",
            idleRescueHint: "时间词一时卡住，就先点“给我选项”。",
        };
    }

    const likelyNoun = ARTICLES.has(normalizeGuidedAnswer(previousWord)) || PREPOSITIONS.has(normalizeGuidedAnswer(previousWord));
    const focusType = likelyNoun ? "那个名词/内容" : "夹在这里的那块意思";
    const level0 = `${previousHint}${nextHint}这里不要整句硬翻，先补中文里${focusType}。`;
    const level1 = likelyNoun
        ? `${previousHint}这一格更像在补一个内容词，不是重写前后的连接词。`
        : `${previousHint}${nextHint}先利用前后已经露出来的内容，把中间这格顺出来。`;
    const level2 = likelyNoun
        ? `如果你已经知道中文说的是哪个东西了，就去想它的英文名词；首字母是 ${unit.answerText.charAt(0).toUpperCase()}。`
        : `回到中文里找夹在这里的那块意思，这一格首字母是 ${unit.answerText.charAt(0).toUpperCase()}。`;
    return {
        hintLadder: {
            level_0: level0,
            level_1: level1,
            level_2: level2,
            level_3: likelyNoun
                ? "如果还是卡住，就先看选项，把意思不对的名词排掉。"
                : "如果还是卡住，就先看选项，把位置不对的词排掉。",
        },
        goal: "补这个单词",
        prompt: level0,
        rule: "一次只拿下一小块，比整句硬翻更稳，也更容易记住位置。",
        wrong: [level1, level2],
        strong: likelyNoun
            ? "如果还是卡住，就先判断这里是不是在补一个具体名词。"
            : "如果还是卡住，就先判断这格是在补人、动作、连接词，还是地点时间。",
        successFeedback: "对，这个位置补上后，句子骨架又完整了一格。",
        rescueReason: "如果拼写一时卡住，可以先用选项排除错误词。",
        idleRescueHint: "卡住了就先点“给我选项”，别一直硬想。",
    };
}

function buildFallbackWordDescriptors(units: SentenceUnit[]) {
    return units.map<FallbackSlotDescriptor>((unit, index) => {
        const role = describeWordRole(unit, index, units);
        return {
            answerText: unit.answerText,
            slotKind: unit.slotKind,
            displayPlaceholder: buildDisplayPlaceholder(unit.answerText),
            hintLadder: role.hintLadder,
            hintFocus: role.hintFocus,
            teacherGoal: role.goal,
            teacherPrompt: role.prompt,
            microRule: role.rule,
            wrongFeedback: role.wrong,
            strongerHint: role.strong,
            successFeedback: role.successFeedback,
            multipleChoice: buildRescueChoices(unit.answerText, unit.slotKind),
            rescueReason: role.rescueReason,
            idleRescueHint: role.idleRescueHint,
        };
    });
}

function buildSentenceTemplate(units: SentenceUnit[]) {
    return units
        .map((unit, index) => `${unit.prefix}{{slot_${index + 1}}}${unit.suffix}`)
        .join(" ");
}

function extractTemplateSlotIndices(sentenceTemplate: string) {
    return Array.from(sentenceTemplate.matchAll(TEMPLATE_SLOT_PATTERN))
        .map((match) => Number.parseInt(match[1] ?? "", 10))
        .filter((value) => Number.isFinite(value));
}

function normalizeHintText(text: string) {
    return text.trim();
}

function isWeakHint(text: string) {
    const normalized = normalizeHintText(text);
    if (!normalized) return true;

    const genericPatterns = [
        /不要一下子想整句/u,
        /先补当前这一小块/u,
        /只处理当前这个空位/u,
        /不要把整句一起塞进来/u,
        /别只盯拼写/u,
        /^先看前后已经露出来的内容/u,
    ];

    return genericPatterns.some((pattern) => pattern.test(normalized));
}

function buildLegacyHintLadder(slot: {
    answer_text: string;
    teacher_prompt_cn?: string;
    wrong_feedback_cn?: string[];
    stronger_hint_cn?: string;
    rescue_reason_cn?: string;
    idle_rescue_hint_cn?: string;
}): GuidedHintLadder {
    const level0 = normalizeHintText(slot.teacher_prompt_cn || "先看当前这一小块中文，再补这个空位。");
    const level1 = normalizeHintText(slot.wrong_feedback_cn?.[0] || "先别想整句，只处理当前这个空位。");
    const level2 = normalizeHintText(slot.wrong_feedback_cn?.[1] || slot.stronger_hint_cn || `首字母是 ${slot.answer_text.charAt(0).toUpperCase()}。`);
    const level3 = normalizeHintText(slot.idle_rescue_hint_cn || slot.rescue_reason_cn || slot.stronger_hint_cn || "如果还是卡住，就先看选项。");

    return {
        level_0: level0,
        level_1: level1,
        level_2: level2,
        level_3: level3,
    };
}

function sanitizeHintLadder(
    raw: unknown,
    answerText: string,
    fallbackLadder: GuidedHintLadder,
) {
    if (!raw || typeof raw !== "object") {
        return fallbackLadder;
    }

    const value = raw as Record<string, unknown>;
    const level0 = typeof value.level_0 === "string" ? normalizeHintText(value.level_0) : "";
    const level1 = typeof value.level_1 === "string" ? normalizeHintText(value.level_1) : "";
    const level2 = typeof value.level_2 === "string" ? normalizeHintText(value.level_2) : "";
    const level3 = typeof value.level_3 === "string" ? normalizeHintText(value.level_3) : "";

    if (!level0 || !level1 || !level2) {
        return fallbackLadder;
    }

    if (
        leaksAnswer(level0, answerText)
        || leaksAnswer(level1, answerText)
        || isWeakHint(level0)
        || isWeakHint(level1)
    ) {
        return fallbackLadder;
    }

    return {
        level_0: level0,
        level_1: level1,
        level_2: level2,
        level_3: level3 || fallbackLadder.level_3,
    };
}

function sanitizeSummary(raw: unknown, fallback: GuidedSummary): GuidedSummary {
    const summary = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};

    return {
        final_sentence: typeof summary.final_sentence === "string" && summary.final_sentence.trim()
            ? summary.final_sentence.trim()
            : fallback.final_sentence,
        chinese_meaning: typeof summary.chinese_meaning === "string" && summary.chinese_meaning.trim()
            ? summary.chinese_meaning.trim()
            : fallback.chinese_meaning,
        structure_hint: typeof summary.structure_hint === "string" && summary.structure_hint.trim()
            ? summary.structure_hint.trim()
            : fallback.structure_hint,
        chinglish_alerts: Array.isArray(summary.chinglish_alerts) && summary.chinglish_alerts.length > 0
            ? summary.chinglish_alerts
                .map((alert) => {
                    if (!alert || typeof alert !== "object") return null;
                    const value = alert as Record<string, unknown>;
                    const wrong = typeof value.wrong === "string" ? value.wrong.trim() : "";
                    const correct = typeof value.correct === "string" ? value.correct.trim() : "";
                    const explanation = typeof value.explanation === "string" ? value.explanation.trim() : "";
                    return wrong && correct && explanation ? { wrong, correct, explanation } : null;
                })
                .filter((alert): alert is GuidedSummaryAlert => alert !== null)
            : fallback.chinglish_alerts,
        memory_anchor: typeof summary.memory_anchor === "string" && summary.memory_anchor.trim()
            ? summary.memory_anchor.trim()
            : fallback.memory_anchor,
    };
}

function isValidSlotAnswer(value: string) {
    return value.trim().length > 0;
}

export function buildFallbackGuidedScript({
    chinese,
    referenceEnglish,
}: {
    chinese: string;
    referenceEnglish: string;
}): GuidedScript {
    const normalizedReference = normalizeSentenceForDraft(referenceEnglish);
    const pieces = parseSentencePieces(referenceEnglish);
    const units = buildSentenceUnits(pieces);
    const descriptors = buildFallbackWordDescriptors(units);

    return {
        lesson_intro: "先看中文原句，再一格一格把英文空位补进去；必要时整块表达一起记。",
        sentence_template: buildSentenceTemplate(units),
        slots: descriptors.map((descriptor, index) => ({
            id: `slot-${index + 1}`,
            slot_index: index + 1,
            slot_kind: descriptor.slotKind,
            answer_text: descriptor.answerText,
            display_placeholder: descriptor.displayPlaceholder,
            hint_ladder: descriptor.hintLadder,
            hint_focus_cn: descriptor.hintFocus,
            teacher_goal_cn: descriptor.teacherGoal,
            teacher_prompt_cn: descriptor.teacherPrompt,
            micro_rule_cn: descriptor.microRule,
            wrong_feedback_cn: descriptor.wrongFeedback,
            stronger_hint_cn: descriptor.strongerHint,
            teacher_demo_en: descriptor.answerText,
            multiple_choice: descriptor.multipleChoice,
            rescue_reason_cn: descriptor.rescueReason,
            idle_rescue_hint_cn: descriptor.idleRescueHint,
            reveal_mode: REVEAL_MODE,
        })),
        summary: {
            final_sentence: normalizedReference,
            chinese_meaning: chinese.trim(),
            structure_hint: `按空位顺序搭句：${units.map((unit) => unit.answerText).join(" / ")}`,
            chinglish_alerts: [
                {
                    wrong: "一上来整句硬翻，顺手把词序也翻乱。",
                    correct: normalizedReference,
                    explanation: "先盯当前单词，把顺序按英文原句一格一格搭起来，会更稳。",
                },
            ],
            memory_anchor: "先看中文，再一词一格往前走。",
        },
    };
}

export function normalizeGuidedScript(raw: unknown, fallback?: GuidedScript | null): GuidedScript | null {
    if (!raw || typeof raw !== "object") {
        return fallback ?? null;
    }

    const payload = raw as Record<string, unknown>;
    const rawSlots = Array.isArray(payload.slots) ? payload.slots : [];
    const normalizedSlots = rawSlots.reduce<GuidedTemplateSlot[]>((slots, item, index) => {
        if (!item || typeof item !== "object") return slots;
        const slot = item as Record<string, unknown>;
        const answerText = typeof slot.answer_text === "string" ? slot.answer_text.trim() : "";
        if (!isValidSlotAnswer(answerText)) return slots;

        const wrongFeedback = Array.isArray(slot.wrong_feedback_cn)
            ? slot.wrong_feedback_cn.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            : [];

        const teacherPrompt = typeof slot.teacher_prompt_cn === "string" && slot.teacher_prompt_cn.trim()
            ? slot.teacher_prompt_cn.trim()
            : "";
        if (teacherPrompt && leaksAnswer(teacherPrompt, answerText)) {
            return slots;
        }

        const slotKind: GuidedSlotKind = slot.slot_kind === "phrase" || /\s/.test(answerText) ? "phrase" : "word";
        const hintLadder = sanitizeHintLadder(slot.hint_ladder, answerText, {
            level_0: "",
            level_1: "",
            level_2: "",
            level_3: "",
        });
        const multipleChoice = Array.isArray(slot.multiple_choice)
            ? slot.multiple_choice
                .map((choice) => {
                    if (!choice || typeof choice !== "object") return null;
                    const value = choice as Record<string, unknown>;
                    const text = typeof value.text === "string" ? value.text.trim() : "";
                    const why = typeof value.why_cn === "string" ? value.why_cn.trim() : "";
                    if (!text || !why) return null;
                    return {
                        text,
                        isCorrect: Boolean(value.isCorrect),
                        why_cn: why,
                    };
                })
                .filter((choice): choice is GuidedChoiceOption => choice !== null)
            : undefined;

        slots.push({
            id: typeof slot.id === "string" && slot.id.trim() ? slot.id.trim() : `slot-${index + 1}`,
            slot_index: typeof slot.slot_index === "number" && Number.isFinite(slot.slot_index)
                ? slot.slot_index
                : index + 1,
            slot_kind: slotKind,
            answer_text: answerText,
            display_placeholder: typeof slot.display_placeholder === "string" && slot.display_placeholder.trim()
                ? slot.display_placeholder.trim()
                : buildDisplayPlaceholder(answerText),
            hint_ladder: hintLadder,
            hint_focus_cn: typeof slot.hint_focus_cn === "string" && slot.hint_focus_cn.trim()
                ? slot.hint_focus_cn.trim()
                : undefined,
            teacher_goal_cn: typeof slot.teacher_goal_cn === "string" && slot.teacher_goal_cn.trim()
                ? slot.teacher_goal_cn.trim()
                : `填第 ${index + 1} 个单词`,
            teacher_prompt_cn: teacherPrompt,
            micro_rule_cn: typeof slot.micro_rule_cn === "string" && slot.micro_rule_cn.trim()
                ? slot.micro_rule_cn.trim()
                : "",
            wrong_feedback_cn: wrongFeedback.length > 0 ? wrongFeedback.slice(0, 2) : [],
            stronger_hint_cn: typeof slot.stronger_hint_cn === "string" && slot.stronger_hint_cn.trim()
                ? slot.stronger_hint_cn.trim()
                : "",
            teacher_demo_en: typeof slot.teacher_demo_en === "string" && slot.teacher_demo_en.trim()
                ? slot.teacher_demo_en.trim()
                : answerText,
            multiple_choice: multipleChoice && multipleChoice.some((choice) => choice.isCorrect)
                ? multipleChoice
                : undefined,
            rescue_reason_cn: typeof slot.rescue_reason_cn === "string" && slot.rescue_reason_cn.trim()
                ? slot.rescue_reason_cn.trim()
                : undefined,
            idle_rescue_hint_cn: typeof slot.idle_rescue_hint_cn === "string" && slot.idle_rescue_hint_cn.trim()
                ? slot.idle_rescue_hint_cn.trim()
                : undefined,
            reveal_mode: slot.reveal_mode === "auto_demo_after_3" || slot.reveal_mode === "manual_demo_after_3"
                ? "manual_demo_after_3"
                : REVEAL_MODE,
        });

        return slots;
    }, []).sort((left, right) => left.slot_index - right.slot_index);

    const sentenceTemplate = typeof payload.sentence_template === "string" ? payload.sentence_template.trim() : "";
    const templateSlotIndices = extractTemplateSlotIndices(sentenceTemplate);
    const orderedIndices = normalizedSlots.map((slot) => slot.slot_index);
    const validTemplate = sentenceTemplate.length > 0
        && normalizedSlots.length >= 2
        && templateSlotIndices.length === normalizedSlots.length
        && templateSlotIndices.every((value, index) => value === orderedIndices[index]);

    if (!validTemplate || normalizedSlots.length !== rawSlots.length) {
        return fallback ?? null;
    }

    return {
        lesson_intro: typeof payload.lesson_intro === "string" && payload.lesson_intro.trim()
            ? payload.lesson_intro.trim()
            : fallback?.lesson_intro ?? "",
        sentence_template: sentenceTemplate,
        slots: normalizedSlots,
        summary: sanitizeSummary(payload.summary, fallback?.summary ?? {
            final_sentence: "",
            chinese_meaning: "",
            structure_hint: "",
            chinglish_alerts: [],
            memory_anchor: "",
        }),
    };
}

export function createGuidedSessionState(script: GuidedScript): GuidedSessionState {
    return {
        status: script.slots.length > 0 ? "active" : "idle",
        currentStepIndex: 0,
        currentAttemptCount: 0,
        guidedChoicesVisible: false,
        revealReady: false,
        filledFragments: {},
        lastFeedback: null,
    };
}

function getCompletionAwareStatus(script: GuidedScript, nextIndex: number): GuidedModeStatus {
    return nextIndex >= script.slots.length ? "complete" : "active";
}

function isCurrentSlotAnswer(slot: GuidedTemplateSlot | undefined, input: string) {
    if (!slot) return false;
    return normalizeGuidedAnswer(input) === normalizeGuidedAnswer(slot.answer_text);
}

export function isGuidedAnswerCorrect(
    script: GuidedScript,
    currentStepIndex: number,
    input: string,
) {
    return isCurrentSlotAnswer(script.slots[currentStepIndex], input);
}

export function getGuidedRealtimeFeedback(
    script: GuidedScript,
    state: GuidedSessionState,
    input: string,
) {
    const slot = script.slots[state.currentStepIndex];
    if (!slot) return null;

    const normalizedInput = normalizeGuidedAnswer(input);
    if (!normalizedInput) return null;

    const normalizedAnswer = normalizeGuidedAnswer(slot.answer_text);
    if (normalizedInput === normalizedAnswer || normalizedAnswer.startsWith(normalizedInput)) {
        return null;
    }

    if (slot.slot_kind === "word" && /\s/.test(input.trim())) {
        return null;
    }

    return null;
}

export function advanceGuidedStep(state: GuidedSessionState, script: GuidedScript): GuidedSessionState {
    const nextIndex = Math.min(state.currentStepIndex + 1, script.slots.length);
    return {
        ...state,
        currentStepIndex: nextIndex,
        currentAttemptCount: 0,
        guidedChoicesVisible: false,
        revealReady: false,
        lastFeedback: null,
        status: getCompletionAwareStatus(script, nextIndex),
    };
}

function advanceWithFilledSlot(
    state: GuidedSessionState,
    script: GuidedScript,
    slot: GuidedTemplateSlot,
    filledValue: string,
): GuidedSessionState {
    const nextIndex = state.currentStepIndex + 1;
    return {
        ...state,
        currentStepIndex: nextIndex,
        currentAttemptCount: 0,
        guidedChoicesVisible: false,
        revealReady: false,
        filledFragments: {
            ...state.filledFragments,
            [slot.id]: filledValue,
        },
        lastFeedback: null,
        status: getCompletionAwareStatus(script, nextIndex),
    };
}

export function submitGuidedStepInput(
    state: GuidedSessionState,
    script: GuidedScript,
    input: string,
): GuidedSessionState {
    const currentSlot = script.slots[state.currentStepIndex];
    if (!currentSlot) {
        return state;
    }

    if (isCurrentSlotAnswer(currentSlot, input)) {
        return advanceWithFilledSlot(
            state,
            script,
            currentSlot,
            currentSlot.answer_text,
        );
    }

    const nextAttempts = state.currentAttemptCount + 1;
    if (currentSlot.multiple_choice?.length && nextAttempts >= 3 && !state.guidedChoicesVisible) {
        return {
            ...state,
            currentAttemptCount: nextAttempts,
            guidedChoicesVisible: true,
            revealReady: true,
            lastFeedback: null,
        };
    }

    if (nextAttempts >= 3) {
        return {
            ...state,
            currentAttemptCount: nextAttempts,
            guidedChoicesVisible: false,
            revealReady: true,
            lastFeedback: null,
        };
    }

    return {
        ...state,
        currentAttemptCount: nextAttempts,
        guidedChoicesVisible: false,
        revealReady: false,
        lastFeedback: null,
    };
}

export function submitGuidedChoiceSelection(
    state: GuidedSessionState,
    script: GuidedScript,
    choiceText: string,
): GuidedSessionState {
    const currentSlot = script.slots[state.currentStepIndex];
    if (!currentSlot) {
        return state;
    }

    const selectedChoice = currentSlot.multiple_choice?.find(
        (choice) => normalizeGuidedAnswer(choice.text) === normalizeGuidedAnswer(choiceText),
    );

    if (!selectedChoice) {
        return state;
    }

    if (selectedChoice.isCorrect) {
        return advanceWithFilledSlot(
            state,
            script,
            currentSlot,
            currentSlot.answer_text,
        );
    }

    return {
        ...state,
        currentAttemptCount: Math.max(state.currentAttemptCount, 3),
        guidedChoicesVisible: true,
        revealReady: true,
        lastFeedback: selectedChoice.why_cn,
    };
}

export function revealGuidedCurrentSlot(
    state: GuidedSessionState,
    script: GuidedScript,
) {
    const currentSlot = script.slots[state.currentStepIndex];
    if (!currentSlot) return state;

    const revealedText = currentSlot.teacher_demo_en || currentSlot.answer_text;
    return advanceWithFilledSlot(state, script, currentSlot, revealedText);
}

export function shouldAutoOpenGuidedChoices(idleMs: number) {
    return idleMs >= IDLE_RESCUE_THRESHOLD_MS;
}

function stripHintPrefix(text: string) {
    return text
        .replace(/^老师[:：]\s*/u, "")
        .replace(/^现在做什么[:：]\s*/u, "")
        .replace(/^为什么这样想[:：]\s*/u, "")
        .replace(/^卡住怎么办[:：]\s*/u, "")
        .trim();
}

export function buildGuidedHintLines(script: GuidedScript, state: GuidedSessionState): GuidedHintLines | null {
    const currentSlot = script.slots[state.currentStepIndex];
    if (!currentSlot) return null;
    const idleHint = currentSlot.multiple_choice?.length
        ? (currentSlot.idle_rescue_hint_cn ?? "卡住了可以点“给我选项”，先排除明显不对的词。")
        : null;
    const ladder = currentSlot.hint_ladder;
    const rescue = stripHintPrefix(ladder.level_3 ?? currentSlot.rescue_reason_cn ?? idleHint ?? "");

    if (state.guidedChoicesVisible) {
        return {
            primary: stripHintPrefix(ladder.level_2),
            secondary: stripHintPrefix(state.lastFeedback ?? ladder.level_3 ?? "") || null,
            rescue,
        };
    }

    if (state.currentAttemptCount <= 0) {
        return {
            primary: stripHintPrefix(ladder.level_0),
            secondary: null,
            rescue: rescue || stripHintPrefix(idleHint ?? ""),
        };
    }

    if (state.currentAttemptCount === 1) {
        return {
            primary: stripHintPrefix(state.lastFeedback ?? ladder.level_1),
            secondary: null,
            rescue,
        };
    }

    if (state.revealReady) {
        return {
            primary: stripHintPrefix(ladder.level_2),
            secondary: stripHintPrefix(state.lastFeedback ?? ladder.level_3 ?? ""),
            rescue,
        };
    }

    return {
        primary: stripHintPrefix(state.lastFeedback ?? ladder.level_2),
        secondary: null,
        rescue,
    };
}

function countVisibleWords(text: string) {
    return text.trim().split(/\s+/).filter(Boolean).length;
}

function getCurrentClozeSlot(script: GuidedScript, state: GuidedClozeState) {
    const currentBlankId = state.blankSlotIds[state.currentBlankIndex];
    if (!currentBlankId) return null;
    return script.slots.find((slot) => slot.id === currentBlankId) ?? null;
}

function buildDeterministicScores(length: number, randomValues?: number[]) {
    return Array.from({ length }, (_, index) => randomValues?.[index] ?? Math.random());
}

export function createGuidedClozeState(script: GuidedScript, randomValues?: number[]): GuidedClozeState {
    const slotCount = script.slots.length;
    if (slotCount === 0) {
        return {
            currentBlankIndex: 0,
            currentAttemptCount: 0,
            blankSlotIds: [],
            revealReady: false,
            filledFragments: {},
            lastFeedback: null,
            refreshToken: Date.now(),
        };
    }

    const maxKeepable = slotCount > 3 ? slotCount - 2 : Math.max(slotCount - 1, 1);
    const keepCount = Math.min(
        Math.max(Math.round(slotCount * DEFAULT_CLOZE_KEEP_RATIO), 2),
        Math.max(maxKeepable, 1),
    );
    const blankCount = Math.max(1, slotCount - keepCount);
    const scores = buildDeterministicScores(slotCount, randomValues);
    const blankIndices = scores
        .map((score, index) => ({ score, index }))
        .sort((left, right) => right.score - left.score)
        .slice(0, blankCount)
        .map((item) => item.index)
        .sort((left, right) => left - right);

    const blankIndexSet = new Set(blankIndices);
    const filledFragments = script.slots.reduce<Record<string, string>>((acc, slot, index) => {
        if (!blankIndexSet.has(index)) {
            acc[slot.id] = slot.answer_text;
        }
        return acc;
    }, {});

    return {
        currentBlankIndex: 0,
        currentAttemptCount: 0,
        blankSlotIds: blankIndices.map((index) => script.slots[index]!.id),
        revealReady: false,
        filledFragments,
        lastFeedback: null,
        refreshToken: Date.now(),
    };
}

function getNearestVisibleContext(
    script: GuidedScript,
    state: GuidedClozeState,
    slotIndex: number,
) {
    let previousVisible: string | null = null;
    let nextVisible: string | null = null;

    for (let index = slotIndex - 1; index >= 0; index -= 1) {
        const slot = script.slots[index];
        if (!slot) continue;
        const value = state.filledFragments[slot.id];
        if (value) {
            previousVisible = value;
            break;
        }
    }

    for (let index = slotIndex + 1; index < script.slots.length; index += 1) {
        const slot = script.slots[index];
        if (!slot) continue;
        const value = state.filledFragments[slot.id];
        if (value) {
            nextVisible = value;
            break;
        }
    }

    return { previousVisible, nextVisible };
}

function buildClozeSupportHint(slot: GuidedTemplateSlot, attemptCount: number) {
    if (attemptCount <= 0) return null;
    if (attemptCount === 1) {
        return slot.slot_kind === "phrase"
            ? "先把这一整块一起想，不要拆成单个词。"
            : "别只盯拼写，先根据上下文想它在句子里扮演什么角色。";
    }
    return slot.slot_kind === "phrase"
        ? `这一整块以 ${slot.answer_text.split(/\s+/)[0]} 开头。`
        : `这个词首字母是 ${slot.answer_text.charAt(0).toUpperCase()}。`;
}

export function buildGuidedClozeHint(
    script: GuidedScript,
    state: GuidedClozeState,
): GuidedClozeHint | null {
    const currentSlot = getCurrentClozeSlot(script, state);
    if (!currentSlot) return null;

    const currentSlotIndex = script.slots.findIndex((slot) => slot.id === currentSlot.id);
    const { previousVisible, nextVisible } = getNearestVisibleContext(script, state, currentSlotIndex);
    const contextLine = previousVisible && nextVisible
        ? `前面已经给出 ${previousVisible}，后面会接 ${nextVisible}，先用这两个锚点夹着往中间推。`
        : previousVisible
            ? `前面已经给出 ${previousVisible} 了，顺着往后推这一格。`
            : nextVisible
                ? `后面已经给出 ${nextVisible} 了，往前倒推这一格。`
                : "先借已经露出来的部分，把这一格顺出来。";
    const ladder = currentSlot.hint_ladder;
    const rescue = stripHintPrefix(ladder.level_3 ?? buildClozeSupportHint(currentSlot, state.currentAttemptCount) ?? "");

    if (state.currentAttemptCount <= 0) {
        return {
            primary: stripHintPrefix(ladder.level_0),
            secondary: null,
            rescue,
        };
    }

    if (state.currentAttemptCount === 1) {
        return {
            primary: stripHintPrefix(state.lastFeedback ?? ladder.level_1 ?? contextLine),
            secondary: null,
            rescue,
        };
    }

    if (state.revealReady) {
        return {
            primary: stripHintPrefix(ladder.level_2),
            secondary: stripHintPrefix(state.lastFeedback ?? ladder.level_3 ?? ""),
            rescue,
        };
    }

    return {
        primary: stripHintPrefix(state.lastFeedback ?? ladder.level_2 ?? contextLine),
        secondary: null,
        rescue,
    };
}

export function submitGuidedClozeInput(
    state: GuidedClozeState,
    script: GuidedScript,
    input: string,
): GuidedClozeState {
    const currentSlot = getCurrentClozeSlot(script, state);
    if (!currentSlot) return state;

    if (normalizeGuidedAnswer(input) === normalizeGuidedAnswer(currentSlot.answer_text)) {
        return {
            ...state,
            currentBlankIndex: state.currentBlankIndex + 1,
            currentAttemptCount: 0,
            revealReady: false,
            filledFragments: {
                ...state.filledFragments,
                [currentSlot.id]: currentSlot.answer_text,
            },
            lastFeedback: null,
        };
    }

    const nextAttemptCount = state.currentAttemptCount + 1;
    if (nextAttemptCount >= 3) {
        return {
            ...state,
            currentAttemptCount: nextAttemptCount,
            revealReady: true,
            lastFeedback: null,
        };
    }

    return {
        ...state,
        currentAttemptCount: nextAttemptCount,
        revealReady: false,
        lastFeedback: null,
    };
}

export function revealGuidedClozeCurrentSlot(
    state: GuidedClozeState,
    script: GuidedScript,
) {
    const currentSlot = getCurrentClozeSlot(script, state);
    if (!currentSlot) return state;

    return {
        ...state,
        currentBlankIndex: state.currentBlankIndex + 1,
        currentAttemptCount: 0,
        revealReady: false,
        filledFragments: {
            ...state.filledFragments,
            [currentSlot.id]: currentSlot.teacher_demo_en || currentSlot.answer_text,
        },
        lastFeedback: null,
    };
}

export function buildGuidedClozeTokens(
    script: GuidedScript,
    state: GuidedClozeState,
    currentInput = "",
): GuidedTemplateToken[] {
    const tokens: GuidedTemplateToken[] = [];
    let lastIndex = 0;
    const currentBlankId = state.blankSlotIds[state.currentBlankIndex];
    const currentBlankIndex = currentBlankId
        ? script.slots.findIndex((slot) => slot.id === currentBlankId)
        : -1;

    for (const match of script.sentence_template.matchAll(TEMPLATE_SLOT_PATTERN)) {
        const fullMatch = match[0];
        const slotIndex = Number.parseInt(match[1] ?? "", 10);
        const matchIndex = match.index ?? 0;
        const precedingText = script.sentence_template.slice(lastIndex, matchIndex);
        if (precedingText) {
            tokens.push({ type: "text", value: precedingText });
        }

        const slot = script.slots.find((item) => item.slot_index === slotIndex);
        if (slot) {
            const filledValue = state.filledFragments[slot.id];
            const isBlank = state.blankSlotIds.includes(slot.id);
            const isCurrentBlank = currentBlankId === slot.id;
            tokens.push({
                type: "slot",
                value: filledValue || (isCurrentBlank ? (currentInput || slot.display_placeholder) : slot.display_placeholder),
                slotId: slot.id,
                slotIndex: slot.slot_index,
                status: filledValue
                    ? "filled"
                    : isCurrentBlank
                        ? "current"
                        : isBlank
                            ? "locked"
                            : "filled",
                inputWidthCh: Math.max(countVisibleWords(slot.answer_text) > 1 ? slot.display_placeholder.length : slot.answer_text.length + 1, 3),
            });
        }

        lastIndex = matchIndex + fullMatch.length;
    }

    const trailingText = script.sentence_template.slice(lastIndex);
    if (trailingText) {
        tokens.push({ type: "text", value: trailingText });
    }

    return tokens;
}

export function buildGuidedDraftPreview(
    script: GuidedScript,
    filledFragments: Record<string, string>,
) {
    return script.slots.map((slot) => filledFragments[slot.id] || slot.display_placeholder);
}

export function buildGuidedTemplateTokens(
    script: GuidedScript,
    filledFragments: Record<string, string>,
    currentStepIndex: number,
    currentInput = "",
): GuidedTemplateToken[] {
    const tokens: GuidedTemplateToken[] = [];
    let lastIndex = 0;

    for (const match of script.sentence_template.matchAll(TEMPLATE_SLOT_PATTERN)) {
        const fullMatch = match[0];
        const slotIndex = Number.parseInt(match[1] ?? "", 10);
        const matchIndex = match.index ?? 0;
        const precedingText = script.sentence_template.slice(lastIndex, matchIndex);
        if (precedingText) {
            tokens.push({
                type: "text",
                value: precedingText,
            });
        }

        const slot = script.slots.find((item) => item.slot_index === slotIndex);
        if (slot) {
            const filledValue = filledFragments[slot.id];
            const isCurrent = currentStepIndex === slot.slot_index - 1;
            tokens.push({
                type: "slot",
                value: filledValue || (isCurrent ? (currentInput || slot.display_placeholder) : slot.display_placeholder),
                slotId: slot.id,
                slotIndex: slot.slot_index,
                status: filledValue
                    ? "filled"
                    : isCurrent
                        ? "current"
                        : "locked",
                inputWidthCh: Math.max(slot.answer_text.length + 1, 3),
            });
        }

        lastIndex = matchIndex + fullMatch.length;
    }

    const trailingText = script.sentence_template.slice(lastIndex);
    if (trailingText) {
        tokens.push({
            type: "text",
            value: trailingText,
        });
    }

    return tokens;
}

export function shouldBypassBattleRewards({
    learningSession,
}: {
    learningSession: boolean;
    guidedModeStatus: GuidedModeStatus;
}) {
    return learningSession;
}
