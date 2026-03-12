import { describe, expect, it } from "vitest";

import {
    buildFallbackGuidedScript,
    buildGuidedClozeHint,
    buildGuidedClozeTokens,
    buildGuidedHintLines,
    buildGuidedTemplateTokens,
    createGuidedClozeState,
    createGuidedSessionState,
    getGuidedRealtimeFeedback,
    revealGuidedClozeCurrentSlot,
    revealGuidedCurrentSlot,
    shouldAutoOpenGuidedChoices,
    shouldBypassBattleRewards,
    submitGuidedClozeInput,
    submitGuidedChoiceSelection,
    submitGuidedStepInput,
    type GuidedScript,
} from "./guidedLearning";

const guidedScript: GuidedScript = {
    lesson_intro: "老师会先搭骨架，再带你一格一格写。",
    sentence_template: "{{slot_1}} {{slot_2}} {{slot_3}} {{slot_4}} {{slot_5}} {{slot_6}}.",
    slots: [
        {
            id: "slot-1",
            slot_index: 1,
            slot_kind: "word",
            answer_text: "I",
            display_placeholder: "____",
            hint_ladder: {
                level_0: "先看中文里是谁在做这件事，先把句首那个主语补上。",
                level_1: "别急着想动作，这里只写做这件事的人。",
                level_2: "想想中文里的“我”，这一格首字母是 I。",
                level_3: "如果还卡住，就先用选项排除宾格和所有格。",
            },
            hint_focus_cn: "我",
            teacher_goal_cn: "先填主语",
            teacher_prompt_cn: "老师：先看中文里是谁在做这件事，先把句首那个主语补上。",
            micro_rule_cn: "这里是句首主语位置，要用主语形式。",
            wrong_feedback_cn: ["先写做这件事的人。", "想想中文里的“我”，这一格首字母是 I。"],
            stronger_hint_cn: "这个词是主语形式，只是一个字母开头的那个词。",
            teacher_demo_en: "I",
            multiple_choice: [
                { text: "I", isCorrect: true, why_cn: "这里要用主语形式。" },
                { text: "me", isCorrect: false, why_cn: "me 是宾格，不放在句首主语位置。" },
                { text: "my", isCorrect: false, why_cn: "my 后面还要接名词。" },
            ],
            rescue_reason_cn: "如果主语形式一时想不起来，可以先排除格位不对的词。",
            idle_rescue_hint_cn: "卡住了就先点选项，先把主语位置判断出来。",
            reveal_mode: "auto_demo_after_3",
        },
        {
            id: "slot-2",
            slot_index: 2,
            slot_kind: "word",
            answer_text: "went",
            display_placeholder: "_____",
            hint_ladder: {
                level_0: "先别想地点和时间，这里先补中文里“去了/做了什么”那个动作。",
                level_1: "I 后面现在缺的是动作本身，先把过去发生的那个动作补上。",
                level_2: "如果你想到 go，这里要再往前走一步，用它的过去式，首字母是 w。",
                level_3: "还卡住就先看选项，排掉原形和分词。",
            },
            hint_focus_cn: "去了",
            teacher_goal_cn: "再填动作",
            teacher_prompt_cn: "老师：现在补动作词。中文已经带出过去发生的时间线，这里要用过去式。",
            micro_rule_cn: "这里要先确定动词时态，再往后接地点和时间。",
            wrong_feedback_cn: ["这里只写动作词。", "不是原形，要想那个过去式，首字母是 w。"],
            stronger_hint_cn: "它是 go 的过去式，不是 go 本身。",
            teacher_demo_en: "went",
            reveal_mode: "auto_demo_after_3",
        },
        {
            id: "slot-3",
            slot_index: 3,
            slot_kind: "word",
            answer_text: "to",
            display_placeholder: "__",
            hint_ladder: {
                level_0: "动作后面先接去向，这里补那个把动作带到地点的短介词。",
                level_1: "went 后面现在还不能直接接地点名词，中间要先有个连接词。",
                level_2: "想想“去某地”最常用的那个两字母介词。",
                level_3: "如果还拿不准，就先看选项判断方向关系。",
            },
            hint_focus_cn: "去",
            teacher_goal_cn: "补介词",
            teacher_prompt_cn: "老师：动作后面要接去向，这一格先补那个连接地点的介词。",
            micro_rule_cn: "这个词负责把动作和后面的地点连起来。",
            wrong_feedback_cn: ["这里只写介词。", "表达“去某地”时，常用那个两字母介词。"],
            stronger_hint_cn: "它是表示方向的那个很短的介词。",
            teacher_demo_en: "to",
            reveal_mode: "auto_demo_after_3",
        },
        {
            id: "slot-4",
            slot_index: 4,
            slot_kind: "word",
            answer_text: "the",
            display_placeholder: "___",
            hint_ladder: {
                level_0: "地点名词前面还差一层小限定词，这里先把它补齐。",
                level_1: "先别写后面的地点名词，这格只处理名词前面的那个小词。",
                level_2: "如果你在 a / an / the 之间犹豫，这里是在说特定的那个地方。",
                level_3: "还卡住就直接用选项排除。",
            },
            hint_focus_cn: "这个",
            teacher_goal_cn: "补限定词",
            teacher_prompt_cn: "老师：地点名词前面还差一个限定词，把它补完整。",
            micro_rule_cn: "这里是名词前的位置，要放限定词。",
            wrong_feedback_cn: ["这里只写限定词。", "想想最常见的那个定冠词。"],
            stronger_hint_cn: "它是英语里最常见的那个三字母定冠词。",
            teacher_demo_en: "the",
            reveal_mode: "auto_demo_after_3",
        },
        {
            id: "slot-5",
            slot_index: 5,
            slot_kind: "word",
            answer_text: "supermarket",
            display_placeholder: "___________",
            hint_ladder: {
                level_0: "前面 to the 已经给出来了，这里只补那个地点名词本身。",
                level_1: "回到中文里“超市”这一小块，不要把前面的介词和冠词重写。",
                level_2: "这是买东西那个地方的英文名词，首字母是 s。",
                level_3: "如果拼写太长，就先看选项排掉餐馆和车站。",
            },
            hint_focus_cn: "超市",
            teacher_goal_cn: "补地点单词",
            teacher_prompt_cn: "老师：前面已经有介词和限定词了，这一格只补那个地点名词。",
            micro_rule_cn: "这里只写地点本身，不用把前面的 to the 一起重写。",
            wrong_feedback_cn: ["这里只填地点名词。", "想想中文里的“超市”，首字母是 s。"],
            stronger_hint_cn: "它是买东西那个地方的英文名词。",
            teacher_demo_en: "supermarket",
            multiple_choice: [
                { text: "supermarket", isCorrect: true, why_cn: "这里要补“超市”这个地点名词。" },
                { text: "restaurant", isCorrect: false, why_cn: "restaurant 是餐馆，不是中文里的“超市”。" },
                { text: "station", isCorrect: false, why_cn: "station 是车站，这里地点语义不对。" },
            ],
            rescue_reason_cn: "这个地点词偏长，先用选项排除更稳。",
            idle_rescue_hint_cn: "这个词有点长，卡住了就先用选项判断地点语义。",
            reveal_mode: "auto_demo_after_3",
        },
        {
            id: "slot-6",
            slot_index: 6,
            slot_kind: "word",
            answer_text: "yesterday",
            display_placeholder: "_________",
            hint_ladder: {
                level_0: "句子主干已经够了，最后把中文里的时间词收进句尾。",
                level_1: "这里只补时间，不用回头改前面的结构。",
                level_2: "想想中文里的“昨天”，首字母是 y。",
                level_3: "还卡住就先看选项回忆那个时间词。",
            },
            hint_focus_cn: "昨天",
            teacher_goal_cn: "最后补时间",
            teacher_prompt_cn: "老师：最后把时间收在句尾，补上中文里那个时间词。",
            micro_rule_cn: "英文里时间信息经常放在句尾，读起来更自然。",
            wrong_feedback_cn: ["这里只填时间词。", "想想中文里的“昨天”，首字母是 y。"],
            stronger_hint_cn: "这是表示“昨天”的那个时间词。",
            teacher_demo_en: "yesterday",
            reveal_mode: "auto_demo_after_3",
        },
    ],
    summary: {
        final_sentence: "I went to the supermarket yesterday.",
        chinese_meaning: "我昨天去了超市。",
        structure_hint: "主语 + 动词过去式 + 介词 + 冠词 + 地点 + 时间",
        chinglish_alerts: [
            {
                wrong: "I yesterday go to supermarket.",
                correct: "I went to the supermarket yesterday.",
                explanation: "时间常放句尾，go 要变过去式。",
            },
        ],
        memory_anchor: "先看骨架，再往空位里填词。",
    },
};

