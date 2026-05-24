import type { BGEStatus } from "./bge-client";

interface VectorModelSelectState {
    status: BGEStatus;
    isBusy: boolean;
    isIngestingSysVocab: boolean;
}

export function isVectorModelSelectDisabled({
    isBusy,
    isIngestingSysVocab,
}: VectorModelSelectState) {
    return isBusy || isIngestingSysVocab;
}

export function getBgeStatusView(status: BGEStatus, error: string | null) {
    if (status === "ready") {
        return {
            dotClassName: "bg-emerald-500 animate-pulse shadow-emerald-500/50",
            label: "算力引擎：在线计算中",
            detail: null,
        };
    }

    if (status === "error") {
        return {
            dotClassName: "bg-red-500 shadow-red-500/50",
            label: "算力引擎：模型加载失败",
            detail: error,
        };
    }

    if (status === "loading") {
        return {
            dotClassName: "bg-amber-500 shadow-amber-500/50",
            label: "算力引擎：下载/加载模型中...",
            detail: null,
        };
    }

    return {
        dotClassName: "bg-stone-400 shadow-stone-400/50",
        label: "算力引擎：待启动",
        detail: null,
    };
}
