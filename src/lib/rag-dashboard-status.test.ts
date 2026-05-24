import { describe, expect, it } from "vitest";

import { getBgeStatusView, isVectorModelSelectDisabled } from "./rag-dashboard-status";

describe("rag-dashboard-status", () => {
    it("keeps the model selector available while the current model is loading or errored", () => {
        expect(isVectorModelSelectDisabled({ status: "loading", isBusy: false, isIngestingSysVocab: false })).toBe(false);
        expect(isVectorModelSelectDisabled({ status: "error", isBusy: false, isIngestingSysVocab: false })).toBe(false);
    });

    it("locks the model selector only during vector writes", () => {
        expect(isVectorModelSelectDisabled({ status: "ready", isBusy: true, isIngestingSysVocab: false })).toBe(true);
        expect(isVectorModelSelectDisabled({ status: "ready", isBusy: false, isIngestingSysVocab: true })).toBe(true);
    });

    it("exposes loading and error copy for the RAG dashboard", () => {
        expect(getBgeStatusView("loading", null)).toEqual({
            dotClassName: "bg-amber-500 shadow-amber-500/50",
            label: "算力引擎：下载/加载模型中...",
            detail: null,
        });
        expect(getBgeStatusView("error", "network failed")).toEqual({
            dotClassName: "bg-red-500 shadow-red-500/50",
            label: "算力引擎：模型加载失败",
            detail: "network failed",
        });
    });
});
