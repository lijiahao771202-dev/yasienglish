import { describe, expect, it } from "vitest";

import {
    buildDailyLoginDedupeKey,
    buildQuizCompleteDedupeKey,
    buildReadCompleteDedupeKey,
    buildWordLookupDedupeKey,
    getReadingCoinCost,
    getReadingCoinReward,
    INSUFFICIENT_READING_COINS,
} from "./reading-economy";

describe("reading economy", () => {
    it("exports insufficient code for business handling", () => {
        expect(INSUFFICIENT_READING_COINS).toBe("INSUFFICIENT_READING_COINS");
    });

    it("returns expected costs and rewards", () => {
        expect(getReadingCoinCost("translate")).toBe(1);
        expect(getReadingCoinCost("grammar_deep")).toBe(3);
        expect(getReadingCoinCost("quiz_complete")).toBe(0);
        expect(getReadingCoinReward("daily_login")).toBe(8);
        expect(getReadingCoinReward("quiz_complete")).toBe(6);
        expect(getReadingCoinReward("ask_ai")).toBe(0);
    });

    it("builds stable dedupe keys", () => {
        expect(
            buildWordLookupDedupeKey({
                userId: "u1",
                articleUrl: "HTTPS://A.com/Path",
                word: " Memory ",
            }),
        ).toBe("word_lookup:u1:https://a.com/path:memory");

        expect(buildReadCompleteDedupeKey({ userId: "u1", articleUrl: "Article-1" }))
            .toBe("read_complete:u1:article-1");
        expect(buildQuizCompleteDedupeKey({ userId: "u1", articleUrl: "Article-1" }))
            .toBe("quiz_complete:u1:article-1");
        expect(buildDailyLoginDedupeKey({ userId: "u1", dateKey: "2026-03-20" }))
            .toBe("daily_login:u1:2026-03-20");
    });
});
