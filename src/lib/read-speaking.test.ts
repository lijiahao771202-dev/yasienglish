import { describe, expect, it } from "vitest";

import {
    alignTokensToMarks,
    buildAutoSentenceBoundaries,
    buildSentenceUnits,
    extractWordTokens,
    shiftSentenceBoundaryBySteps,
    type TtsWordMark,
} from "./read-speaking";

describe("read-speaking segmentation", () => {
    it("builds contiguous sentence units without overlap", () => {
        const text = "Hello world.  This is line two!\nAnd line three?";
        const boundaries = buildAutoSentenceBoundaries(text);
        const units = buildSentenceUnits(text, boundaries);

        expect(boundaries[0]).toBe(0);
        expect(boundaries[boundaries.length - 1]).toBe(text.length);

        for (let index = 0; index < boundaries.length - 1; index += 1) {
            expect(boundaries[index + 1]).toBeGreaterThan(boundaries[index]);
        }

        for (let index = 0; index < units.length - 1; index += 1) {
            expect(units[index].end).toBeLessThanOrEqual(units[index + 1].start);
        }

        const reconstructed = boundaries
            .slice(0, -1)
            .map((start, index) => text.slice(start, boundaries[index + 1]))
            .join("");
        expect(reconstructed).toBe(text);
        expect(units.map((unit) => unit.speakText)).toEqual([
            "Hello world.",
            "This is line two!",
            "And line three?",
        ]);
    });

    it("does not create standalone punctuation units from spaced ellipses", () => {
        const text = "\"remembering the old routine. . . feeling tightness in the jaw. . . sense of panic rising. . . judging myself for feeling weak. .\" This intensive articulation prevents the mind from weaving a coherent narrative.";
        const units = buildSentenceUnits(text, buildAutoSentenceBoundaries(text));

        expect(units.map((unit) => unit.speakText)).toEqual([
            "\"remembering the old routine...",
            "feeling tightness in the jaw...",
            "sense of panic rising...",
            "judging myself for feeling weak...\"",
            "This intensive articulation prevents the mind from weaving a coherent narrative.",
        ]);
        expect(units.every((unit) => /[A-Za-z0-9]/.test(unit.speakText))).toBe(true);
    });

    it("shifts one boundary in word-aligned steps", () => {
        const text = "Alpha beta gamma. Delta epsilon zeta.";
        const initial = buildAutoSentenceBoundaries(text);

        const movedForward = shiftSentenceBoundaryBySteps({
            text,
            boundaries: initial,
            boundaryIndex: 1,
            steps: 1,
        });

        const movedBackward = shiftSentenceBoundaryBySteps({
            text,
            boundaries: movedForward,
            boundaryIndex: 1,
            steps: -1,
        });

        expect(movedForward[1]).not.toBe(initial[1]);
        expect(movedBackward[1]).toBeLessThanOrEqual(movedForward[1]);
        expect(Math.abs(movedBackward[1] - initial[1])).toBeLessThanOrEqual(1);
    });
});

describe("read-speaking mark alignment", () => {
    it("maps repeated word tokens to matching mark indices in order", () => {
        const text = "we test and we test again";
        const tokens = extractWordTokens(text);
        const marks: TtsWordMark[] = [
            { time: 0, start: 0, end: 150, type: "word", value: "we" },
            { time: 160, start: 160, end: 300, type: "word", value: "test" },
            { time: 320, start: 320, end: 470, type: "word", value: "and" },
            { time: 480, start: 480, end: 620, type: "word", value: "we" },
            { time: 630, start: 630, end: 770, type: "word", value: "test" },
            { time: 790, start: 790, end: 980, type: "word", value: "again" },
        ];

        const aligned = alignTokensToMarks(tokens, marks);
        expect(aligned.get(0)).toBe(0);
        expect(aligned.get(1)).toBe(1);
        expect(aligned.get(3)).toBe(3);
        expect(aligned.get(4)).toBe(4);
        expect(aligned.get(5)).toBe(5);
    });

    it("keeps hyphenated words aligned as a single spoken unit", () => {
        const text = "Many organizations hold hour-long weekly status meetings.";
        const tokens = extractWordTokens(text);
        const marks: TtsWordMark[] = [
            { time: 0, start: 0, end: 200, type: "word", value: "Many" },
            { time: 210, start: 210, end: 520, type: "word", value: "organizations" },
            { time: 530, start: 530, end: 700, type: "word", value: "hold" },
            { time: 710, start: 710, end: 980, type: "word", value: "hour-long" },
            { time: 990, start: 990, end: 1180, type: "word", value: "weekly" },
            { time: 1190, start: 1190, end: 1450, type: "word", value: "status" },
            { time: 1460, start: 1460, end: 1750, type: "word", value: "meetings" },
        ];

        expect(tokens.map((token) => token.text)).toContain("hour-long");

        const aligned = alignTokensToMarks(tokens, marks);
        const hyphenTokenIndex = tokens.findIndex((token) => token.text === "hour-long");
        expect(hyphenTokenIndex).toBeGreaterThanOrEqual(0);
        expect(aligned.get(hyphenTokenIndex)).toBe(3);
    });
});
