import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/components/reading/ReadingQuizPanel";
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

    it("preserves video metadata and structured quiz questions", () => {
        const quizQuestions: QuizQuestion[] = [
            {
                id: 1,
                type: "multiple_choice",
                question: "What does the speaker plan to do next?",
                options: ["A. Call a taxi", "B. Take the train"],
                answer: "B",
                explanation: "The speaker says they will catch the train.",
            },
        ];

        const payload = buildReadArticleCloudPayload({
            url: "https://example.com/video-article",
            title: "TED Clip",
            content: "<p>content</p>",
            textContent: "content",
            videoUrl: "https://cdn.example.com/video.mp4",
            quizQuestions,
        }, 1234567890);

        expect(payload.videoUrl).toBe("https://cdn.example.com/video.mp4");
        expect(payload.quizQuestions).toEqual(quizQuestions);
    });

    it("preserves longform reading metadata in the cloud snapshot payload", () => {
        const payload = buildReadArticleCloudPayload({
            url: "ai-gen://cet6/456",
            title: "Longform Article",
            content: "content",
            textContent: "content",
            difficulty: "cet6",
            isAIGenerated: true,
            generationMode: "longform",
            quizEligible: false,
            longformStyle: {
                id: "science",
                name: "科普",
            },
            lengthTier: {
                id: "w1200",
                label: "中篇",
                targetWordCount: 1200,
            },
            wordCount: 1176,
        }, 1234567890);

        expect(payload.generationMode).toBe("longform");
        expect(payload.quizEligible).toBe(false);
        expect(payload.longformStyle).toEqual({
            id: "science",
            name: "科普",
        });
        expect(payload.lengthTier).toEqual({
            id: "w1200",
            label: "中篇",
            targetWordCount: 1200,
        });
        expect(payload.wordCount).toBe(1176);
    });
});
