import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createServerClientMock,
    getServerUserSafelyMock,
    openaiCreateMock,
    deepseekCreateMock,
} = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    getServerUserSafelyMock: vi.fn(),
    openaiCreateMock: vi.fn(),
    deepseekCreateMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
    getServerUserSafely: getServerUserSafelyMock,
}));

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: deepseekCreateMock,
            },
        },
    },
    createDeepSeekClientForCurrentUserWithOverride: async () => ({
        chat: {
            completions: {
                create: deepseekCreateMock,
            },
        },
    }),
}));

vi.mock("openai", () => ({
    default: class MockOpenAI {
        chat = {
            completions: {
                create: openaiCreateMock,
            },
        };
    },
}));

import { POST, buildArticlePrompt } from "./route";
import { getCatArticleTargets } from "@/lib/cat-score";

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost:3000/api/ai/cat/session/start", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

function createSupabaseMock(profileOverrides: Record<string, unknown> = {}) {
    const maybeSingle = vi.fn().mockResolvedValue({
        data: {
            cat_score: 1000,
            cat_level: 2,
            cat_theta: 0,
            cat_points: 16,
            cat_current_band: 3,
            cat_se: 1.15,
            ...profileOverrides,
        },
        error: null,
    });

    const from = vi.fn((table: string) => {
        if (table === "profiles") {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        maybeSingle,
                    })),
                })),
            };
        }

        if (table === "cat_sessions") {
            return {
                insert: vi.fn(() => ({
                    select: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({
                            data: {
                                id: "session-fallback",
                                band: 3,
                                difficulty: "cet4",
                                created_at: "2026-03-21T00:00:00.000Z",
                            },
                            error: null,
                        }),
                    })),
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            };
        }

        return {
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
            })),
        };
    });

    return {
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        },
        from,
        rpc: vi.fn().mockResolvedValue({
            data: {
                session_id: "session-1",
                score_before: 1000,
                level_before: 2,
                theta_before: 0,
                band: 3,
                difficulty: "cet4",
                created_at: "2026-03-21T00:00:00.000Z",
            },
            error: null,
        }),
    };
}

function jsonDraft(title: string, content: string) {
    return JSON.stringify({
        title,
        content,
        byline: "CAT Adaptive Trainer",
        wordCount: content.split(/\s+/).filter(Boolean).length,
    });
}

