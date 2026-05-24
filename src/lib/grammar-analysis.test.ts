import { describe, expect, it } from "vitest";

import {
    buildReadingGrammarExecutionSignature,
    buildGrammarBasicPrompt,
    buildGrammarDeepPrompt,
    buildGrammarCacheKey,
    GRAMMAR_BASIC_PROMPT_VERSION,
    hasUsableBasicGrammarResult,
    sanitizeGrammarBasicPayload,
    sanitizeGrammarDeepSentencePayload,
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

    it("returns fallback deep payload when tree is missing", () => {
        const sentence = "Scientists noticed the trend.";
        const sanitized = sanitizeGrammarDeepSentencePayload({}, sentence);
        expect(sanitized.retryRecommended).toBe(true);
        expect(sanitized.data.sentence).toBe(sentence);
        expect(sanitized.data.sentence_tree?.label).toBe("主句");
        expect(sanitized.qualityScore).toBe(0.4);
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

    it("contains stronger generation constraints in prompts", () => {
        const basicPrompt = buildGrammarBasicPrompt("Sample sentence.");
        const deepPrompt = buildGrammarDeepPrompt("Sample sentence.");

        expect(GRAMMAR_BASIC_PROMPT_VERSION).toBe("2026-05-17-basic-v10");
        expect(basicPrompt).toContain("Every highlight.explanation MUST be Markdown-ready and teacher-like.");
        expect(basicPrompt).toContain("Lead with one bold judgment sentence.");
        expect(basicPrompt).toContain("Prefer the most specific grammar type possible");
        expect(basicPrompt).toContain("Do NOT stop at the outer clause boundary");
        expect(basicPrompt).toContain("Avoid oversized chunks");
        expect(basicPrompt).toContain("Long noun phrases must be decomposed");
        expect(basicPrompt).toContain("时间状语从句 / 条件状语从句 / 让步状语从句 / 原因状语从句 / 目的状语从句");
        expect(basicPrompt).toContain("宾语从句 / 主语从句 / 表语从句 / 同位语从句");
        expect(basicPrompt).toContain("介词短语 / 分词短语 / 不定式短语 / 动名词短语");
        expect(basicPrompt).toContain("Do NOT collapse a specific structure into a broad label");
        expect(basicPrompt).toContain("segment_translation MUST be contextual");
        expect(basicPrompt).toContain("FEW-SHOT EXAMPLE 1");
        expect(basicPrompt).toContain("clause-first workflow");
        expect(basicPrompt).toContain('"sentences": [');
        expect(basicPrompt).toContain("Do not skip short, simple, or summary-like sentences.");
        expect(deepPrompt).toContain("Markdown is allowed inside the explanation strings.");
        expect(deepPrompt).toContain("avoid vague generic text");
        expect(deepPrompt).toContain("FEW-SHOT EXAMPLE");
        expect(deepPrompt).toContain("Identify the main clause first");
    });
});
