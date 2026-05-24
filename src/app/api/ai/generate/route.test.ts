import { beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

vi.mock("@/lib/deepseek", () => ({
    deepseek: {
        chat: {
            completions: {
                create: createMock,
            },
        },
    },
}));

describe("ai generate route", () => {
    beforeEach(() => {
        createMock.mockReset();
    });

    it("builds a CET-4 specific prompt with soft RAG guidance and explicit topic seed", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Campus Health Habits",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · CET-4 (大学英语四级)",
                            wordCount: 320,
                        }),
                    },
                },
            ],
        });

        const { POST } = await import("./route");
        const response = await POST(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet4",
                    topicSeed: {
                        source: "random",
                        domainId: "economy",
                        domainLabel: "经济与商业",
                        subtopicId: "money-policy",
                        subtopicLabel: "货币与通胀",
                        angle: "How inflation changes student spending decisions",
                        topicLine: "货币与通胀 · How inflation changes student spending decisions",
                    },
                    injectedVocabulary: ["budget", "price rise", "daily expense"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        const request = createMock.mock.calls[0]?.[0];
        const prompt = request?.messages?.[0]?.content as string;

        expect(prompt).toContain("CET-4 (大学英语四级)");
        expect(prompt).toContain("Use familiar, concrete vocabulary");
        expect(prompt).toContain("Avoid IELTS-style abstraction");
        expect(prompt).toContain("REFERENCE LEXICAL POOL (OPTIONAL, SOFT REFERENCE ONLY)");
        expect(prompt).toContain("Do not force every reference word into the article");
        expect(prompt).toContain("Topic seed lock: 货币与通胀 · How inflation changes student spending decisions");
    });

    it("accepts merged learner and system vocabulary as soft references", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Balanced Housing Policy",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · IELTS Academic",
                            wordCount: 580,
                        }),
                    },
                },
            ],
        });

        const { POST } = await import("./route");
        await POST(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    topicSeed: {
                        source: "random",
                        domainId: "city-life",
                        domainLabel: "城市与生活",
                        subtopicId: "housing",
                        subtopicLabel: "住房与居住",
                        angle: "Affordable housing policy tradeoffs",
                        topicLine: "住房与居住 · Affordable housing policy tradeoffs",
                    },
                    injectedVocabulary: ["affordability", "allocation", "rent burden", "housing stock"],
                }),
            }),
        );

        const request = createMock.mock.calls[0]?.[0];
        const prompt = request?.messages?.[0]?.content as string;

        expect(prompt).toContain("Reference Pool: affordability, allocation, rent burden, housing stock");
        expect(prompt).toContain("Treat them as optional support, not as a mandatory checklist.");
    });

    it("builds a CET-6 specific prompt distinct from CET-4 and IELTS", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Education Reform and Fairness",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · CET-6 (大学英语六级)",
                            wordCount: 430,
                        }),
                    },
                },
            ],
        });

        const { POST } = await import("./route");
        await POST(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet6",
                    topicSeed: {
                        source: "random",
                        domainId: "education",
                        domainLabel: "教育与学习",
                        subtopicId: "exam-fairness",
                        subtopicLabel: "考试公平",
                        angle: "How test design affects opportunity equity",
                        topicLine: "考试公平 · How test design affects opportunity equity",
                    },
                }),
            }),
        );

        const request = createMock.mock.calls[0]?.[0];
        const prompt = request?.messages?.[0]?.content as string;

        expect(prompt).toContain("CET-6 (大学英语六级)");
        expect(prompt).toContain("Use semi-academic vocabulary naturally");
        expect(prompt).toContain("Use a clear thesis and deeper explanation");
        expect(prompt).toContain("Avoid overly literary narration");
        expect(prompt).toContain("balanced analysis");
    });

    it("builds an IELTS-specific academic prompt", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Urban Policy and Social Equity",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · IELTS Academic",
                            wordCount: 610,
                        }),
                    },
                },
            ],
        });

        const { POST } = await import("./route");
        await POST(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    topicSeed: {
                        source: "random",
                        domainId: "city-life",
                        domainLabel: "城市与生活",
                        subtopicId: "housing",
                        subtopicLabel: "住房与居住",
                        angle: "Affordable housing policy tradeoffs",
                        topicLine: "住房与居住 · Affordable housing policy tradeoffs",
                    },
                }),
            }),
        );

        const request = createMock.mock.calls[0]?.[0];
        const prompt = request?.messages?.[0]?.content as string;

        expect(prompt).toContain("IELTS Academic");
        expect(prompt).toContain("Use advanced academic vocabulary with restraint");
        expect(prompt).toContain("Allow qualified claims, cautious evaluation, and explicit tradeoffs");
        expect(prompt).toContain("Avoid CET-style simplicity");
        expect(prompt).toContain("factually grounded");
    });

    it("builds a CET-6 longform prompt with explicit style, target length, and anti-quiz constraints", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "How Scientific Curiosity Spreads",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · CET-6 (大学英语六级)",
                            wordCount: 1180,
                        }),
                    },
                },
            ],
        });

        const { POST } = await import("./route");
        const response = await POST(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet6",
                    generationMode: "longform",
                    longformStyleId: "science",
                    lengthTierId: "w1200",
                    topicSeed: {
                        source: "random",
                        domainId: "science",
                        domainLabel: "科学与技术",
                        subtopicId: "public-science",
                        subtopicLabel: "公众科学",
                        angle: "How curiosity changes the way people learn science",
                        topicLine: "公众科学 · How curiosity changes the way people learn science",
                    },
                }),
            }),
        );
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.generationMode).toBe("longform");
        expect(data.quizEligible).toBe(false);
        expect(data.longformStyle).toEqual({
            id: "science",
            name: "科普",
        });
        expect(data.lengthTier).toEqual({
            id: "w1200",
            label: "中篇",
            targetWordCount: 1200,
        });

        const request = createMock.mock.calls[0]?.[0];
        const prompt = request?.messages?.[0]?.content as string;
        expect(prompt).toContain("LONGFORM MODE");
        expect(prompt).toContain("Target word count: 1200 words");
        expect(prompt).toContain("Style name: 科普");
        expect(prompt).toContain("Do NOT generate any reading comprehension questions");
        expect(prompt).toContain("Do NOT use exam sections such as Questions 1-5");
        expect(prompt).toContain("CET-6 (大学英语六级)");
    });
});
