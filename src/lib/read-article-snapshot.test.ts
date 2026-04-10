import { describe, expect, it } from "vitest";
import { buildReadArticleCloudPayload } from "./read-article-snapshot";

describe("buildReadArticleCloudPayload", () => {
    it("preserves CAT completion flags in the cloud snapshot payload", () => {
        const payload = buildReadArticleCloudPayload({
            url: "https://example.com/cat-article",
            title: "CAT Article",
            content: "<p>content</p>",
            isCatMode: true,
            catSessionId: "session-1",
            quizCompleted: true,
            catSelfAssessed: true,
        }, 1234567890);

        expect(payload.isCatMode).toBe(true);
        expect(payload.catSessionId).toBe("session-1");
        expect(payload.quizCompleted).toBe(true);
        expect(payload.catSelfAssessed).toBe(true);
    });
});
