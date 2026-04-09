import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createServerClientMock,
    getServerUserSafelyMock,
    rewardReadingCoinsMock,
} = vi.hoisted(() => ({
    createServerClientMock: vi.fn(),
    getServerUserSafelyMock: vi.fn(),
    rewardReadingCoinsMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
    createServerClient: createServerClientMock,
    getServerUserSafely: getServerUserSafelyMock,
}));

vi.mock("@/lib/reading-economy-server", () => ({
    rewardReadingCoins: rewardReadingCoinsMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
    return new Request("http://localhost:3000/api/ai/cat/session/submit", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

function createSupabaseMock(options?: {
    session?: Record<string, unknown>;
    profile?: Record<string, unknown>;
}) {
    const sessionMaybeSingle = vi.fn().mockResolvedValue({
        data: {
            id: "session-1",
            user_id: "user-1",
            difficulty: "cet6",
            band: 4,
            status: "started",
            score_before: 1200,
            ...(options?.session ?? {}),
        },
        error: null,
    });

    const profileSingle = vi.fn().mockResolvedValue({
        data: {
            user_id: "user-1",
            cat_score: 1200,
            cat_level: 2,
            cat_theta: -0.2,
            cat_se: 1.1,
            cat_points: 10,
            cat_current_band: 4,
            reading_coins: 40,
            ...(options?.profile ?? {}),
        },
        error: null,
    });

    const from = vi.fn((table: string) => {
        if (table === "cat_sessions") {
            const selectChain = {
                eq: vi.fn(() => selectChain),
                maybeSingle: sessionMaybeSingle,
                order: vi.fn(() => ({
                    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                })),
            };
            return {
                select: vi.fn(() => selectChain),
                update: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    })),
                })),
            };
        }
        if (table === "profiles") {
            return {
                select: vi.fn(() => ({
                    eq: vi.fn(() => ({
                        single: profileSingle,
                    })),
                })),
                update: vi.fn(() => ({
                    eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            };
        }
        if (table === "cat_session_items") {
            return {
                insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
            };
        }
        if (table === "user_cat_badges") {
            return {
                upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
            };
        }
        return {
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
                    })),
                })),
            })),
        };
    });

    const rpc = vi.fn().mockImplementation(async (_fn: string, params: Record<string, unknown>) => ({
        data: {
            session_id: "session-1",
            cat_score: 1200 + Number(params.p_delta ?? 0),
            cat_level: 2,
            cat_theta: -0.05,
            cat_points: 10 + Number(params.p_points_delta ?? 0),
            cat_current_band: Number(params.p_next_band ?? 4),
            delta: Number(params.p_delta ?? 0),
            points_delta: Number(params.p_points_delta ?? 0),
            next_band: Number(params.p_next_band ?? 4),
            awarded_badges: [],
        },
        error: null,
    }));

    return {
        from,
        rpc,
    };
}