describe("guidedLearning template flow", () => {
    it("builds a template-style fallback script instead of chunk cards", () => {
        const fallback = buildFallbackGuidedScript({
            chinese: "我昨天去了超市。",
            referenceEnglish: "I went to the supermarket yesterday.",
        });

        expect(fallback.sentence_template).toBe("{{slot_1}} {{slot_2}} {{slot_3}} {{slot_4}} {{slot_5}} {{slot_6}}.");
        expect(fallback.slots).toHaveLength(6);
        expect(fallback.slots.every((slot) => !slot.answer_text.includes(" "))).toBe(true);
        expect(fallback.slots[0]?.teacher_goal_cn).toBe("先填主语");
        expect(fallback.slots[0]?.teacher_prompt_cn).not.toContain(fallback.slots[0]!.answer_text);
        expect(fallback.slots[0]?.hint_ladder.level_0).toContain("中文");
        expect(fallback.slots[0]?.hint_ladder.level_1).not.toBe(fallback.slots[0]?.hint_ladder.level_0);
        expect(fallback.slots[0]?.hint_ladder.level_2).toContain("首字母");
        expect(fallback.slots[1]?.teacher_goal_cn).toBe("现在填动作");
        expect(fallback.slots[2]?.answer_text).toBe("to");
        expect(fallback.slots[3]?.answer_text).toBe("the");
        expect(fallback.slots[5]?.teacher_goal_cn).toBe("最后补时间");
        expect(fallback.slots[1]?.teacher_prompt_cn).toContain("先别想地点");
        expect(fallback.slots[1]?.micro_rule_cn).toContain("先把动作立住");
    });

    it("merges phrase-style expressions into one slot when the expression should be learned as a block", () => {
        const fallback = buildFallbackGuidedScript({
            chinese: "我昨天一直在找我的钥匙。",
            referenceEnglish: "I looked for my keys yesterday.",
        });

        expect(fallback.slots.some((slot) => slot.slot_kind === "phrase")).toBe(true);
        expect(fallback.slots.find((slot) => slot.slot_kind === "phrase")?.answer_text).toBe("looked for");
    });

    it("arms manual reveal instead of auto-filling after three wrong attempts when no rescue choices exist", () => {
        const revealScript: GuidedScript = {
            ...guidedScript,
            sentence_template: "{{slot_1}}.",
            slots: [guidedScript.slots[1]!],
            summary: {
                ...guidedScript.summary,
                final_sentence: "went.",
            },
        };

        let state = createGuidedSessionState(revealScript);

        state = submitGuidedStepInput(state, revealScript, "go");
        expect(state.currentAttemptCount).toBe(1);
        expect(state.lastFeedback).toBeNull();

        state = submitGuidedStepInput(state, revealScript, "going");
        expect(state.currentAttemptCount).toBe(2);
        expect(state.lastFeedback).toBeNull();

        state = submitGuidedStepInput(state, revealScript, "gone");
        expect(state.currentStepIndex).toBe(0);
        expect(state.revealReady).toBe(true);
        expect(state.filledFragments["slot-2"]).toBeUndefined();
        expect(state.lastFeedback).toBeNull();

        state = revealGuidedCurrentSlot(state, revealScript);
        expect(state.currentStepIndex).toBe(1);
        expect(state.currentAttemptCount).toBe(0);
        expect(state.filledFragments["slot-2"]).toBe("went");
        expect(state.lastFeedback).toBeNull();
    });

    it("opens multiple-choice rescue after the third wrong attempt on a hard word", () => {
        const hardWordScript: GuidedScript = {
            ...guidedScript,
            sentence_template: "{{slot_1}}.",
            slots: [guidedScript.slots[4]!],
            summary: {
                ...guidedScript.summary,
                final_sentence: "supermarket.",
            },
        };

        let state = createGuidedSessionState(hardWordScript);
        state = submitGuidedStepInput(state, hardWordScript, "store");
        expect(state.guidedChoicesVisible).toBe(false);

        state = submitGuidedStepInput(state, hardWordScript, "mall");
        expect(state.currentAttemptCount).toBe(2);
        expect(state.guidedChoicesVisible).toBe(false);

        state = submitGuidedStepInput(state, hardWordScript, "market");
        expect(state.currentAttemptCount).toBe(3);
        expect(state.guidedChoicesVisible).toBe(true);
        expect(state.lastFeedback).toBeNull();
    });

    it("reveals the answer after the learner still misses the rescue choice", () => {
        const hardWordScript: GuidedScript = {
            ...guidedScript,
            sentence_template: "{{slot_1}}.",
            slots: [guidedScript.slots[4]!],
            summary: {
                ...guidedScript.summary,
                final_sentence: "supermarket.",
            },
        };

        const state = submitGuidedChoiceSelection(
            {
                ...createGuidedSessionState(hardWordScript),
                currentAttemptCount: 3,
                guidedChoicesVisible: true,
                revealReady: true,
            },
            hardWordScript,
            "restaurant",
        );

        expect(state.status).toBe("active");
        expect(state.guidedChoicesVisible).toBe(true);
        expect(state.revealReady).toBe(true);
        expect(state.filledFragments["slot-5"]).toBeUndefined();
        expect(state.lastFeedback).toContain("餐馆");
    });

    it("accepts valid slot answers and builds the sentence template tokens", () => {
        let state = createGuidedSessionState(guidedScript);
        state = submitGuidedStepInput(state, guidedScript, "I");
        state = submitGuidedStepInput(state, guidedScript, "went");
        state = submitGuidedStepInput(state, guidedScript, "to");

        const tokens = buildGuidedTemplateTokens(guidedScript, state.filledFragments, state.currentStepIndex);
        const slotTokens = tokens.filter((token) => token.type === "slot");

        expect(state.currentStepIndex).toBe(3);
        expect(slotTokens.slice(0, 4).map((token) => token.value)).toEqual([
            "I",
            "went",
            "to",
            "___",
        ]);
        expect(slotTokens.map((token) => token.status)).toEqual([
            "filled",
            "filled",
            "filled",
            "current",
            "locked",
            "locked",
        ]);
    });

    it("treats every slot as a single editable word in sequence", () => {
        const tokens = buildGuidedTemplateTokens(guidedScript, {}, 0);
        const slotTokens = tokens.filter((token) => token.type === "slot");

        expect(slotTokens).toHaveLength(6);
        expect(slotTokens.every((token) => !String(token.value).includes(" "))).toBe(true);
        expect(slotTokens[0]?.status).toBe("current");
        expect(slotTokens.slice(1).every((token) => token.status === "locked")).toBe(true);
    });

    it("does not return local realtime feedback now that hints are AI-generated on demand", () => {
        const state = createGuidedSessionState(guidedScript);

        expect(getGuidedRealtimeFeedback(guidedScript, state, "I")).toBeNull();
        expect(getGuidedRealtimeFeedback(guidedScript, state, "my")).toBeNull();
        expect(getGuidedRealtimeFeedback(guidedScript, state, "I went")).toBeNull();
    });

    it("builds micro-lesson hint lines instead of one long prompt block", () => {
        const initialLines = buildGuidedHintLines(guidedScript, createGuidedSessionState(guidedScript));
        expect(initialLines?.primary).toContain("先看中文里是谁");
        expect(initialLines?.secondary).toBeNull();
        expect(initialLines?.rescue).toContain("选项");
        expect(initialLines?.primary).not.toContain("现在做什么");
        expect(initialLines?.primary).not.toContain("先填主语：");

        const afterMistake = buildGuidedHintLines(guidedScript, {
            ...createGuidedSessionState(guidedScript),
            currentAttemptCount: 1,
            lastFeedback: "先写做这件事的人。",
        });
        expect(afterMistake?.primary).toContain("先写做这件事的人。");
        expect(afterMistake?.secondary).toBeNull();
    });

    it("escalates teacher hints as attempts increase", () => {
        const levelOne = buildGuidedHintLines(guidedScript, {
            ...createGuidedSessionState(guidedScript),
            currentStepIndex: 1,
            currentAttemptCount: 1,
        });
        const levelTwo = buildGuidedHintLines(guidedScript, {
            ...createGuidedSessionState(guidedScript),
            currentStepIndex: 1,
            currentAttemptCount: 2,
        });

        expect(levelOne?.primary).toContain("动作本身");
        expect(levelOne?.secondary).toBeNull();
        expect(levelTwo?.primary).toContain("首字母");
        expect(levelTwo?.secondary).toBeNull();
    });

    it("switches teacher hints immediately to the next slot after a correct fill", () => {
        const nextState = submitGuidedStepInput(createGuidedSessionState(guidedScript), guidedScript, "I");
        const nextLines = buildGuidedHintLines(guidedScript, nextState);

        expect(nextState.currentStepIndex).toBe(1);
        expect(nextState.lastFeedback).toBeNull();
        expect(nextLines?.primary).toContain("动作");
        expect(nextLines?.primary).not.toContain("主语");
    });

    it("accepts contraction answers even when the learner omits the apostrophe", () => {
        const contractionScript: GuidedScript = {
            ...guidedScript,
            sentence_template: "{{slot_1}}.",
            slots: [
                {
                    id: "slot-1",
                    slot_index: 1,
                    slot_kind: "word",
                    answer_text: "won't",
                    display_placeholder: "_____",
                    hint_ladder: {
                        level_0: "这里要补一个否定缩写，意思接近 will not。",
                        level_1: "先别想别的结构，这格只写那个否定缩写。",
                        level_2: "想想 will not 缩起来后的写法，中间会有一个撇号。",
                        level_3: "还卡住就先看选项，排掉 would not。",
                    },
                    teacher_goal_cn: "补缩写",
                    teacher_prompt_cn: "老师：这里要补一个否定缩写，意思接近 will not。",
                    micro_rule_cn: "缩写里有撇号也没关系，先想这个否定形式。",
                    wrong_feedback_cn: ["这里只填那个否定缩写。", "想想 will not 缩起来后的写法。"],
                    stronger_hint_cn: "这是 will not 的缩写形式，中间会有一个撇号。",
                    teacher_demo_en: "won't",
                    multiple_choice: [
                        { text: "wont", isCorrect: false, why_cn: "没有撇号的拼写不规范。" },
                        { text: "won't", isCorrect: true, why_cn: "这里要用 will not 的缩写。" },
                        { text: "wouldn't", isCorrect: false, why_cn: "wouldn't 是 would not，不是这里的意思。" },
                    ],
                    reveal_mode: "auto_demo_after_3",
                },
            ],
        };

        const nextState = submitGuidedStepInput(createGuidedSessionState(contractionScript), contractionScript, "wont");
        expect(nextState.status).toBe("complete");
        expect(nextState.filledFragments["slot-1"]).toBe("won't");
    });

    it("keeps the initial teacher prompt guidance-only instead of leaking the answer", () => {
        const slot = guidedScript.slots[4]!;

        expect(slot.teacher_prompt_cn).not.toContain(slot.answer_text);
        expect(slot.teacher_prompt_cn).toContain("地点");
        expect(slot.micro_rule_cn).toContain("to the");
    });

    it("recommends opening rescue choices after a long idle period", () => {
        expect(shouldAutoOpenGuidedChoices(5000)).toBe(false);
        expect(shouldAutoOpenGuidedChoices(12000)).toBe(true);
    });

    it("creates a guided cloze with some words shown and some blanks left", () => {
        const cloze = createGuidedClozeState(guidedScript, [0.05, 0.95, 0.2, 0.8, 0.1, 0.85]);
        const tokens = buildGuidedClozeTokens(guidedScript, cloze, "");
        const slotTokens = tokens.filter((token) => token.type === "slot");

        expect(cloze.blankSlotIds.length).toBeGreaterThanOrEqual(2);
        expect(cloze.blankSlotIds.length).toBeLessThan(guidedScript.slots.length);
        expect(slotTokens.some((token) => token.status === "filled")).toBe(true);
        expect(slotTokens.some((token) => token.status === "current")).toBe(true);
        expect(slotTokens.some((token) => token.status === "locked")).toBe(true);
    });

    it("advances through cloze blanks and keeps non-blank words visible", () => {
        let cloze = createGuidedClozeState(guidedScript, [0.95, 0.95, 0.05, 0.95, 0.05, 0.95]);
        const firstBlankSlotId = cloze.blankSlotIds[0]!;
        const firstBlankSlot = guidedScript.slots.find((slot) => slot.id === firstBlankSlotId)!;

        cloze = submitGuidedClozeInput(cloze, guidedScript, firstBlankSlot.answer_text);

        expect(cloze.currentBlankIndex).toBe(1);
        expect(cloze.filledFragments[firstBlankSlotId]).toBe(firstBlankSlot.answer_text);
        expect(cloze.lastFeedback).toBeNull();
    });

    it("keeps the current cloze blank active after three wrong attempts until the learner chooses reveal", () => {
        let cloze = createGuidedClozeState(guidedScript, [0.95, 0.95, 0.05, 0.95, 0.05, 0.95]);
        const firstBlankSlotId = cloze.blankSlotIds[0]!;

        cloze = submitGuidedClozeInput(cloze, guidedScript, "wrong");
        cloze = submitGuidedClozeInput(cloze, guidedScript, "still wrong");
        cloze = submitGuidedClozeInput(cloze, guidedScript, "nope");

        expect(cloze.currentBlankIndex).toBe(0);
        expect(cloze.revealReady).toBe(true);
        expect(cloze.filledFragments[firstBlankSlotId]).toBeUndefined();

        cloze = revealGuidedClozeCurrentSlot(cloze, guidedScript);
        expect(cloze.currentBlankIndex).toBe(1);
        expect(cloze.revealReady).toBe(false);
    });

    it("builds gestalt-style cloze hints from visible context instead of teacher slot hints", () => {
        const cloze = createGuidedClozeState(guidedScript, [0.05, 0.95, 0.95, 0.1, 0.15, 0.2]);
        const hint = buildGuidedClozeHint(guidedScript, cloze);

        expect(hint?.primary).toContain("动作");
        expect(hint?.secondary).toBeNull();
        expect(hint?.rescue).toMatch(/选项|卡住/);
        expect(hint?.primary).not.toContain("先填主语");
    });
});

describe("shouldBypassBattleRewards", () => {
    it("bypasses score and economy updates during a learning session", () => {
        expect(
            shouldBypassBattleRewards({
                learningSession: true,
                guidedModeStatus: "active",
            }),
        ).toBe(true);
    });

    it("keeps normal battle rewards outside guided learning", () => {
        expect(
            shouldBypassBattleRewards({
                learningSession: false,
                guidedModeStatus: "idle",
            }),
        ).toBe(false);
    });
});
