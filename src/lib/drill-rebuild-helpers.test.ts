import { describe, expect, it } from "vitest";

import {
    areRebuildTokenOrdersEqual,
    buildConnectedSentenceIpa,
    buildGeneratedRebuildBankContentKey,
    buildRebuildTokenInstances,
    createRebuildPassageDraftState,
    getGuidedScriptKey,
    getSentenceAudioCacheKey,
    pickPreferredRebuildTokenCandidate,
} from "./drill-rebuild-helpers";

describe("drill-rebuild-helpers", () => {
    it("tracks repeat indexes and distractor origins when building token instances", () => {
        const { tokenInstances, tokenOrder } = buildRebuildTokenInstances({
            tokenBank: ["go", "go", "home"],
            distractorTokens: ["home"],
            prefix: "seg-1",
        });

        expect(tokenInstances).toEqual([
            expect.objectContaining({ id: "seg-1-token-0-go", text: "go", origin: "answer", repeatIndex: 1, repeatTotal: 2 }),
            expect.objectContaining({ id: "seg-1-token-1-go", text: "go", origin: "answer", repeatIndex: 2, repeatTotal: 2 }),
            expect.objectContaining({ id: "seg-1-token-2-home", text: "home", origin: "distractor", repeatIndex: 1, repeatTotal: 1 }),
        ]);
        expect(tokenOrder["seg-1-token-1-go"]).toBe(1);
    });

    it("creates a fresh passage draft state from the segment bank", () => {
        const draft = createRebuildPassageDraftState({
            id: "seg-2",
            tokenBank: ["my", "turn"],
            distractorTokens: [],
        }, 3);

        expect(draft.segmentIndex).toBe(3);
        expect(draft.availableTokens).toHaveLength(2);
        expect(draft.answerTokens).toEqual([]);
        expect(draft.typingBuffer).toBe("");
        expect(draft.startedAt).toBeNull();
    });

    it("prefers the candidate that best matches the expected reference token", () => {
        const picked = pickPreferredRebuildTokenCandidate({
            candidates: [
                { id: "1", text: "Meeting", origin: "answer" },
                { id: "2", text: "meting", origin: "distractor" },
            ],
            typedRaw: "meeting",
            expectedRaw: "Meeting",
        });

        expect(picked?.id).toBe("1");
    });

    it("builds guided-script keys and content keys from normalized topic data", () => {
        expect(getGuidedScriptKey({
            chinese: "你好",
            reference_english: "Hello there",
            _topicMeta: { topic: "Travel" },
        }, 1320)).toContain("\"topic\":\"Travel\"");

        expect(buildGeneratedRebuildBankContentKey(" Travel ", "Hello, THERE!")).toBe("travel::hello there");
        expect(getSentenceAudioCacheKey("Hello")).toBe("SENTENCE_Hello");
    });

    it("detects equal token orders and builds IPA liaison when consonants meet vowels", () => {
        expect(areRebuildTokenOrdersEqual({ a: 0, b: 1 }, { a: 0, b: 1 })).toBe(true);
        expect(areRebuildTokenOrdersEqual({ a: 0, b: 1 }, { a: 1, b: 0 })).toBe(false);

        const ipa = buildConnectedSentenceIpa("take it", (word) => {
            if (word === "take") return "/teɪk/";
            if (word === "it") return "/ɪt/";
            return "";
        });

        expect(ipa).toBe("/teɪk‿ɪt/");
    });
});
