import { describe, expect, it } from "vitest";

import { buildReadPretestBundle, extractReadPretestCandidates } from "./read-pretest";

describe("read-pretest candidates", () => {
    it("extracts stable sentence candidates from article text", () => {
        const text = [
            "Many students face cost-of-living pressures, which force them to rethink daily spending.",
            "A common example is the daily coffee purchase, a small luxury that quietly drains the monthly budget.",
            "By tracking this expense for one week, a student discovered it consumed over 15% of her learning fund.",
            "This micro-case reveals how minor habits can create major financial barriers to self-investment.",
        ].join(" ");

        const candidates = extractReadPretestCandidates(text);
        expect(candidates.length).toBeGreaterThanOrEqual(4);
        expect(candidates[0]).toContain("Many students face");
    });
});

describe("read-pretest bundle", () => {
    it("builds deterministic listening/writing/translation sets by article key", () => {
        const text = [
            "Sentence one is crafted for listening practice in a warm-up test.",
            "Sentence two gives learners a chance to rewrite with similar meaning.",
            "Sentence three is suitable for translation scoring and vocabulary checks.",
            "Sentence four keeps the rhythm smooth for a lightweight pretest session.",
            "Sentence five adds extra context so sampling has enough material to pick from.",
            "Sentence six is included to make sure no single module starves for candidates.",
            "Sentence seven helps validate deterministic selection in repeated runs.",
            "Sentence eight ensures there are enough unique options for all modules.",
            "Sentence nine rounds out the pool for the final translation items.",
            "Sentence ten provides additional variety for robust extraction.",
            "Sentence eleven prevents collisions across module sampling.",
            "Sentence twelve closes the paragraph with a clear final thought.",
        ].join(" ");

        const first = buildReadPretestBundle({
            articleText: text,
            articleKey: "article://stable-seed",
        });
        const second = buildReadPretestBundle({
            articleText: text,
            articleKey: "article://stable-seed",
        });

        expect(first).toEqual(second);
        expect(first.listening).toHaveLength(5);
        expect(first.writing).toHaveLength(3);
        expect(first.translation).toHaveLength(3);
    });

    it("falls back gracefully for short text", () => {
        const bundle = buildReadPretestBundle({
            articleText: "A short article text without punctuation but still enough words for fallback chunking to work correctly.",
            articleKey: "article://tiny",
        });

        expect(bundle.listening.length).toBeGreaterThan(0);
        expect(bundle.writing.length).toBeGreaterThan(0);
        expect(bundle.translation.length).toBeGreaterThan(0);
    });
});
