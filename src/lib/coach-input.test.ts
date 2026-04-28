import { describe, expect, it } from "vitest";

import { buildCoachDrawerUserMessage, resolveCoachCurrentInput } from "./coach-input";

describe("resolveCoachCurrentInput", () => {
    it("prefers the live editor text over a stale fallback snapshot", () => {
        expect(resolveCoachCurrentInput({
            liveInput: "new answer tail",
            fallbackInput: "old answer",
        })).toBe("new answer tail");
    });

    it("falls back to the stored answer when live editor text is unavailable", () => {
        expect(resolveCoachCurrentInput({
            liveInput: "   ",
            fallbackInput: "saved answer",
        })).toBe("saved answer");
    });
});

describe("buildCoachDrawerUserMessage", () => {
    it("injects the current answer text into the freeform coach prompt", () => {
        expect(buildCoachDrawerUserMessage({
            question: "这里为什么不对？",
            currentInput: "My friend arrived late.",
        })).toContain("【当前输入框内容】：My friend arrived late.");
    });
});
