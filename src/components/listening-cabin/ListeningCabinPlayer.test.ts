import { describe, expect, it } from "vitest";
import { getSentenceGroups, getWordDisplayInfo, getGroupTimeBounds } from "./ListeningCabinPlayer";

describe("ListeningCabinPlayer Helpers", () => {
    describe("getSentenceGroups", () => {
        it("splits words by punctuation boundaries", () => {
            const words = ["Hello,", "how", "are", "you?", "I'm", "fine."];
            const groups = getSentenceGroups(words);
            
            // "Hello," -> boundary
            // "how", "are", "you?" -> boundary
            // "I'm", "fine." -> boundary
            expect(groups).toEqual([
                [0],
                [1, 2, 3],
                [4, 5]
            ]);
        });

        it("respects the maximum group length limit of 6 words", () => {
            const words = ["one", "two", "three", "four", "five", "six", "seven", "eight."];
            const groups = getSentenceGroups(words);

            expect(groups).toEqual([
                [0, 1, 2, 3, 4, 5],
                [6, 7]
            ]);
        });

        it("handles ending punctuation with trailing quotes or brackets", () => {
            const words = ['"Yes,"', "he", "said.", '"Hello!"'];
            const groups = getSentenceGroups(words);

            expect(groups).toEqual([
                [0],
                [1, 2],
                [3]
            ]);
        });

        it("groups words by provided senseGroups array", () => {
            const words = ["Hello,", "world!", "How", "are", "you", "doing?"];
            const senseGroups = ["Hello, world!", "How are you doing?"];
            const groups = getSentenceGroups(words, senseGroups);

            expect(groups).toEqual([
                [0, 1],
                [2, 3, 4, 5]
            ]);
        });

        it("handles mismatched words and senseGroups count gracefully", () => {
            const words = ["Hello,", "world!", "How", "are", "you", "doing?", "extra", "words"];
            const senseGroups = ["Hello, world!", "How are you doing?"];
            const groups = getSentenceGroups(words, senseGroups);

            // Mismatched extra words should be appended to the last group
            expect(groups).toEqual([
                [0, 1],
                [2, 3, 4, 5, 6, 7]
            ]);
        });
    });

    describe("getWordDisplayInfo", () => {
        it("returns original word if blur is disabled", () => {
            const result = getWordDisplayInfo("hello", 0, 0, "direct", 0, false);
            expect(result).toEqual({ text: "hello", isBlurred: false });
        });

        it("reveals words in direct mode based on revealedGroupsCount", () => {
            // Group 0 revealed, group 1 not
            const word1 = getWordDisplayInfo("hello,", 0, 1, "direct", 0, true);
            const word2 = getWordDisplayInfo("world", 1, 1, "direct", 0, true);

            expect(word1).toEqual({ text: "hello,", isBlurred: false });
            expect(word2).toEqual({ text: "world", isBlurred: true });
        });

        it("shows progressive mode skeletons for the current hint group", () => {
            // Group 1 is the current hint group
            const word1 = getWordDisplayInfo("hello", 0, 1, "progressive", 0, true); // previously revealed group
            const word2 = getWordDisplayInfo("world,", 1, 1, "progressive", 0, true); // current hint group -> skeleton
            const word3 = getWordDisplayInfo("peace", 2, 1, "progressive", 0, true);  // subsequent group -> blurred

            expect(word1).toEqual({ text: "hello", isBlurred: false });
            expect(word2).toEqual({ text: "w____,", isBlurred: false });
            expect(word3).toEqual({ text: "peace", isBlurred: true });
        });

        it("supports adaptive mode auto-reveals with replayCount", () => {
            // Replay count is 1: group 0 is auto-revealed
            const word1 = getWordDisplayInfo("hello", 0, 0, "adaptive", 1, true);
            const word2 = getWordDisplayInfo("world", 1, 0, "adaptive", 1, true);

            expect(word1).toEqual({ text: "hello", isBlurred: false });
            expect(word2).toEqual({ text: "world", isBlurred: true });
        });
    });

    describe("getGroupTimeBounds", () => {
        it("returns full sentence duration if group is not found", () => {
            const words = ["hello", "world"];
            const bounds = getGroupTimeBounds(words, 999, 1000, 3000);
            expect(bounds).toEqual({ startMs: 1000, endMs: 3000 });
        });

        it("calculates correct startMs and endMs for groups using character length ratio", () => {
            // "hello," and "world" — both interpolated (no raw word timings provided).
            // Since all timings are interpolated, firstWordRawStart falls back to sentenceStartMs.
            // hello, weight: 5 (chars) + 2.5 (comma pause) = 7.5
            // world weight: 5 + 0 = 5
            // total: 12.5, duration 2000ms
            // hello,: startMs=1000, endMs=1000+2000*(7.5/12.5)=2200. isInterpolated=true.
            // world: startMs=2200, endMs=3000. isInterpolated=true.
            const words = ["hello,", "world"];
            
            // Sentence starts at 1000ms, ends at 3000ms (duration 2000ms)
            const group0 = getGroupTimeBounds(words, 0, 1000, 3000);
            const group1 = getGroupTimeBounds(words, 1, 1000, 3000);

            // group0: all interpolated -> startFloor=1000, startMs=max(1000,1000-100)=1000
            // group0 end: nextWord(world) starts at 2200, endCeil=min(3000,2200-5)=2195
            // endMs=min(2195, 2200+120)=2195
            expect(group0.startMs).toBe(1000);
            expect(group0.endMs).toBe(2195);

            // group1: all interpolated -> prevWord(hello,) ends at 2200, startFloor=max(1000, 2200+5)=2205
            // startMs=max(2205, 2200-100)=2205
            expect(group1.startMs).toBe(2205);
            // endMs=min(3000, 3000+120)=3000
            expect(group1.endMs).toBe(3000);
        });

        it("calculates exact startMs and endMs when wordTimings are provided", () => {
            const words = ["hello,", "world"];
            const wordTimings = [
                { startMs: 1200, endMs: 1550 },
                { startMs: 1700, endMs: 2200 },
            ];

            const group0 = getGroupTimeBounds(words, 0, 1000, 3000, wordTimings);
            const group1 = getGroupTimeBounds(words, 1, 1000, 3000, wordTimings);

            // Group 0: "hello,". groupStartMs=1200. startFloor=1000. startMs=max(1000, 1200-100)=1100.
            // nextWord starts at 1700. endCeil=min(3000,1700-5)=1695. endMs=min(1695,1550+120)=1670.
            expect(group0.startMs).toBe(1100);
            expect(group0.endMs).toBe(1670);

            // Group 1: "world". groupStartMs=1700. prevWord ends at 1550.
            // startFloor=max(1000, 1550+5)=1555. startMs=max(1555, 1700-100)=1600.
            // nextWord=null. endCeil=3000. endMs=min(3000,2200+120)=2320.
            expect(group1.startMs).toBe(1600);
            expect(group1.endMs).toBe(2320);
        });
    });

    describe("Fallback Word to Group mapping", () => {
        it("successfully matches index using word clean match fallback", () => {
            const context = "Hello, how are you? I'm fine.";
            const words = context.split(" ");
            const groups = getSentenceGroups(words);
            const wordToGroupMap = new Map<number, number>();
            groups.forEach((group, gIdx) => {
                group.forEach((idx) => {
                    wordToGroupMap.set(idx, gIdx);
                });
            });

            // Simulate fallback for undefined or incorrect wIdx
            const word = "you?";
            const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const targetClean = cleanStr(word);
            const foundIdx = words.findIndex((w) => cleanStr(w) === targetClean);
            const groupIdx = wordToGroupMap.get(foundIdx);
            expect(groupIdx).toBe(1); // "how are you?" is Group 1
        });
    });
});