describe("cat session submit route", () => {
    beforeEach(() => {
        createServerClientMock.mockReset();
        getServerUserSafelyMock.mockReset();
        rewardReadingCoinsMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("supports rasch responses payload and returns animation/session metadata", async () => {
        const supabase = createSupabaseMock();
        createServerClientMock.mockResolvedValue(supabase);
        getServerUserSafelyMock.mockResolvedValue({
            user: { id: "user-1" },
            error: null,
        });
        rewardReadingCoinsMock.mockResolvedValue({
            balance: 48,
            delta: 8,
            applied: true,
        });

        const response = await POST(buildRequest({
            sessionId: "session-1",
            responses: [
                { itemId: "q1", order: 1, correct: true, latencyMs: 8000, itemDifficulty: -0.1, answer: "A" },
                { itemId: "q2", order: 2, correct: true, latencyMs: 9000, itemDifficulty: 0.1, answer: "B" },
                { itemId: "q3", order: 3, correct: false, latencyMs: 10000, itemDifficulty: 0.2, answer: "A" },
                { itemId: "q4", order: 4, correct: true, latencyMs: 11000, itemDifficulty: 0.3, answer: "C" },
                { itemId: "q5", order: 5, correct: true, latencyMs: 12000, itemDifficulty: 0.4, answer: ["A", "C"] },
            ],
            qualityTier: "ok",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.session.mode).toBe("rasch");
        expect(data.session.policyUsed).toMatchObject({
            minItems: 3,
            maxItems: 5,
            targetSe: 0.56,
        });
        expect(data.session.itemCount).toBeGreaterThanOrEqual(data.session.policyUsed.minItems);
        expect(data.session.itemCount).toBeLessThanOrEqual(data.session.policyUsed.maxItems);
        expect(typeof data.session.stopReason).toBe("string");
        expect(data.cat).toHaveProperty("se");
        expect(data.animationPayload).toHaveProperty("scoreBefore");
        expect(data.animationPayload).toHaveProperty("scoreAfter");
    });

    it("applies CAT self-assessment correction and returns assessment metadata", async () => {
        const supabase = createSupabaseMock();
        createServerClientMock.mockResolvedValue(supabase);
        getServerUserSafelyMock.mockResolvedValue({
            user: { id: "user-1" },
            error: null,
        });
        rewardReadingCoinsMock.mockResolvedValue({
            balance: 47,
            delta: 7,
            applied: true,
        });

        const response = await POST(buildRequest({
            sessionId: "session-1",
            responses: [
                { itemId: "q1", order: 1, correct: true, latencyMs: 8000, itemDifficulty: -0.2, answer: "A" },
                { itemId: "q2", order: 2, correct: true, latencyMs: 8500, itemDifficulty: -0.1, answer: "B" },
                { itemId: "q3", order: 3, correct: true, latencyMs: 9000, itemDifficulty: 0.1, answer: "C" },
                { itemId: "q4", order: 4, correct: true, latencyMs: 9500, itemDifficulty: 0.2, answer: "D" },
                { itemId: "q5", order: 5, correct: true, latencyMs: 10000, itemDifficulty: 0.3, answer: "A" },
            ],
            qualityTier: "ok",
            selfAssessment: "easy",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.session.selfAssessment).toBe("easy");
        expect(data.session.systemAssessment).toBe("too_easy");
        expect(typeof data.session.objectiveDelta).toBe("number");
        expect(data.session.delta).toBe(Math.min(66, data.session.objectiveDelta + data.session.scoreCorrection));
        expect(data.session.scoreCorrection).toBe(12);
        expect(data.session.delta).toBeGreaterThanOrEqual(12);
        expect(data.session.difficultySignal).toBe(1);
    });

    it("returns a JSON 500 instead of crashing when an unexpected submit error is thrown", async () => {
        getServerUserSafelyMock.mockRejectedValue(new TypeError("fetch failed"));

        const response = await POST(buildRequest({
            sessionId: "session-1",
        }));
        const data = await response.json();

        expect(response.status).toBe(500);
        expect(data.error).toBe("fetch failed");
    });

    it("returns stored settlement metadata when a completed session is retried", async () => {
        const supabase = createSupabaseMock({
            session: {
                status: "completed",
                delta: -48,
                score_after: 808,
                session_blueprint: {
                    settlement: {
                        objectiveDelta: -42,
                        systemAssessment: "too_hard",
                        selfAssessment: "just_right",
                        scoreCorrection: -6,
                        difficultySignal: -0.4,
                    },
                },
            },
            profile: {
                cat_score: 808,
            },
        });
        createServerClientMock.mockResolvedValue(supabase);
        getServerUserSafelyMock.mockResolvedValue({
            user: { id: "user-1" },
            error: null,
        });

        const response = await POST(buildRequest({
            sessionId: "session-1",
            selfAssessment: "just_right",
        }));
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.alreadyCompleted).toBe(true);
        expect(data.session.objectiveDelta).toBe(-42);
        expect(data.session.systemAssessment).toBe("too_hard");
        expect(data.session.selfAssessment).toBe("just_right");
        expect(data.session.scoreCorrection).toBe(-6);
        expect(data.session.difficultySignal).toBe(-0.4);
    });
});
