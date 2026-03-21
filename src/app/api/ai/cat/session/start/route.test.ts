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

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost:3000/api/ai/cat/session/start", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

function createSupabaseMock() {
    const maybeSingle = vi.fn().mockResolvedValue({
        data: {
            cat_score: 1000,
            cat_level: 2,
            cat_theta: 0,
            cat_points: 16,
            cat_current_band: 3,
            cat_se: 1.15,
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

function taggedDraft(title: string, content: string) {
    return [
        "[Title]",
        title,
        "",
        "[Article]",
        content,
        "",
        "[LexicalMix]",
        "lower: 0.2",
        "core: 0.68",
        "stretch: 0.1",
        "overlevel: 0.02",
        "",
        "[LexicalEvidence]",
        "lower: students, class",
        "core: learning, memory, summary",
        "stretch: analysis, inference",
        "overlevel: interdisciplinary",
    ].join("\n");
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

        openaiCreateMock.mockResolvedValueOnce({
            choices: [
                {
                    message: {
                        content: taggedDraft(
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
        expect(openaiCreateMock).toHaveBeenCalledTimes(1);
        expect(deepseekCreateMock).not.toHaveBeenCalled();
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
});
