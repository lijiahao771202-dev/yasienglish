"use client";

import { ChangeEvent } from "react";
import { RefreshCw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { PretextTextarea } from "../ui/PretextTextarea";

export interface DictationInputStageProps {
    disabled: boolean;
    isSubmitting: boolean;
    onChange: (value: string) => void;
    onSubmit: () => void;
    value: string;
}

export function DictationInputStage({
    disabled,
    isSubmitting,
    onChange,
    onSubmit,
    value,
}: DictationInputStageProps) {
    const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(event.target.value);
    };

    return (
        <div className="w-full max-w-2xl">
            <div className="rounded-[1.2rem] border border-purple-200/80 bg-[linear-gradient(180deg,rgba(250,245,255,0.94),rgba(255,255,255,0.95))] p-3 shadow-[0_10px_24px_rgba(88,28,135,0.09)]">
                <div className="mb-2.5 text-left">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-purple-700">Dictation</p>
                    <p className="mt-1 text-[13px] leading-5 text-purple-900/80">听音频后直接写中文，按语义准确度评分。</p>
                </div>
                <PretextTextarea
                    value={value}
                    onChange={handleChange}
                    placeholder="听完后写中文（可意译，但要保留核心信息）..."
                    disabled={disabled}
                    minRows={3}
                    maxRows={12}
                    className="min-h-[88px] w-full resize-none rounded-xl border border-purple-100/80 bg-white px-3 py-2.5 text-[14px] leading-6 text-stone-800 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-200/60 disabled:cursor-not-allowed disabled:opacity-70"
                />
                <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-stone-400">字数：{value.trim().length}</span>
                    <button
                        onClick={onSubmit}
                        disabled={!value.trim() || isSubmitting}
                        className={cn(
                            "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-all",
                            (!value.trim() || isSubmitting)
                                ? "cursor-not-allowed border border-stone-300/70 bg-white/70 text-stone-400"
                                : "border border-purple-500/80 bg-purple-500 text-white shadow-[0_10px_24px_rgba(168,85,247,0.28)] hover:-translate-y-0.5 hover:bg-purple-600"
                        )}
                    >
                        {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        {isSubmitting ? "评分中..." : "提交听写"}
                    </button>
                </div>
            </div>
        </div>
    );
}