describe("cat session start route", () => {
    beforeEach(() => {
        process.env.DEEPSEEK_API_KEY = "test-key";
        createServerClientMock.mockReset();
        getServerUserSafelyMock.mockReset();
        openaiCreateMock.mockReset();
        deepseekCreateMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns single-passage CAT blueprint and defers quiz generation", async () => {
        const supabase = createSupabaseMock();
        createServerClientMock.mockResolvedValue(supabase);
        getServerUserSafelyMock.mockResolvedValue({
            user: { id: "user-1" },
            error: null,
        });

        deepseekCreateMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: jsonDraft(
                            "Memory Routine",
                            "Students track notes every morning and review each paragraph in a small notebook. "
                            + "They check main ideas because repetition improves recall and supports steady reading confidence.",
                        ),
                    },
                },
            ],
        });

        const response = await POST(buildRequest({ topic: "memory and study" }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(openaiCreateMock).not.toHaveBeenCalled();
        expect(deepseekCreateMock).toHaveBeenCalledTimes(1);
        expect(data.model).toBe("deepseek-chat");
        expect(data.article.isCatMode).toBe(true);
        expect(data.article.catSessionBlueprint).toBeTruthy();
        expect(Array.isArray(data.article.catSessionBlueprint.passages)).toBe(true);
        expect(data.article.catSessionBlueprint.passages).toHaveLength(1);
        expect(Array.isArray(data.article.catSessionBlueprint.items)).toBe(true);
        expect(data.article.catSessionBlueprint.items).toHaveLength(0);
        expect(data.article.catSessionBlueprint.minItems).toBe(3);
        expect(data.article.catSessionBlueprint.maxItems).toBe(5);
        expect(data.article.catSessionBlueprint.targetSe).toBe(0.56);
        expect(data.article.catQuizBlueprint.distribution.multiple_select).toBe(0);
        expect(data.abilitySnapshot).toHaveProperty("theta");
        expect(data.abilitySnapshot).toHaveProperty("se");
    });

    it("builds article prompts from rank targets instead of short-passage scaling", () => {
        const prompt = buildArticlePrompt({
            topicSelection: {
                source: "random",
                domainId: "education",
                domainLabel: "教育与学习",
                subtopicId: "study-method",
                subtopicLabel: "学习方法",
                angle: "How retrieval practice improves long-term memory",
                topicLine: "学习方法 · How retrieval practice improves long-term memory",
            },
            targets: getCatArticleTargets(1000),
            generationTheme: {
                id: "scenario-log",
                name: "场景日志",
                directive: "Ground the passage in one realistic daily or academic scene with concrete actions and outcomes.",
            },
        });

        expect(prompt).toContain("Rank target: B2- 稳定");
        expect(prompt).toContain("Mode context:");
        expect(prompt).toContain("This mode generates one adaptive reading passage");
        expect(prompt).toContain("Rank system overview:");
        expect(prompt).toContain("600-1199: CET-4 track");
        expect(prompt).toContain("Score scale: internal CAT ladder from 0 to 3200+.");
        expect(prompt).toContain("Current rank score window: 1000-1199.");
        expect(prompt).toContain("Adjacent ranks:");
        expect(prompt).toContain("Previous: B1+ 强化 | 四级强化 / CET-4 | 800-999.");
        expect(prompt).toContain("Next: B2 预备 | 六级预备 / CET-6 Prep | 1200-1399.");
        expect(prompt).toContain("Topic context:");
        expect(prompt).toContain("Topic source: random pool for this score band.");
        expect(prompt).toContain("Topic domain: 教育与学习.");
        expect(prompt).toContain("Topic subtopic: 学习方法.");
        expect(prompt).toContain("Topic angle: How retrieval practice improves long-term memory.");
        expect(prompt).toContain("Keep the article anchored in this topic domain");
        expect(prompt).toContain("Stage meaning:");
        expect(prompt).toContain("Harder than 四级强化 (CET-4).");
        expect(prompt).toContain("Easier than 六级预备 (CET-6 Prep).");
        expect(prompt).toContain("Do not drift into:");
        expect(prompt).toContain("Difficulty control map:");
        expect(prompt).toContain("Rank-scale controls:");
        expect(prompt).toContain("wordCount 420-520");
        expect(prompt).toContain("avg sentence length 10.5-15 words");
        expect(prompt).toContain("Track-level controls:");
        expect(prompt).toContain("Vocabulary track: core=CET4 词汇; lower=高中词汇; stretch=CET6 词汇.");
        expect(prompt).toContain("Syntax density track:");
        expect(prompt).toContain("Length: wordCount 420-520");
        expect(prompt).toContain("average sentence length");
        expect(prompt).toContain("Question-generation readiness:");
        expect(prompt).toContain("evidence traceability");
        expect(prompt).not.toContain("short passage");
        expect(prompt).not.toContain("2-3 coherent short paragraphs");
        expect(prompt).not.toContain("2-3 short paragraphs of article content");
    });

    it("returns a JSON error payload when article generation throws", async () => {
        const supabase = createSupabaseMock();
        createServerClientMock.mockResolvedValue(supabase);
        getServerUserSafelyMock.mockResolvedValue({
            user: { id: "user-1" },
            error: null,
        });

        deepseekCreateMock.mockRejectedValueOnce(new Error("provider unavailable"));

        const response = await POST(buildRequest({ topic: "memory and study" }));
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data).toEqual({ error: "provider unavailable" });
    });

    it("applies a one-shot difficulty signal hint to the next CAT passage targets", async () => {
        const supabase = createSupabaseMock({ cat_score: 900 });
        createServerClientMock.mockResolvedValue(supabase);
        getServerUserSafelyMock.mockResolvedValue({
            user: { id: "user-1" },
            error: null,
        });

        deepseekCreateMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: jsonDraft(
                            "Study Sprint",
                            "Students compare two revision plans before an exam and describe which routine improves recall, attention, and confidence during a busy week.",
                        ),
                    },
                },
            ],
        });

        const response = await POST(buildRequest({
            topic: "memory and study",
            difficultySignalHint: 1,
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.article.catDifficultyProfile.wordCount).toEqual([420, 520]);
        expect(data.article.catQuizBlueprint.score).toBe(1060);
    });
});
