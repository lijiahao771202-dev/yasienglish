import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createCompletionMock } = vi.hoisted(() => ({
    createCompletionMock: vi.fn(),
}));

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: createCompletionMock,
            },
        },
    },
}));

import { POST } from "./route";

function createCompletionPayload(payload: Record<string, unknown>) {
    return {
        choices: [
            {
                message: {
                    content: JSON.stringify(payload),
                },
            },
        ],
    };
}

function buildRequest(
    overrides: Partial<{
        chinese: string;
        reference_english: string;
        elo: number;
        topic: string;
    }> = {},
) {
    return {
        json: async () => ({
            chinese: "我昨天去了超市。",
            reference_english: "I went to the supermarket yesterday.",
            elo: 620,
            topic: "日常闲聊",
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("guided_script route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns a normalized template guided script with aligned slots", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                lesson_intro: "老师先搭骨架，再带学生一格一格写。",
                sentence_template: "{{slot_1}} {{slot_2}} {{slot_3}} {{slot_4}}.",
                slots: [
                    {
                        id: "slot-1",
                        slot_index: 1,
                        slot_kind: "word",
                        answer_text: "I",
                        display_placeholder: "____",
                        hint_ladder: {
                            level_0: "先看中文里是谁在做这件事，先把句首主语补上。",
                            level_1: "先别想动作，这里只写做这件事的人。",
                            level_2: "想想中文里的“我”，首字母是 I。",
                            level_3: "还是卡住就先用选项排除。",
                        },
                        hint_focus_cn: "我",
                        teacher_goal_cn: "先填主语",
                        teacher_prompt_cn: "现在做什么：先看是谁在做这件事，把句首主语补上。",
                        micro_rule_cn: "为什么这样想：这里是句首主语位置，要用主语形式。",
                        wrong_feedback_cn: ["先写做这件事的人。", "想想中文里的“我”，这一格首字母是 I。"],
                        stronger_hint_cn: "卡住怎么办：这个词是主语形式，只是一个字母开头的那个词。",
                        teacher_demo_en: "I",
                        multiple_choice: [
                            { text: "I", isCorrect: true, why_cn: "这里要用主语。" },
                            { text: "me", isCorrect: false, why_cn: "me 是宾格。" },
                            { text: "my", isCorrect: false, why_cn: "my 后面还要接名词。" },
                        ],
                        rescue_reason_cn: "这里容易在主格和宾格之间混。",
                        idle_rescue_hint_cn: "如果主语形式一时想不起来，可以先看选项。",
                        reveal_mode: "auto_demo_after_3",
                    },
                    {
                        id: "slot-2",
                        slot_index: 2,
                        slot_kind: "word",
                        answer_text: "went",
                        display_placeholder: "_____",
                        hint_ladder: {
                            level_0: "先补中文里“去了/做了什么”那个动作。",
                            level_1: "I 后面现在缺的是过去发生的动作。",
                            level_2: "如果你想到 go，这里要用它的过去式，首字母是 w。",
                            level_3: "还是卡住就先看选项排掉原形。",
                        },
                        hint_focus_cn: "去了",
                        teacher_goal_cn: "再填动作",
                        teacher_prompt_cn: "现在做什么：这里只补动作词，先别急着想后面地点。",
                        micro_rule_cn: "为什么这样想：这里要先把 go 的过去时间线想对。",
                        wrong_feedback_cn: ["这里只填动作。", "不是原形，要用过去式。"],
                        stronger_hint_cn: "卡住怎么办：它是 go 的过去式。",
                        teacher_demo_en: "went",
                        reveal_mode: "auto_demo_after_3",
                    },
                    {
                        id: "slot-3",
                        slot_index: 3,
                        slot_kind: "phrase",
                        answer_text: "to the supermarket",
                        display_placeholder: "__ ___ ___________",
                        hint_ladder: {
                            level_0: "这里把“去超市”这一整块去向表达一起补上。",
                            level_1: "先别拆成单词，这里整块记会更稳。",
                            level_2: "这一整块以 to 开头。",
                            level_3: "还是卡住就先看整块短语选项。",
                        },
                        hint_focus_cn: "去超市",
                        teacher_goal_cn: "补地点短语",
                        teacher_prompt_cn: "现在做什么：这里把去向这一整块一起补上。",
                        micro_rule_cn: "为什么这样想：这部分可以作为一个完整去向表达一起记。",
                        wrong_feedback_cn: ["这里先看成一个整体短语。", "先想“去超市”这整块，不要拆太碎。"],
                        stronger_hint_cn: "卡住怎么办：这一整块以 to 开头。",
                        teacher_demo_en: "to the supermarket",
                        multiple_choice: [
                            { text: "to the supermarket", isCorrect: true, why_cn: "这里要补完整去向表达。" },
                            { text: "at the supermarket", isCorrect: false, why_cn: "at 偏位置，不是“去到”。" },
                            { text: "in the supermarket", isCorrect: false, why_cn: "in 偏位置内部，不是去向。" },
                        ],
                        rescue_reason_cn: "这里是整块去向表达，用选项更容易判断搭配。",
                        idle_rescue_hint_cn: "如果这整块短语想不起来，先看选项。",
                        reveal_mode: "auto_demo_after_3",
                    },
                    {
                        id: "slot-4",
                        slot_index: 4,
                        slot_kind: "word",
                        answer_text: "yesterday",
                        display_placeholder: "_________",
                        hint_ladder: {
                            level_0: "句尾把中文里的时间词补进来。",
                            level_1: "这里只补时间，不用回头改前面。",
                            level_2: "想想“昨天”怎么写，首字母是 y。",
                            level_3: "还是卡住就先看选项。",
                        },
                        hint_focus_cn: "昨天",
                        teacher_goal_cn: "最后补时间",
                        teacher_prompt_cn: "现在做什么：句尾把时间词补进来。",
                        micro_rule_cn: "为什么这样想：英文里时间信息常放句尾。",
                        wrong_feedback_cn: ["这里只填时间。", "想想“昨天”怎么写。"],
                        stronger_hint_cn: "卡住怎么办：这是表示“昨天”的时间词。",
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
                            explanation: "时间放句尾，动词要用过去式。",
                        },
                    ],
                    memory_anchor: "先看骨架，再填空位。",
                },
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.lesson_intro).toBeTruthy();
        expect(data.sentence_template).toBe("{{slot_1}} {{slot_2}} {{slot_3}} {{slot_4}}.");
        expect(Array.isArray(data.slots)).toBe(true);
        expect(data.slots).toHaveLength(4);
        expect(data.slots.map((slot: { slot_index: number }) => slot.slot_index)).toEqual([1, 2, 3, 4]);
        expect(data.slots.some((slot: { slot_kind: string }) => slot.slot_kind === "phrase")).toBe(true);
        expect(data.slots[0].hint_ladder.level_0).toBeTruthy();
        expect(data.slots[0].hint_ladder.level_1).toBeTruthy();
        expect(data.slots[0].hint_ladder.level_2).toContain("首字母");
        expect(data.slots[0].teacher_prompt_cn).not.toContain(data.slots[0].answer_text);
        expect(data.slots[2].multiple_choice.length).toBeGreaterThanOrEqual(2);
        expect(data.summary.final_sentence).toBe("I went to the supermarket yesterday.");
    });

    it("returns 502 when model output is malformed instead of using a local fallback", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                lesson_intro: "",
                sentence_template: "broken template",
                slots: [{ id: "broken" }],
                summary: {},
            }),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(502);
        expect(data.error).toBe("AI guided script unavailable");
    });
});
