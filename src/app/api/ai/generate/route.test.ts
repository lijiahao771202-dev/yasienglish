import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
    let POSTHandler: typeof import("./route").POST;

    beforeAll(async () => {
        ({ POST: POSTHandler } = await import("./route"));
    });

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

         const response = await POSTHandler(
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

         await POSTHandler(
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

    it("allows a much larger topic-filtered reference pool in generation prompts", async () => {
        const injectedVocabulary = Array.from({ length: 32 }, (_, index) => `housing-term-${index + 1}`);
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Housing Systems",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · IELTS Academic",
                            wordCount: 620,
                        }),
                    },
                },
            ],
        });

        const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    ragMode: "reference",
                    ragSource: "hybrid",
                    injectedVocabulary,
                }),
            }),
        );

        expect(response.status).toBe(200);
        const prompt = createMock.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
        expect(prompt).toContain("Use the items only when they are genuinely relevant to the article topic and local paragraph meaning.");
        expect(prompt).toContain("Reference Pool: housing-term-1");
        expect(prompt).toContain("housing-term-32");
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

         await POSTHandler(
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

         await POSTHandler(
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

         const response = await POSTHandler(
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
            name: "科普解说",
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
        expect(prompt).toContain("Style name: 科普解说");
        expect(prompt).toContain("Do NOT generate any reading comprehension questions");
        expect(prompt).toContain("Do NOT use exam sections such as Questions 1-5");
        expect(prompt).toContain("CET-6 (大学英语六级)");
        expect(prompt).toContain("CET-6 LONGFORM PROFILE");
        expect(prompt).toContain("Use semi-academic vocabulary with explicit reasoning and controlled clause layering.");
        expect(prompt).toContain("The style controls voice, pacing, and paragraph behavior only");
        expect(request?.max_tokens).toBeGreaterThanOrEqual(3200);
    });

    it("supports extra-long longform tiers beyond 2200 words", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "A Very Long Reading",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · IELTS Academic",
                            wordCount: 3980,
                        }),
                    },
                },
            ],
        });

         const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    generationMode: "longform",
                    longformStyleId: "commentary",
                    lengthTierId: "w4200",
                    topicSeed: {
                        source: "random",
                        domainId: "society-governance",
                        domainLabel: "社会与治理",
                        subtopicId: "public-trust",
                        subtopicLabel: "公共信任",
                        angle: "Why legitimacy takes years to build and seconds to lose",
                        topicLine: "公共信任 · Why legitimacy takes years to build and seconds to lose",
                    },
                }),
            }),
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        const request = createMock.mock.calls.at(-1)?.[0];
        const prompt = request?.messages?.[0]?.content as string;

        expect(prompt).toContain("Target word count: 4200 words");
        expect(prompt).toContain("Finish the entire article in one response");
        expect(data.lengthTier).toEqual({
            id: "w4200",
            label: "马拉松",
            targetWordCount: 4200,
        });
        expect(request?.max_tokens).toBeGreaterThanOrEqual(10000);
    });

    it("builds distinct CET-4 and IELTS longform prompts instead of reusing one generic difficulty block", async () => {
        createMock
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "CET4 Longform",
                                content: "Paragraph one.\n\nParagraph two.",
                                byline: "AI Generator · CET-4 (大学英语四级)",
                                wordCount: 910,
                            }),
                        },
                    },
                ],
            })
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "IELTS Longform",
                                content: "Paragraph one.\n\nParagraph two.",
                                byline: "AI Generator · IELTS Academic",
                                wordCount: 910,
                            }),
                        },
                    },
                ],
            });

         await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet4",
                    generationMode: "longform",
                    longformStyleId: "story",
                    lengthTierId: "w900",
                    topicSeed: {
                        source: "random",
                        domainId: "education",
                        domainLabel: "教育与学习",
                        subtopicId: "habits",
                        subtopicLabel: "学习习惯",
                        angle: "How routines change motivation",
                        topicLine: "学习习惯 · How routines change motivation",
                    },
                }),
            }),
        );

        await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    generationMode: "longform",
                    longformStyleId: "commentary",
                    lengthTierId: "w900",
                    topicSeed: {
                        source: "random",
                        domainId: "society-governance",
                        domainLabel: "社会与治理",
                        subtopicId: "public-trust",
                        subtopicLabel: "公共信任",
                        angle: "Why public trust is difficult to restore",
                        topicLine: "公共信任 · Why public trust is difficult to restore",
                    },
                }),
            }),
        );

        const cet4Prompt = createMock.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
        const ieltsPrompt = createMock.mock.calls[1]?.[0]?.messages?.[0]?.content as string;

        expect(cet4Prompt).toContain("CET-4 LONGFORM PROFILE");
        expect(cet4Prompt).toContain("Use concrete, accessible vocabulary with only a light layer of stretch words.");
        expect(cet4Prompt).toContain("Avoid IELTS-like density, policy abstraction, and over-packed paragraphs.");
        expect(ieltsPrompt).toContain("IELTS LONGFORM PROFILE");
        expect(ieltsPrompt).toContain("Use advanced academic vocabulary selectively, with nuance, hedging, and analytical precision.");
        expect(ieltsPrompt).toContain("Avoid school-essay simplification, obvious moralizing, and thin one-idea paragraphs.");
    });

    it("retries longform generation when the first draft is suspiciously short for the requested tier", async () => {
        createMock
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "Too Short",
                                content: "A short paragraph that clearly ends early.",
                                byline: "AI Generator · IELTS Academic",
                                wordCount: 180,
                            }),
                        },
                    },
                ],
            })
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "Recovered Draft",
                                content: Array.from({ length: 1000 }, () => "evidence").join(" "),
                                byline: "AI Generator · IELTS Academic",
                                wordCount: 1000,
                            }),
                        },
                    },
                ],
            });

         const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    generationMode: "longform",
                    longformStyleId: "explainer",
                    lengthTierId: "w1200",
                    topicSeed: {
                        source: "random",
                        domainId: "science",
                        domainLabel: "科学与技术",
                        subtopicId: "systems",
                        subtopicLabel: "复杂系统",
                        angle: "Why small interventions sometimes reshape large systems",
                        topicLine: "复杂系统 · Why small interventions sometimes reshape large systems",
                    },
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(createMock).toHaveBeenCalledTimes(2);
        const retryPrompt = createMock.mock.calls[1]?.[0]?.messages?.[0]?.content as string;
        expect(retryPrompt).toContain("LENGTH RECOVERY NOTICE");
        expect(retryPrompt).toContain("below the minimum usable range");
    });

    it("skips RAG prompt injection entirely when rag mode is off", async () => {
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Zero Shot Article",
                            content: "Paragraph one.\n\nParagraph two.",
                            byline: "AI Generator · CET-4 (大学英语四级)",
                            wordCount: 338,
                        }),
                    },
                },
            ],
        });

         const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet4",
                    ragMode: "off",
                    ragSource: "dictionary",
                    injectedVocabulary: ["budget", "expense"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        const prompt = createMock.mock.calls[0]?.[0]?.messages?.[0]?.content as string;

        expect(prompt).not.toContain("REFERENCE LEXICAL POOL");
        expect(prompt).not.toContain("STRICT RAG INJECTION");
        expect(data.ragMode).toBe("off");
        expect(data.ragSource).toBe("dictionary");
        expect(data.ragAppliedWords).toEqual([]);
    });

    it("includes strict RAG constraints and returns truncated required words in standard mode", async () => {
        const requiredTerms = [
            "allocation",
            "public trust",
            "housing stock",
            "rent burden",
            "affordability",
            "market access",
            "zoning reform",
            "tenant mobility",
            "supply bottleneck",
            "commuting radius",
            "vacancy chain",
            "land scarcity",
            "permit delay",
            "interest burden",
            "income mismatch",
            "subsidy design",
            "urban fringe",
            "price ceiling",
            "shared equity",
            "mortgage stress",
        ];
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Strict Article",
                            content: requiredTerms.join(" "),
                            byline: "AI Generator · IELTS Academic",
                            wordCount: 260,
                        }),
                    },
                },
            ],
        });

         const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    ragMode: "strict",
                    ragSource: "hybrid",
                    injectedVocabulary: [...requiredTerms, "should be dropped"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        const prompt = createMock.mock.calls[0]?.[0]?.messages?.[0]?.content as string;

        expect(prompt).toContain("STRICT RAG INJECTION (MANDATORY)");
        expect(prompt).toContain("RAG source mode: hybrid");
        expect(prompt).toContain(`Required items (20): ${requiredTerms.join(", ")}`);
        expect(data.ragAppliedWords).toEqual(requiredTerms);
    });

    it("retries strict RAG generation once when required terms are missing", async () => {
        createMock
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "Retry Me",
                                content: "This article mentions allocation only.",
                                byline: "AI Generator · CET-6 (大学英语六级)",
                                wordCount: 420,
                            }),
                        },
                    },
                ],
            })
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "Retry Success",
                                content: "Allocation, public trust, and system feedback now all appear together in the article body.",
                                byline: "AI Generator · CET-6 (大学英语六级)",
                                wordCount: 438,
                            }),
                        },
                    },
                ],
            });

         const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet6",
                    ragMode: "strict",
                    ragSource: "vocab",
                    injectedVocabulary: ["allocation", "public trust", "system feedback"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(createMock).toHaveBeenCalledTimes(2);
        const retryPrompt = createMock.mock.calls[1]?.[0]?.messages?.[0]?.content as string;
        expect(retryPrompt).toContain("STRICT REGENERATION NOTICE");
        expect(retryPrompt).toContain("public trust, system feedback");
    });

    it("returns 502 when strict RAG generation still misses required terms after retry", async () => {
        createMock
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "Retry Fail 1",
                                content: "Only allocation appears here.",
                                byline: "AI Generator · CET-4 (大学英语四级)",
                                wordCount: 320,
                            }),
                        },
                    },
                ],
            })
            .mockResolvedValueOnce({
                choices: [
                    {
                        message: {
                            content: JSON.stringify({
                                title: "Retry Fail 2",
                                content: "Allocation still appears alone.",
                                byline: "AI Generator · CET-4 (大学英语四级)",
                                wordCount: 322,
                            }),
                        },
                    },
                ],
            });

         const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet4",
                    ragMode: "strict",
                    ragSource: "dictionary",
                    injectedVocabulary: ["allocation", "public trust"],
                }),
            }),
        );

        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
            error: expect.stringContaining("Missing required terms: public trust"),
        });
    });

    it("allows up to 40 strict RAG terms in longform mode", async () => {
        const requiredTerms = Array.from({ length: 40 }, (_, index) => `term ${index + 1}`);
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Longform Strict",
                            content: requiredTerms.join(" ") + " extra paragraph content",
                            byline: "AI Generator · IELTS Academic",
                            wordCount: 1200,
                        }),
                    },
                },
            ],
        });

         const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "ielts",
                    generationMode: "longform",
                    longformStyleId: "science",
                    lengthTierId: "w1200",
                    ragMode: "strict",
                    ragSource: "hybrid",
                    injectedVocabulary: [...requiredTerms, "term 41"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        const data = await response.json();
        const prompt = createMock.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
        expect(prompt).toContain(`Required items (40): ${requiredTerms.join(", ")}`);
        expect(data.ragAppliedWords).toEqual(requiredTerms);
    });

    it("raises strict RAG capacity well beyond the previous tiny cap", async () => {
        const requiredTerms = Array.from({ length: 20 }, (_, index) => `required-term-${index + 1}`);
        createMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: "Strict Capacity",
                            content: requiredTerms.join(" "),
                            byline: "AI Generator · CET-6 (大学英语六级)",
                            wordCount: 480,
                        }),
                    },
                },
            ],
        });

        const response = await POSTHandler(
            new Request("http://localhost/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    difficulty: "cet6",
                    ragMode: "strict",
                    ragSource: "vocab",
                    injectedVocabulary: [...requiredTerms, "required-term-21", "required-term-22"],
                }),
            }),
        );

        expect(response.status).toBe(200);
        const prompt = createMock.mock.calls[0]?.[0]?.messages?.[0]?.content as string;
        expect(prompt).toContain(`Required items (20): ${requiredTerms.join(", ")}`);
    });
});
