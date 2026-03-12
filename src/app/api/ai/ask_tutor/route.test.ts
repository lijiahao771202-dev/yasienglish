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

function createCompletion(content: string) {
    return {
        choices: [
            {
                message: {
                    content,
                },
            },
        ],
    };
}

function createStreamCompletion(chunks: string[]) {
    async function* iterator() {
        for (const chunk of chunks) {
            yield {
                choices: [
                    {
                        delta: {
                            content: chunk,
                        },
                    },
                ],
            };
        }
    }

    return iterator();
}

function buildRequest(
    overrides: Partial<{
        query: string;
        hintLevel: number;
        questionType: string;
        userAttempt: string;
        improvedVersion: string;
        score: number;
        recentTurns: Array<{ question: string; answer: string }>;
        teachingPoint: string;
        stream: boolean;
    }> = {}
) {
    return {
        json: async () => ({
            query: "为什么这里用 ignite？",
            hintLevel: 1,
            questionType: "follow_up",
            userAttempt: "When I won the lottery, love started.",
            improvedVersion: "When I won the lottery, a romantic spark ignited between us.",
            score: 78,
            teachingPoint: "词汇搭配与语气",
            recentTurns: [],
            stream: false,
            drillContext: {
                chinese: "中彩票后我们之间擦出了爱情火花。",
                reference_english: "When I won the lottery, a romantic spark ignited between us.",
                key_vocab: ["ignite", "spark"],
            },
            articleTitle: "Emotion topic",
            ...overrides,
        }),
    } as Parameters<typeof POST>[0];
}

describe("ask_tutor route", () => {
    beforeEach(() => {
        createCompletionMock.mockReset();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns structured fields and blocks full answer on first guidance turn", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    coach_cn: "你抓住了主要意思，再把动词搭配调自然。",
                    pattern_en: ["When ..., ..."],
                    contrast: "start love 是直译；spark ignited 更地道。",
                    next_task: "用 When... 再写一句。",
                    answer_revealed: true,
                    full_answer: "SHOULD_NOT_LEAK",
                    teaching_point: "词汇搭配与语气",
                })
            )
        );

        const response = await POST(buildRequest({ hintLevel: 1, questionType: "follow_up" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.answer_revealed).toBe(false);
        expect(data.full_answer).toBeUndefined();
        expect(data.coach_cn).toBeTruthy();
        expect(Array.isArray(data.pattern_en)).toBe(true);
        expect(data.pattern_en.length).toBeGreaterThan(0);
        expect(data.contrast).toBeTruthy();
        expect(data.next_task).toBeTruthy();
    });

    it("reveals full answer when unlock is requested and falls back to improved version", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    coach_cn: "你的句子方向对了，重点是搭配自然度。",
                    pattern_en: ["It was only after ... that ..."],
                    contrast: "直译容易平，搭配能拉开自然度。",
                    next_task: "用 It was only after... that... 造句。",
                    answer_revealed: true,
                    teaching_point: "语序与自然表达",
                })
            )
        );

        const response = await POST(buildRequest({ questionType: "unlock_answer", hintLevel: 2 }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.answer_revealed).toBe(true);
        expect(data.full_answer).toBe("When I won the lottery, a romantic spark ignited between us.");
        expect(data.answer_reason_cn).toBeTruthy();
    });

    it("parses fenced JSON and truncates pattern list to at most 2 examples", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                "```json\n" +
                JSON.stringify({
                    coach_cn: "先保主干，再放时间信息。",
                    pattern_en: ["When ..., ...", "It was only after ... that ...", "This one should be dropped"],
                    contrast: "中文常逐词对齐，英文先主干后修饰。",
                    next_task: "再改写一句包含 after 的句子。",
                    answer_revealed: false,
                    teaching_point: "时间从句",
                }) +
                "\n```"
            )
        );

        const response = await POST(buildRequest({ hintLevel: 2, questionType: "pattern" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.pattern_en.length).toBeLessThanOrEqual(2);
        expect(data.teaching_point).toBe("时间从句");
    });

    it("supports SSE streaming mode and emits final structured payload", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createStreamCompletion([
                '{"coach_cn":"你方向是对的，先调语序。",',
                '"pattern_en":["When ..., ..."],',
                '"contrast":"中式直译偏硬，英文先主干更自然。",',
                '"next_task":"用 When... 再写一句。",',
                '"answer_revealed":false,',
                '"teaching_point":"时间从句"}',
            ])
        );

        const response = await POST(buildRequest({ stream: true }));
        const bodyText = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/event-stream");
        expect(bodyText).toContain("event: chunk");
        expect(bodyText).toContain("event: final");
        expect(bodyText).toContain("\"coach_cn\":\"你方向是对的，先调语序。\"");
    });
});
