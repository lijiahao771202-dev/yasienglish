import { describe, expect, it } from "vitest";

import {
    buildReadingGrammarExecutionSignature,
    buildGrammarBasicPrompt,
    buildGrammarCacheKey,
    GRAMMAR_BASIC_PROMPT_VERSION,
    hasUsableBasicGrammarResult,
    sanitizeGrammarBasicPayload,
    splitGrammarSentences,
} from "./grammar-analysis";

describe("grammar analysis helpers", () => {
    it("builds stable cache key from normalized text and request dimensions", () => {
        const first = buildGrammarCacheKey({
            text: "Hello   world.",
            mode: "basic",
            promptVersion: "v1",
            model: "m1",
        });
        const second = buildGrammarCacheKey({
            text: "Hello world.",
            mode: "basic",
            promptVersion: "v1",
            model: "m1",
        });
        const third = buildGrammarCacheKey({
            text: "Hello world.",
            mode: "deep",
            promptVersion: "v1",
            model: "m1",
        });

        expect(first).toBe(second);
        expect(third).not.toBe(first);
    });

    it("builds grammar execution signatures that match provider-specific cache routing", () => {
        expect(buildReadingGrammarExecutionSignature({
            ai_provider: "deepseek",
            deepseek_model: "deepseek-v4-pro",
            deepseek_thinking_mode: "on",
            deepseek_reasoning_effort: "max",
        })).toBe("deepseek:deepseek-v4-pro:thinking=on:reasoning=max");

        expect(buildReadingGrammarExecutionSignature({
            ai_provider: "glm",
            glm_model: "glm-5.1",
            glm_thinking_mode: "on",
        })).toBe("glm:glm-5.1:thinking=on");

        expect(buildReadingGrammarExecutionSignature({
            ai_provider: "mimo",
            mimo_model: "mimo-v2-pro",
            ai_provider_params: {
                mimo: {
                    thinking_mode: "on",
                    reasoning_effort: "high",
                },
            },
        })).toBe("mimo:mimo-v2-pro:thinking=on:reasoning=high");

        expect(buildReadingGrammarExecutionSignature({
            ai_provider: "github",
            github_model: "openai/gpt-4.1-mini",
        })).toBe("github:openai/gpt-4.1-mini");
    });

    it("sanitizes partial basic payload with sentence-level fallback", () => {
        const text = "First sentence. Second sentence!";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["主语"],
            sentences: [
                {
                    sentence: "First sentence.",
                    translation: "第一句。",
                    highlights: [
                        {
                            substring: "First",
                            type: "主语",
                            explanation: "句首成分",
                        },
                    ],
                },
            ],
        }, text);

        expect(splitGrammarSentences(text)).toHaveLength(2);
        expect(sanitized.data.difficult_sentences).toHaveLength(2);
        expect(sanitized.data.difficult_sentences[0].highlights.length).toBeGreaterThan(0);
        expect(sanitized.data.difficult_sentences[1].sentence).toBe("Second sentence!");
        expect(sanitized.retryRecommended).toBe(true);
        expect(sanitized.qualityScore).toBeGreaterThan(0);
    });

    it("filters standalone punctuation fragments from spaced ellipses", () => {
        const text = "\"remembering the old routine. . . feeling tightness in the jaw. . . sense of panic rising. . . judging myself for feeling weak. .\" This intensive articulation prevents the mind from weaving a coherent narrative.";

        expect(splitGrammarSentences(text)).toEqual([
            "\"remembering the old routine...",
            "feeling tightness in the jaw...",
            "sense of panic rising...",
            "judging myself for feeling weak...\"",
            "This intensive articulation prevents the mind from weaving a coherent narrative.",
        ]);
    });

    it("treats partial basic analysis with at least one highlighted sentence as usable", () => {
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["主语"],
            overview: "首句有主干，次句只有译文。",
            sentences: [
                {
                    sentence: "First sentence.",
                    translation: "第一句。",
                    highlights: [
                        {
                            substring: "First",
                            type: "主语",
                            explanation: "句首成分",
                        },
                    ],
                },
                {
                    sentence: "Second sentence!",
                    translation: "第二句！",
                    highlights: [],
                },
            ],
        }, "First sentence. Second sentence!");

        expect(sanitized.retryRecommended).toBe(true);
        expect(hasUsableBasicGrammarResult(sanitized.data)).toBe(true);
    });

    it("upgrades weak highlight explanations and contextual segment meaning", () => {
        const sentence = "That piece of paper was the main signal to employers.";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["语法"],
            overview: "句子分析",
            difficult_sentences: [
                {
                    sentence,
                    translation: "那张纸曾是给雇主的主要信号。",
                    highlights: [
                        {
                            substring: "That piece of paper",
                            type: "subject",
                            explanation: "语法功能",
                        },
                    ],
                },
            ],
        }, sentence);

        const first = sanitized.data.difficult_sentences[0].highlights[0];
        expect(first.type).toBe("主语");
        expect(first.explanation).toContain("结构判断");
        expect(first.explanation).toContain("句中作用");
        expect(first.segment_translation).toContain("本句");
    });

    it("preserves specific grammar subtypes so the UI can color them distinctly", () => {
        const sentence = "When the market cools, investors shift funds to safer assets.";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["语法"],
            overview: "句子分析",
            difficult_sentences: [
                {
                    sentence,
                    translation: "当市场降温时，投资者会把资金转向更安全的资产。",
                    highlights: [
                        {
                            substring: "When the market cools",
                            type: "时间状语从句",
                            explanation: "交代动作发生的时间背景。",
                        },
                        {
                            substring: "investors",
                            type: "主语",
                            explanation: "动作发出者。",
                        },
                        {
                            substring: "shift funds to safer assets",
                            type: "谓语",
                            explanation: "核心动作。",
                        },
                        {
                            substring: "to safer assets",
                            type: "介词短语",
                            explanation: "补充转向的目标。",
                        },
                    ],
                },
            ],
        }, sentence);

        const types = sanitized.data.difficult_sentences[0]?.highlights.map((item) => item.type);
        expect(types).toContain("时间状语从句");
        expect(types).toContain("介词短语");
        expect(types).not.toContain("状语");
        expect(types).not.toContain("短语");
    });

    it("preserves finer modifier labels instead of collapsing them to broad tags", () => {
        const sentence = "Both methods, which many teachers recommend, can short-circuit the loop, leading to calmer decisions.";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["语法"],
            overview: "句子分析",
            difficult_sentences: [
                {
                    sentence,
                    translation: "这两种方法都能打断这个循环，从而带来更平静的决定。",
                    highlights: [
                        {
                            substring: "which many teachers recommend",
                            type: "非限制性定语从句",
                            explanation: "补充说明前面的 both methods。",
                        },
                        {
                            substring: "leading to calmer decisions",
                            type: "结果状语",
                            explanation: "表示前面动作带来的结果。",
                        },
                    ],
                },
            ],
        }, sentence);

        const types = sanitized.data.difficult_sentences[0]?.highlights.map((item) => item.type);
        expect(types).toContain("非限制性定语从句");
        expect(types).toContain("结果状语");
        expect(types).not.toContain("定语");
        expect(types).not.toContain("状语");
    });

    it("flags coarse lazy chunking on long complex sentences for retry", () => {
        const sentence = "A randomized controlled trial published in The Journal of the American Medical Association (JAMA) in 2021 found that participants who underwent mindfulness-based relapse prevention, incorporating RAIN and urge surfing, exhibited significantly lower relapse rates at 12-month follow-up compared to those receiving standard cognitive-behavioral therapy or nicotine replacement therapy.";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["语法"],
            overview: "句子分析",
            difficult_sentences: [
                {
                    sentence,
                    translation: "2021 年发表于《美国医学会杂志》的一项随机对照试验发现，接受基于正念的复发预防（结合 RAIN 和冲浪法）的参与者，在 12 个月随访时的复发率显著低于接受标准认知行为疗法或尼古丁替代疗法的人。",
                    highlights: [
                        {
                            substring: "A randomized controlled trial published in The Journal of the American Medical Association (JAMA) in 2021",
                            type: "主语",
                            explanation: "动作发出者。",
                        },
                        {
                            substring: "found",
                            type: "谓语",
                            explanation: "核心谓语。",
                        },
                        {
                            substring: "that participants who underwent mindfulness-based relapse prevention, incorporating RAIN and urge surfing, exhibited significantly lower relapse rates at 12-month follow-up compared to those receiving standard cognitive-behavioral therapy or nicotine replacement therapy",
                            type: "宾语从句",
                            explanation: "found 后面的宾语从句。",
                        },
                    ],
                },
            ],
        }, sentence);

        expect(sanitized.retryRecommended).toBe(true);
        expect(sanitized.issues.some((issue) => issue.includes("chunking is too coarse"))).toBe(true);
    });

    it("flags four oversized chunks on what-cleft style long sentences for retry", () => {
        const sentence = "What AI systems still struggle with—what they may struggle with for a very long time—is the integration of multiple skills applied to messy, real-world situations with incomplete information and high stakes.";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["语法"],
            overview: "句子分析",
            difficult_sentences: [
                {
                    sentence,
                    translation: "AI 系统仍然难以处理的东西，也是它们可能在很长时间内都会难以处理的东西，是把多种技能整合起来，应用到信息不完整、风险很高的混乱现实场景中。",
                    highlights: [
                        {
                            substring: "What AI systems still struggle with",
                            type: "主语从句",
                            explanation: "主语从句，说明 AI 系统难以处理的内容。",
                            segment_translation: "AI 系统仍然难以处理的东西",
                        },
                        {
                            substring: "what they may struggle with for a very long time",
                            type: "插入语",
                            explanation: "插入补充说明前面的内容。",
                            segment_translation: "它们可能很长时间都会难以处理的东西",
                        },
                        {
                            substring: "is the integration of multiple skills",
                            type: "谓语",
                            explanation: "把系动词和表语合在一起说明核心判断。",
                            segment_translation: "是多种技能的整合",
                        },
                        {
                            substring: "applied to messy, real-world situations with incomplete information and high stakes",
                            type: "后置定语",
                            explanation: "后置定语，说明这些技能应用到什么场景。",
                            segment_translation: "应用到信息不完整且风险很高的混乱现实场景中",
                        },
                    ],
                },
            ],
        }, sentence);

        expect(sanitized.retryRecommended).toBe(true);
        expect(sanitized.issues.some((issue) => issue.includes("chunking is too coarse"))).toBe(true);
    });

    it("accepts fine-grained chunking on what-cleft style long sentences", () => {
        const sentence = "What AI systems still struggle with—what they may struggle with for a very long time—is the integration of multiple skills applied to messy, real-world situations with incomplete information and high stakes.";
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["语法"],
            overview: "句子分析",
            difficult_sentences: [
                {
                    sentence,
                    translation: "AI 系统仍然难以处理的东西，也是它们可能在很长时间内都会难以处理的东西，是把多种技能整合起来，应用到信息不完整、风险很高的混乱现实场景中。",
                    highlights: [
                        {
                            substring: "What AI systems still struggle with",
                            type: "主语从句",
                            explanation: "主语从句，整体充当句子的主语。",
                            segment_translation: "AI 系统仍然难以处理的东西",
                        },
                        {
                            substring: "what they may struggle with for a very long time",
                            type: "插入语",
                            explanation: "插入补充说明前面的主语内容。",
                            segment_translation: "它们可能很长时间都会难以处理的东西",
                        },
                        {
                            substring: "may struggle with",
                            type: "谓语",
                            explanation: "插入部分内部的谓语结构。",
                            segment_translation: "可能会难以处理",
                        },
                        {
                            substring: "for a very long time",
                            type: "时间状语",
                            explanation: "说明 struggle with 可能持续多久。",
                            segment_translation: "在很长一段时间里",
                        },
                        {
                            substring: "is",
                            type: "谓语",
                            explanation: "全句主干中的系动词，连接主语和表语。",
                            segment_translation: "是",
                        },
                        {
                            substring: "the integration of multiple skills",
                            type: "表语",
                            explanation: "说明主语真正指向的核心内容。",
                            segment_translation: "多种技能的整合",
                        },
                        {
                            substring: "of multiple skills",
                            type: "介词短语",
                            explanation: "补充 integration 整合的对象。",
                            segment_translation: "多种技能的",
                        },
                        {
                            substring: "applied to messy, real-world situations",
                            type: "分词短语",
                            explanation: "后置修饰 skills，说明这些技能被应用到哪里。",
                            segment_translation: "应用到混乱的现实场景中",
                        },
                        {
                            substring: "with incomplete information and high stakes",
                            type: "介词短语",
                            explanation: "进一步说明现实场景的条件特征。",
                            segment_translation: "在信息不完整且风险很高的情况下",
                        },
                    ],
                },
            ],
        }, sentence);

        expect(sanitized.retryRecommended).toBe(false);
        expect(sanitized.issues.some((issue) => issue.includes("chunking is too coarse"))).toBe(false);
    });

    it("supports sentence-array sanitization for batch analysis", () => {
        const sanitized = sanitizeGrammarBasicPayload({
            tags: ["主语"],
            overview: "句级批处理结果。",
            sentences: [
                {
                    sentence: "First sentence.",
                    translation: "第一句。",
                    highlights: [
                        {
                            substring: "First",
                            type: "主语",
                            explanation: "结构判断：First 在这里承担句首核心成分。",
                        },
                    ],
                },
                {
                    sentence: "Second sentence!",
                    translation: "第二句！",
                    highlights: [
                        {
                            substring: "Second sentence",
                            type: "主语",
                            explanation: "结构判断：Second sentence 是句子的核心内容。",
                        },
                    ],
                },
            ],
        }, ["First sentence.", "Second sentence!"]);

        expect(sanitized.data.difficult_sentences).toHaveLength(2);
        expect(sanitized.retryRecommended).toBe(false);
    });

    it("contains sentence-batch constraints in prompts without paragraph splitting instructions", () => {
        const basicPrompt = buildGrammarBasicPrompt([
            "Sample sentence one.",
            "Sample sentence two?",
        ]);

        expect(GRAMMAR_BASIC_PROMPT_VERSION).toMatch(/^2026-05-\d{2}-basic-v\d+$/);
        expect(basicPrompt).toContain("Target sentences");
        expect(basicPrompt).toContain("Every highlight.explanation MUST be Markdown-ready and teacher-like.");
        expect(basicPrompt).toContain("Lead with one bold judgment sentence.");
        expect(basicPrompt).toContain("Prefer the most specific grammar type possible");
        expect(basicPrompt).toContain("Do NOT stop at the outer clause boundary");
        expect(basicPrompt).toContain("Avoid oversized chunks");
        expect(basicPrompt).toContain("For sentences longer than 22 English words, normally return 6-12 highlights");
        expect(basicPrompt).toContain("Do NOT merge the predicate and complement/predicative into one huge chunk");
        expect(basicPrompt).toContain("Long noun phrases must be decomposed");
        expect(basicPrompt).toContain("what...is...");
        expect(basicPrompt).toContain("时间状语从句 / 条件状语从句 / 让步状语从句 / 原因状语从句 / 目的状语从句");
        expect(basicPrompt).toContain("宾语从句 / 主语从句 / 表语从句 / 同位语从句");
        expect(basicPrompt).toContain("介词短语 / 分词短语 / 不定式短语 / 动名词短语");
        expect(basicPrompt).toContain("Do NOT collapse a specific structure into a broad label");
        expect(basicPrompt).toContain("segment_translation MUST be contextual");
        expect(basicPrompt).toContain('"sentences": [');
        expect(basicPrompt).not.toContain("Split the paragraph into individual sentences");
        expect(basicPrompt).not.toContain("Paragraph:");
        expect(basicPrompt).not.toContain("FEW-SHOT EXAMPLE 1");
        expect(basicPrompt.indexOf("OBJECTIVE:")).toBeLessThan(basicPrompt.indexOf("Target sentences:"));
        expect(basicPrompt.length).toBeLessThan(4500);
    });

    it("adds patch-mode repair context when repairing a sentence batch", () => {
        const patchPrompt = buildGrammarBasicPrompt(["Experts say the pattern may reshape future climate planning."], {
            patchMode: true,
            repairCategories: ["missing_translation", "missing_highlights"],
            repairHints: ["sentence \"Experts say the pattern may reshape\" translation is missing"],
            existingAnalyses: [
                {
                    sentence: "Experts say the pattern may reshape future climate planning.",
                    translation: "",
                    highlights: [],
                },
            ],
        });

        expect(patchPrompt).toContain("PATCH MODE:");
        expect(patchPrompt).toContain("REPAIR REQUIREMENTS:");
        expect(patchPrompt).toContain("missing_translation");
        expect(patchPrompt).toContain("missing_highlights");
        expect(patchPrompt).toContain("CURRENT BATCH STATUS:");
        expect(patchPrompt).toContain("translation_status: missing");
        expect(patchPrompt).toContain("highlight_status: missing");
        expect(patchPrompt).not.toContain("Human-readable notes");
        expect(patchPrompt).not.toContain("sentence \"Experts say the pattern may reshape\" translation is missing");
        expect(patchPrompt).not.toContain("current translation: MISSING");
        expect(patchPrompt).not.toContain("current highlights: MISSING");
    });
});
