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

function createBrokenStreamCompletion(chunks: string[]) {
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

        throw new Error("stream interrupted");
    }

    return iterator();
}

function buildRequest(
    overrides: Partial<{
        query: string;
        questionType: string;
        action: string;
        uiSurface: string;
        intent: string;
        answerMode: string;
        focusSpan: string;
        userAttempt: string;
        improvedVersion: string;
        score: number;
        recentTurns: Array<{ question: string; answer: string }>;
        recentMastery: string[];
        teachingPoint: string;
        stream: boolean;
        revealAnswer: boolean;
        articleTitle: string;
        drillContext: {
            chinese: string;
            reference_english: string;
            key_vocab?: string[];
        };
    }> = {},
) {
    return {
        json: async () => ({
            query: "为什么这里用 ignite？",
            questionType: "follow_up",
            action: "ask",
            uiSurface: "battle",
            intent: "lexical",
            answerMode: "adaptive",
            focusSpan: "ignite",
            userAttempt: "When I won the lottery, love started.",
            improvedVersion: "When I won the lottery, a romantic spark ignited between us.",
            score: 78,
            teachingPoint: "词汇搭配与语气",
            recentTurns: [],
            recentMastery: [],
            stream: false,
            revealAnswer: false,
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

    it("returns battle responses without cards", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "word_meaning",
                    coach_markdown: "1. **ignite** 在这里更像“点燃、激起”。\n2. 你前面已经会 spark，这次只补 ignite 的动作感。",
                    answer_revealed: false,
                    teaching_point: "词汇搭配与语气",
                    error_tags: ["word_choice", "collocation"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest());
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.cards).toBeUndefined();
        expect(data.coach_markdown).toContain("你前面已经");
    });

    it("does not reveal full answer on ordinary battle follow-ups", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "full_sentence",
                    coach_markdown: "1. 你已经知道 intention 这个词。\n2. 这次只补“搞不懂”这个状态表达，不直接展开整句。",
                    answer_revealed: true,
                    full_answer: "SHOULD_NOT_LEAK",
                    teaching_point: "语序与自然表达",
                    error_tags: ["grammar"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({
            query: "搞不懂怎么翻译呢",
            focusSpan: "搞不懂",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.response_intent).toBe("partial_phrase");
        expect(data.answer_revealed).toBe(false);
        expect(data.full_answer).toBeUndefined();
    });

    it("reveals full answer only when unlock is explicitly requested", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "unlock_answer",
                    coach_markdown: "**这里先这样说：** `When I won the lottery, a romantic spark ignited between us.`",
                    answer_revealed: true,
                    full_answer: "When I won the lottery, a romantic spark ignited between us.",
                    answer_reason_cn: "这里直接用 spark ignited between us 会更自然。",
                    teaching_point: "语序与自然表达",
                    error_tags: ["word_order"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({ questionType: "unlock_answer", revealAnswer: true }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.answer_revealed).toBe(true);
        expect(data.full_answer).toBe("When I won the lottery, a romantic spark ignited between us.");
    });

    it("repairs collapsed english inside markdown", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "collocation",
                    coach_markdown: "1. **break** 更自然，比如 `coffeebreak`。\n2. 在这个语境里，`anintensecompetitionbreak` 也会被修开。",
                    answer_revealed: false,
                    teaching_point: "搭配辨析",
                    error_tags: ["collocation"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({
            query: "间隙怎么搭配更自然",
            focusSpan: "间隙",
        }));
        const data = await response.json();

        expect(data.coach_markdown).toContain("coffee break");
        expect(data.coach_markdown).toContain("an intense competition break");
        expect(data.cards).toBeUndefined();
    });

    it("repairs collapsed short phrasal verbs and sentence runs from the reference sentence", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "word_meaning",
                    coach_markdown: `**"Sorry,Iforgottoturnoffthelights."** 里，turnoff 对应的其实是 turn off。`,
                    answer_revealed: true,
                    full_answer: "Sorry,Iforgottoturnoffthelights.",
                    answer_reason_cn: "turnoff 是这句里的固定短语。",
                    teaching_point: "动词短语",
                    error_tags: ["collocation"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({
            uiSurface: "rebuild_floating_teacher",
            intent: "rebuild",
            query: "turnoff是什么意思？",
            focusSpan: "turnoff",
            revealAnswer: true,
            questionType: "unlock_answer",
            improvedVersion: "Sorry, I forgot to turn off the lights.",
            drillContext: {
                chinese: "对不起，我忘记关灯了。",
                reference_english: "Sorry, I forgot to turn off the lights.",
                key_vocab: ["turn off", "lights"],
            },
        }));
        const data = await response.json();

        expect(data.coach_markdown).toContain("turn off");
        expect(data.coach_markdown).toContain("I forgot to turn off the lights");
        expect(data.full_answer).toBe("Sorry, I forgot to turn off the lights.");
        expect(data.answer_reason_cn).toContain("turn off");
    });

    it("repairs long collapsed english runs and mixed chinese-english spacing", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "word_meaning",
                    coach_markdown: "在句子they noted what went well里，它比说thethingsthatwentwell更自然。",
                    answer_revealed: false,
                    teaching_point: "名词性从句",
                    error_tags: ["grammar"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({
            uiSurface: "rebuild_floating_teacher",
            intent: "rebuild",
            query: "what went well什么意思？",
            focusSpan: "what went well",
            improvedVersion: "They noted what went well.",
            drillContext: {
                chinese: "他们注意到了顺利之处。",
                reference_english: "They noted what went well.",
            },
        }));
        const data = await response.json();

        expect(data.coach_markdown).toContain("句子 they noted what went well 里");
        expect(data.coach_markdown).toContain("the things that went well");
    });

    it("repairs collapsed follow-up collocations", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "collocation",
                    coach_markdown: "你可以把它和 followuponsomething 对比记忆：而 followupwithsomeone 是‘与某人进行跟进’。",
                    answer_revealed: false,
                    teaching_point: "固定搭配",
                    error_tags: ["collocation"],
                    quality_flags: [],
                }),
            ),
        );

        const response = await POST(buildRequest({
            uiSurface: "rebuild_floating_teacher",
            intent: "rebuild",
            query: "follow up with什么意思？",
            focusSpan: "follow up with",
            improvedVersion: "I will follow up with them tomorrow.",
            drillContext: {
                chinese: "我明天会和他们继续跟进。",
                reference_english: "I will follow up with them tomorrow.",
            },
        }));
        const data = await response.json();

        expect(data.coach_markdown).toContain("follow up on something");
        expect(data.coach_markdown).toContain("follow up with someone");
    });

    it("returns structured example sentences with joined english tokens", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "pattern",
                    coach_markdown: "这个骨架可以直接迁移，例句见下方。",
                    answer_revealed: false,
                    teaching_point: "句型迁移",
                    error_tags: ["grammar"],
                    quality_flags: [],
                    example_sentences: [
                        {
                            label_cn: "同结构例句",
                            sentence_en_tokens: ["I", "live", "in", "London", "and", "am", "familiar", "with", "its", "transit", "system", "."],
                            note_cn: "这里只是把城市和系统名换掉。",
                        },
                    ],
                }),
            ),
        );

        const response = await POST(buildRequest({
            uiSurface: "rebuild_floating_teacher",
            intent: "rebuild",
            query: "来个相同结构的句子",
            questionType: "example",
            focusSpan: "and am familiar with",
        }));
        const data = await response.json();

        expect(data.coach_markdown).toContain("例句见下方");
        expect(data.example_sentences).toEqual([
            expect.objectContaining({
                label_cn: "同结构例句",
                sentence_en: "I live in London and am familiar with its transit system.",
                sentence_en_tokens: ["I", "live", "in", "London", "and", "am", "familiar", "with", "its", "transit", "system", "."],
            }),
        ]);
    });

    it("uses the battle prompt without gradual hint wording or cards schema", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    response_intent: "word_meaning",
                    coach_markdown: "1. **spare key** 就是备用钥匙。",
                    answer_revealed: false,
                    teaching_point: "词汇搭配与语气",
                    error_tags: ["word_choice"],
                    quality_flags: [],
                }),
            ),
        );

        await POST(buildRequest({
            query: "备用钥匙什么意思",
            focusSpan: "备用钥匙",
        }));

        const prompt = createCompletionMock.mock.calls[0]?.[0]?.messages?.[1]?.content ?? "";
        expect(prompt).not.toContain("渐进引导");
        expect(prompt).not.toContain("\"cards\"");
        expect(prompt).toContain("Known knowledge to connect from");
    });

    it("recovers with a final payload when battle stream is interrupted", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createBrokenStreamCompletion([
                '{"coach_markdown":"1. **先别逐词翻。**\\n2. 这次只补当前这个词块',
            ]),
        );

        const response = await POST(buildRequest({ stream: true }));
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain("event: final");
        expect(body).not.toContain("event: error");
    });

    it("keeps rebuild floating teacher as its own surface instead of collapsing to score", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    coach_markdown: "### 先看骨架\n\n| 点 | 解释 |\n| --- | --- |\n| **ignite** | 这里强调动作被点燃。 |",
                    answer_revealed: false,
                    teaching_point: "标准表达与短语搭配",
                    error_tags: ["collocation"],
                }),
            ),
        );

        await POST(buildRequest({
            uiSurface: "rebuild_floating_teacher",
            intent: "rebuild",
            focusSpan: "ignite between us",
            query: "这里为什么用 ignite between us？",
        }));

        const prompt = createCompletionMock.mock.calls[0]?.[0]?.messages?.[1]?.content ?? "";
        expect(prompt).toContain('Surface: "rebuild_floating_teacher"');
        expect(prompt).toContain("coach_markdown 至少包含一种 Markdown 标记");
        expect(prompt).toContain("example_sentences");
        expect(prompt).toContain("sentence_en_tokens");
        expect(prompt).not.toContain('Surface: "score"');
    });

    it("uses adaptive simple profile by default for short rebuild questions", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    coach_markdown: "**turn off** 就是“关掉”。",
                    answer_revealed: false,
                    teaching_point: "动词短语",
                    error_tags: ["collocation"],
                }),
            ),
        );

        await POST(buildRequest({
            uiSurface: "rebuild_floating_teacher",
            intent: "rebuild",
            query: "turn off什么意思？",
            answerMode: "adaptive",
            focusSpan: "turn off",
        }));

        const requestPayload = createCompletionMock.mock.calls[0]?.[0] ?? {};
        const prompt = requestPayload.messages?.[1]?.content ?? "";
        expect(prompt).toContain('Answer Length Mode: "adaptive"');
        expect(prompt).toContain('Detected Complexity: "simple"');
        expect(prompt).toContain('Response Profile: "adaptive_simple"');
        expect(requestPayload.max_tokens).toBe(520);
    });

    it("uses forced short profile when rebuild answer mode is simple", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    coach_markdown: "**ignite** 在这里强调“被点燃”。",
                    answer_revealed: false,
                    teaching_point: "词义",
                    error_tags: ["word_choice"],
                }),
            ),
        );

        await POST(buildRequest({
            uiSurface: "rebuild_floating_teacher",
            intent: "rebuild",
            query: "这里为什么用 ignite？",
            answerMode: "simple",
            focusSpan: "ignite",
        }));

        const requestPayload = createCompletionMock.mock.calls[0]?.[0] ?? {};
        const prompt = requestPayload.messages?.[1]?.content ?? "";
        expect(prompt).toContain('Answer Length Mode: "simple"');
        expect(prompt).toContain('Response Profile: "forced_short"');
        expect(requestPayload.max_tokens).toBe(520);
    });

    it("uses forced detailed profile for rebuild score tutor when requested", async () => {
        createCompletionMock.mockResolvedValueOnce(
            createCompletion(
                JSON.stringify({
                    coach_markdown: "**watch others read** 这里不是逐词拼，而是一个完整动作画面。",
                    answer_revealed: false,
                    teaching_point: "句意展开",
                    error_tags: ["grammar"],
                }),
            ),
        );

        await POST(buildRequest({
            uiSurface: "score",
            intent: "rebuild",
            query: "详细讲讲为什么这里用 watches others read，而不是别的写法？",
            answerMode: "detailed",
            focusSpan: "watches others read",
            improvedVersion: "He has no money for books, so he watches others read.",
            drillContext: {
                chinese: "他没钱买书，所以只能看别人阅读。",
                reference_english: "He has no money for books, so he watches others read.",
            },
        }));

        const requestPayload = createCompletionMock.mock.calls[0]?.[0] ?? {};
        const prompt = requestPayload.messages?.[1]?.content ?? "";
        expect(prompt).toContain('Answer Length Mode: "detailed"');
        expect(prompt).toContain('Response Profile: "forced_detailed"');
        expect(requestPayload.max_tokens).toBe(1200);
    });
});
