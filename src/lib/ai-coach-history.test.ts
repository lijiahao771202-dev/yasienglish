import { describe, expect, it } from "vitest";

import {
    normalizeCoachHistoryInput,
    shouldResetCoachHistoryContext,
} from "./ai-coach-history";

describe("ai-coach-history", () => {
    it("normalizes casing and whitespace before comparing history context", () => {
        expect(normalizeCoachHistoryInput("  My   Friend Was Late  ")).toBe("my friend was late");
    });

    it("keeps history when the learner is only extending the same draft", () => {
        expect(shouldResetCoachHistoryContext({
            baseline: "my friend was late",
            current: "my friend was late because of traffic",
        })).toBe(false);
    });

    it("resets history when the learner rewrites into a materially different sentence", () => {
        expect(shouldResetCoachHistoryContext({
            baseline: "my friend was late because of traffic",
            current: "a traffic jam delayed him for half an hour",
        })).toBe(true);
    });
});
