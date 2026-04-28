import { describe, expect, it } from "vitest";

import { GLM_MODEL_LIBRARY, buildGlmModelSummaries, glmModelSupportsThinking } from "./glm-model-catalog";

describe("buildGlmModelSummaries", () => {
    it("decorates the curated GLM models with context and thinking metadata", () => {
        expect(buildGlmModelSummaries(["glm-5.1", "glm-4.7-flash"])).toEqual([
            {
                id: "glm-5.1",
                name: "GLM-5.1",
                summary: "当前官方最新旗舰，通用写作、代码、长上下文和深度思考都最稳。",
                contextWindow: "200K",
                maxOutputTokens: "128K",
                capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
                parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
                recommendedFor: "复杂讲解、长文分析、主力默认位",
                supportsThinking: true,
                thinkingLabel: "支持 thinking.type 开关",
                tier: "current",
            },
            {
                id: "glm-4.7-flash",
                name: "GLM-4.7-FLASH",
                summary: "4.7 的高效 Flash 版，适合日常阅读问答、快速解释和较低延迟交互。",
                contextWindow: "200K",
                maxOutputTokens: "128K",
                capabilities: ["深度思考", "工具调用", "结构化输出", "流式输出", "上下文缓存"],
                parameters: ["temperature", "top_p", "max_tokens", "stream", "tools", "thinking.type"],
                recommendedFor: "快响应、低成本、日常主力",
                supportsThinking: true,
                thinkingLabel: "支持 thinking.type 开关",
                tier: "current",
            },
        ]);
    });

    it("falls back gracefully for unknown future models", () => {
        expect(buildGlmModelSummaries(["glm-future"])).toEqual([
            {
                id: "glm-future",
                name: "GLM-FUTURE",
                summary: "当前 key 官方枚举出的可用 GLM 模型。",
                contextWindow: "官方未标注",
                maxOutputTokens: "官方未标注",
                capabilities: ["流式输出"],
                parameters: ["temperature", "top_p", "max_tokens", "stream"],
                recommendedFor: undefined,
                supportsThinking: false,
                thinkingLabel: "参数能力未标注",
                tier: "current",
            },
        ]);
    });

    it("marks only supported models as thinking-capable", () => {
        expect(glmModelSupportsThinking("glm-5.1")).toBe(true);
        expect(glmModelSupportsThinking("glm-5")).toBe(true);
        expect(glmModelSupportsThinking("glm-4.7")).toBe(true);
        expect(glmModelSupportsThinking("glm-4.7-flash")).toBe(true);
        expect(glmModelSupportsThinking("glm-4-flash")).toBe(false);
    });

    it("exposes only the four GLM models selected for the settings panel", () => {
        expect(GLM_MODEL_LIBRARY.map((model) => model.id)).toEqual([
            "glm-5.1",
            "glm-5",
            "glm-4.7",
            "glm-4.7-flash",
        ]);
    });
});
