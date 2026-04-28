import { describe, expect, it } from "vitest";

import {
    buildTranslationRetryInstruction,
    getTranslationDifficultyTarget,
    validateTranslationDifficulty,
} from "./translationDifficulty";

describe("translation difficulty targets", () => {
    it("uses the new single-sentence ranges at representative Elo breakpoints", () => {
        const cases = [
            { elo: 0, range: { min: 4, max: 6 }, tier: "新手" },
            { elo: 400, range: { min: 5, max: 7 }, tier: "青铜" },
            { elo: 800, range: { min: 6, max: 9 }, tier: "白银" },
            { elo: 1200, range: { min: 7, max: 11 }, tier: "黄金" },
            { elo: 1600, range: { min: 8, max: 13 }, tier: "铂金" },
            { elo: 2000, range: { min: 9, max: 15 }, tier: "钻石" },
            { elo: 2400, range: { min: 10, max: 18 }, tier: "大师" },
            { elo: 3200, range: { min: 10, max: 18 }, tier: "大师" },
        ];

        for (const testCase of cases) {
            const target = getTranslationDifficultyTarget(testCase.elo, "sentence");
            expect(target.tier.tier).toBe(testCase.tier);
            expect(target.wordRange).toEqual(testCase.range);
        }
    });

    it("keeps passage targets on the previous wider ranges", () => {
        const target = getTranslationDifficultyTarget(820, "passage");

        expect(target.tier.tier).toBe("白银");
        expect(target.wordRange).toEqual({ min: 8, max: 10 });
    });

    it("uses grammar-focused prompts instead of long-sentence prompts for sentence mode", () => {
        const target = getTranslationDifficultyTarget(1400, "sentence");

        expect(target.wordRange).toEqual({ min: 7, max: 11 });
        expect(target.syntaxBand.promptInstruction).toContain("single English sentence");
        expect(target.syntaxBand.promptInstruction).toContain("passive voice");
        expect(target.syntaxBand.promptInstruction).toContain("object clause");
    });
});

describe("translation difficulty validation", () => {
    it("uses the tighter single-sentence range for sentence mode", () => {
        const validation = validateTranslationDifficulty("I checked the car engine carefully today", 820, "sentence");

        expect(validation.wordRange).toEqual({ min: 6, max: 9 });
        expect(validation.validationRange).toEqual({ min: 5, max: 10 });
        expect(validation.status).toBe("MATCHED");
    });

    it("rejects semicolon-joined pseudo double sentences in sentence mode", () => {
        const validation = validateTranslationDifficulty("He left early; she stayed behind.", 1400, "sentence");

        expect(validation.status).toBe("TOO_HARD");
        expect(validation.isValid).toBe(false);
        expect(validation.issues).toContain("sentence mode forbids semicolons or colons");
    });

    it("rejects multiple sentence endings in sentence mode", () => {
        const validation = validateTranslationDifficulty("He apologized. She forgave him.", 1400, "sentence");

        expect(validation.status).toBe("TOO_HARD");
        expect(validation.isValid).toBe(false);
        expect(validation.issues).toContain("sentence mode requires exactly one independent sentence");
    });

    it("builds a hard-limit retry instruction when a sentence is too long", () => {
        const retryInstruction = buildTranslationRetryInstruction({
            attempt: 1,
            maxAttempts: 3,
            actualWordCount: 19,
            status: "TOO_HARD",
            target: getTranslationDifficultyTarget(1400, "sentence"),
        });

        expect(retryInstruction).toContain("Previous attempt was too long / too hard.");
        expect(retryInstruction).toContain("Next attempt MUST stay within 6-12 words.");
        expect(retryInstruction).toContain("remove any semicolon, second clause, or extra modifier");
    });
});
