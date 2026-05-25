import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const chargeReadingCoinsMock = vi.fn();

vi.mock("@/lib/reading-economy-server", () => ({
    chargeReadingCoins: chargeReadingCoinsMock,
    insufficientReadingCoinsPayload: vi.fn(),
    isReadEconomyContext: vi.fn(() => false),
}));

describe("dictionary route", () => {
    let POSTHandler: typeof import("./route").POST;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeAll(async () => {
        ({ POST: POSTHandler } = await import("./route"));
    });

    beforeEach(() => {
        chargeReadingCoinsMock.mockReset();
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    it("falls back to normalized candidate forms when the original lookup misses", async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            } satisfies Partial<Response>)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    ec: {
                        word: [{
                            trs: [
                                { tr: [{ l: { i: ["n. 权衡；折衷"] } }] },
                            ],
                        }],
                    },
                    simple: {
                        word: [{
                            usphone: "ˈtreɪdɔːf",
                            usspeech: "tradeoff",
                        }],
                    },
                }),
            } satisfies Partial<Response>);

        const response = await POSTHandler(
            new Request("http://localhost/api/dictionary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ word: "tradeoffs" }),
            }),
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain("q=tradeoffs");
        expect(String(fetchMock.mock.calls[1]?.[0])).toContain("q=tradeoff");
        expect(data.translation).toBe("权衡；折衷");
        expect(data.audio).toContain("tradeoff");
    });
});
