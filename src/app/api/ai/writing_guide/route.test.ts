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

function buildRequest(overrides: Partial<{
    chinese: string;
    referenceEnglish: string;
    currentInput: string;
    struggleLevel: number;
    previousHint: string;
    history: Array<{
        input: string;
        state: string;
        label: string;
        hint: string;
        focus?: string;
        nextAction?: string;
    }>;
}> = {}) {
    return {
        json: async () => ({
            chinese: "虽然方案可行，但推进速度仍然太慢。",
            referenceEnglish: "Although the plan is viable, progress is still too slow.",
            currentInput: "Although the plan works",
            struggleLevel: 0,
            previousHint: "",
            history: [],
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("writing_guide route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("instructs the model to accept natural alternative answers and protect unfinished fragments", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                state: "valid_alternative",
                hasError: false,
                label: "✅ 可接受写法",
                hint: "意思已经对了，继续把后半句补完。",
                grammarPoint: "",
                grammarExplain: "",
                focus: "finish_clause",
                nextAction: "continue",
            }),
        );

        const response = await POST(buildRequest());
        const prompt = createCompletionMock.mock.calls[0][0].messages[0].content as string;

        expect(response.status).toBe(200);
        expect(prompt).toContain("语义正确、表达自然");
        expect(prompt).toContain("合法替代表达");
        expect(prompt).toContain("unfinished");
        expect(prompt).toContain("valid_alternative");
        expect(prompt).toContain("near_finish");
        expect(prompt).toContain("不能硬拉回参考答案");
    });

    it("replays structured history context instead of only label and hint", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletionPayload({
                state: "phrase_hint",
                hasError: false,
                label: "🔗 词组锦囊",
                hint: "把后半句的速度评价补出来。",
                grammarPoint: "",
                grammarExplain: "",
                focus: "progress_phrase",
                nextAction: "extend",
            }),
        );

        const response = await POST(buildRequest({
            currentInput: "Although the plan is viable",
            previousHint: "先把转折后的主干补出来。",
            history: [
                {
                    input: "Although the plan",
                    state: "unfinished",
                    label: "🧱 理清结构",
                    hint: "先把主句补完整。",
                    focus: "main_clause",
                    nextAction: "add_predicate",
                },
            ],
        }));

        const messages = createCompletionMock.mock.calls[0][0].messages as Array<{ role: string; content: string }>;

        expect(response.status).toBe(200);
        expect(messages[1].content).toContain("\"state\":\"unfinished\"");
        expect(messages[1].content).toContain("\"focus\":\"main_clause\"");
        expect(messages[1].content).toContain("\"nextAction\":\"add_predicate\"");
        expect(messages[2].content).toContain("当前输入是否已经采纳");
    });

    it("normalizes non-blocking states so they never hard-stop the learner", async () => {
        createCompletionMock
            .mockResolvedValueOnce(
                createCompletionPayload({
                    state: "valid_alternative",
                    hasError: true,
                    label: "✨ 官方答案靠拢",
                    hint: "虽然意思对了，但你得换成参考答案里的词。",
                    grammarPoint: "高级替换",
                    grammarExplain: "更像参考答案。",
                    focus: "style",
                    nextAction: "upgrade",
                }),
            )
            .mockResolvedValueOnce(
                createCompletionPayload({
                    state: "unfinished",
                    hasError: true,
                    label: "🩺 语法纠错",
                    hint: "别停，继续把后半句写完。",
                    grammarPoint: "",
                    grammarExplain: "",
                    focus: "clause",
                    nextAction: "continue",
                }),
            )
            .mockResolvedValueOnce(
                createCompletionPayload({
                    state: "grammar_error",
                    hasError: false,
                    label: "🩺 语法纠错",
                    hint: "Although 后面不要再接 but。",
                    grammarPoint: "连词冲突",
                    grammarExplain: "Although 和 but 不能同框。",
                    focus: "although_but",
                    nextAction: "remove_but",
                }),
            );

        const validAlternative = await (await POST(buildRequest())).json();
        const unfinished = await (await POST(buildRequest({
            currentInput: "Although the plan",
        }))).json();
        const grammarError = await (await POST(buildRequest({
            currentInput: "Although the plan is viable but progress is slow",
        }))).json();

        expect(validAlternative.state).toBe("valid_alternative");
        expect(validAlternative.hasError).toBe(false);

        expect(unfinished.state).toBe("unfinished");
        expect(unfinished.hasError).toBe(false);

        expect(grammarError.state).toBe("grammar_error");
        expect(grammarError.hasError).toBe(true);
    });
});
