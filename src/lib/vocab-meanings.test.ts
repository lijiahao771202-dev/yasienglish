import { describe, expect, it } from "vitest";

import {
    parseMeaningGroups,
    pickPreferredMeaningGroups,
    resolveHighlightedMeaningsFromGroups,
} from "./vocab-meanings";

describe("parseMeaningGroups", () => {
    it("prefers Chinese translation meanings instead of mixing in English definitions", () => {
        expect(
            parseMeaningGroups(
                "n. A military fight between armed forces",
                "n. 战斗；交战",
                "battle",
            ),
        ).toEqual([{ pos: "n.", meanings: ["战斗", "交战"] }]);
    });
});

describe("pickPreferredMeaningGroups", () => {
    it("prefers the fallback groups when they contain more Chinese meaning content", () => {
        expect(
            pickPreferredMeaningGroups(
                [{ pos: "n.", meanings: ["A military fight between armed forces"] }],
                [{ pos: "n.", meanings: ["战斗", "交战"] }],
            ),
        ).toEqual([{ pos: "n.", meanings: ["战斗", "交战"] }]);
    });

    it("keeps the primary groups when they already carry the richer Chinese meanings", () => {
        expect(
            pickPreferredMeaningGroups(
                [{ pos: "v.", meanings: ["向团队传达消息", "转告"] }],
                [{ pos: "v.", meanings: ["relay the news"] }],
            ),
        ).toEqual([{ pos: "v.", meanings: ["向团队传达消息", "转告"] }]);
    });
});

describe("resolveHighlightedMeaningsFromGroups", () => {
    it("maps AI highlighted meanings back onto the actual displayed meaning strings", () => {
        expect(
            resolveHighlightedMeaningsFromGroups(
                [{ pos: "v.", meanings: ["⚡ 转达消息", "传递"] }],
                ["转达消息"],
            ),
        ).toEqual(["⚡ 转达消息"]);
    });

    it("returns no highlight when the AI-provided highlighted meaning does not match any displayed meaning", () => {
        expect(
            resolveHighlightedMeaningsFromGroups(
                [{ pos: "n.", meanings: ["战役，战争", "争论，斗争"] }],
                ["A military fight between armed forces"],
            ),
        ).toEqual([]);
    });
});
