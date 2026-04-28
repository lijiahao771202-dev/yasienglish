import { describe, expect, it } from "vitest";

import {
    buildGhostEmbeddingSource,
    isGhostCompletionResultStale,
    resolveAsyncGhostCompletionAction,
    isSelectionAtTextEnd,
} from "./ghost-completion";

describe("isSelectionAtTextEnd", () => {
    it("returns true when the caret text prefix reaches the full answer tail", () => {
        expect(isSelectionAtTextEnd("I really like apples", "I really like apples")).toBe(true);
    });

    it("returns false when the caret is in the middle of the answer", () => {
        expect(isSelectionAtTextEnd("I really like apples", "I really")).toBe(false);
    });
});

describe("buildGhostEmbeddingSource", () => {
    it("rebuilds the vector source key when the allowed alternative count changes", () => {
        const single = buildGhostEmbeddingSource("base answer", ["alt one", "alt two"], 1);
        const double = buildGhostEmbeddingSource("base answer", ["alt one", "alt two"], 2);

        expect(single.texts).toEqual(["base answer", "alt one"]);
        expect(double.texts).toEqual(["base answer", "alt one", "alt two"]);
        expect(single.key).not.toBe(double.key);
    });

    it("rebuilds the vector source key when alternatives change under the same reference answer", () => {
        const first = buildGhostEmbeddingSource("base answer", ["alt one"], 1);
        const second = buildGhostEmbeddingSource("base answer", ["alt revised"], 1);

        expect(first.key).not.toBe(second.key);
    });
});

describe("isGhostCompletionResultStale", () => {
    it("treats queued completions from an old partial input as stale after a full hint is accepted", () => {
        expect(isGhostCompletionResultStale("hel", "hello world")).toBe(true);
    });

    it("keeps the completion when the input has not changed", () => {
        expect(isGhostCompletionResultStale("hello", "hello")).toBe(false);
    });
});

describe("resolveAsyncGhostCompletionAction", () => {
    it("ignores stale async results produced for an older input", () => {
        expect(resolveAsyncGhostCompletionAction({
            requestedInput: "hel",
            latestInput: "hello",
            hasResult: true,
        })).toBe("ignore");
    });

    it("applies a fresh async result for the current input", () => {
        expect(resolveAsyncGhostCompletionAction({
            requestedInput: "hello",
            latestInput: "hello",
            hasResult: true,
        })).toBe("apply");
    });

    it("clears the ghost only when the async miss belongs to the current input", () => {
        expect(resolveAsyncGhostCompletionAction({
            requestedInput: "hello",
            latestInput: "hello",
            hasResult: false,
        })).toBe("clear");
    });
});
