import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: createMock,
            },
        },
    },
}));

describe("optimize longform style route", () => {
    let POSTHandler: typeof import("./route").POST;

    beforeAll(async () => {
        ({ POST: POSTHandler } = await import("./route"));
    });

    beforeEach(() => {
        createMock.mockReset();
    });

    it("rewrites the user's raw style request into a clearer longform addendum without changing difficulty", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            optimizedPrompt: "Write in a patient, highly readable explanatory style. Unpack the theory step by step, clarify key mechanisms with plain-language restatements, and keep the prose easy to follow without lowering the selected exam difficulty.",
                        }),
                    },
                },
            ],
        });

        const response = await POSTHandler(
            new Request("http://localhost/api/ai/optimize-longform-style", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet6",
                    rawPrompt: "把这个主题的理论写得详细清楚，通俗易懂一点",
                }),
            }),
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data.optimizedPrompt).toContain("patient, highly readable explanatory style");
        expect(data.optimizedPrompt).toContain("without lowering the selected exam difficulty");

        const request = createMock.mock.calls.at(-1)?.[0];
        const prompt = request?.messages?.[0]?.content as string;
        expect(prompt).toContain("Difficulty track: cet6");
        expect(prompt).toContain("Do not change or weaken the exam difficulty");
        expect(prompt).toContain("把这个主题的理论写得详细清楚，通俗易懂一点");
    });
});
