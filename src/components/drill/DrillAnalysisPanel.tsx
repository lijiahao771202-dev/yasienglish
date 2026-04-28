"use client";

import type { ReactNode } from "react";

export interface DrillAnalysisPanelProps {
    analysisError: string | null;
    analysisRequested: boolean;
    defaultNode: ReactNode;
    hasDetailedAnalysis: boolean;
    isGeneratingAnalysis: boolean;
    listeningNode: ReactNode;
    mode: string;
    onRetry: () => void;
    translationNode: ReactNode;
}

export function DrillAnalysisPanel({
    analysisError,
    analysisRequested,
    defaultNode,
    hasDetailedAnalysis,
    isGeneratingAnalysis,
    listeningNode,
    mode,
    onRetry,
    translationNode,
}: DrillAnalysisPanelProps) {
    if (!analysisRequested) {
        return null;
    }

    return (
        <div className="rounded-[2rem] border border-stone-100 bg-white/90 p-6 shadow-xl shadow-stone-200/50 backdrop-blur-sm">
            {isGeneratingAnalysis ? (
                <div className="py-10 flex flex-col items-center gap-3 text-center">
                    <div className="w-10 h-10 rounded-full border-2 border-amber-200 border-t-amber-500 animate-spin" />
                    <p className="text-sm font-semibold text-stone-700">正在生成解析</p>
                    <p className="text-xs text-stone-400">按需生成，避免每题都额外消耗 token。</p>
                </div>
            ) : analysisError ? (
                <div className="py-6 flex flex-col items-center gap-3 text-center">
                    <p className="text-sm font-semibold text-rose-600">解析生成失败</p>
                    <p className="text-xs text-stone-400">{analysisError}</p>
                    <button
                        onClick={onRetry}
                        className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
                    >
                        重新生成解析
                    </button>
                </div>
            ) : hasDetailedAnalysis ? (
                mode === "translation" ? translationNode : mode === "listening" ? listeningNode : defaultNode
            ) : null}
        </div>
    );
}
