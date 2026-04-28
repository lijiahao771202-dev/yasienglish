"use client";

import { Mic, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ListeningReplayPanelProps {
    hasRecording: boolean;
    onPlayRecording: () => void;
    transcriptText?: string;
}

export function ListeningReplayPanel({
    hasRecording,
    onPlayRecording,
    transcriptText,
}: ListeningReplayPanelProps) {
    return (
        <div className="rounded-[1.6rem] border border-stone-200/80 bg-white/80 p-5 shadow-[0_16px_34px_rgba(28,25,23,0.05)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                        <Mic className="h-3.5 w-3.5 text-stone-400" />
                        Whisper Transcript
                    </div>
                    <div className="mt-3 rounded-[1.35rem] border border-sky-100 bg-sky-50/70 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">系统识别到你说的是</p>
                        <p className="mt-2 font-newsreader text-[1.45rem] leading-relaxed text-stone-800">
                            {transcriptText ? `“${transcriptText}”` : "这次没有拿到稳定转录，通常意味着录音太短、太轻，或者内容与目标句差距很大。"}
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 self-start">
                    <button
                        onClick={onPlayRecording}
                        disabled={!hasRecording}
                        className={cn(
                            "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all",
                            hasRecording
                                ? "border-rose-200/80 bg-rose-50 text-rose-600 hover:-translate-y-0.5 hover:bg-rose-100"
                                : "cursor-not-allowed border-stone-200 bg-stone-100/60 text-stone-400",
                        )}
                        title="播放我的录音"
                    >
                        <Play className="h-4 w-4 fill-current" />
                        播放我的录音
                    </button>
                </div>
            </div>
        </div>
    );
}
