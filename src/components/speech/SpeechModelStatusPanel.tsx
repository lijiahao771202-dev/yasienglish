"use client";

import { DownloadCloud, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { DesktopSpeechModelProgress, formatBytes, formatSpeechModelStatusMessage } from "@/lib/speech-input";

interface SpeechModelStatusPanelProps {
    progress: DesktopSpeechModelProgress;
    onDownload: () => Promise<unknown> | unknown;
    compact?: boolean;
}

export function SpeechModelStatusPanel({
    progress,
    onDownload,
    compact = false,
}: SpeechModelStatusPanelProps) {
    const isReady = progress.status === "ready";
    const isDownloading = progress.status === "downloading";
    const isFailed = progress.status === "failed";
    const completion = progress.totalBytes
        ? Math.max(0, Math.min(100, Math.round((progress.downloadedBytes / progress.totalBytes) * 100)))
        : 0;

    return (
        <div
            className={cn(
                "rounded-[1.6rem] border bg-white/82 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.18)] backdrop-blur-xl",
                compact ? "border-stone-200 px-4 py-3" : "border-stone-200 px-5 py-4",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-400">Local Speech Model</p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">{formatSpeechModelStatusMessage(progress)}</p>
                </div>
                <span
                    className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        isReady
                            ? "bg-emerald-50 text-emerald-700"
                            : isFailed
                                ? "bg-rose-50 text-rose-700"
                                : isDownloading
                                    ? "bg-indigo-50 text-indigo-700"
                                    : "bg-amber-50 text-amber-700",
                    )}
                >
                    {isReady ? <ShieldCheck className="h-3.5 w-3.5" /> : isFailed ? <TriangleAlert className="h-3.5 w-3.5" /> : <DownloadCloud className="h-3.5 w-3.5" />}
                    {isReady ? "已就绪" : isFailed ? "下载失败" : isDownloading ? "下载中" : "未安装"}
                </span>
            </div>

            {isDownloading ? (
                <div className="mt-3 space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-[width] duration-300"
                            style={{ width: `${completion}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-xs text-stone-500">
                        <span>{completion}%</span>
                        <span>
                            {formatBytes(progress.downloadedBytes)}
                            {progress.totalBytes ? ` / ${formatBytes(progress.totalBytes)}` : ""}
                        </span>
                    </div>
                </div>
            ) : null}

            {!isReady ? (
                <button
                    type="button"
                    onClick={() => void onDownload()}
                    disabled={isDownloading}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : isFailed ? <RefreshCw className="h-4 w-4" /> : <DownloadCloud className="h-4 w-4" />}
                    {isDownloading ? "下载中…" : isFailed ? "重试下载" : "下载语音模型"}
                </button>
            ) : null}

            {progress.modelPath ? (
                <p className="mt-2 text-[11px] leading-5 text-stone-400 break-all">{progress.modelPath}</p>
            ) : null}
        </div>
    );
}
