"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Headphones, Heart, Mic, Sparkles } from "lucide-react";

type RebuildShadowingPromptVariant = "sentence" | "passage";

interface RebuildShadowingPromptBaseProps {
    chinese: string;
    onContinue: () => void;
    onStart: () => void;
    prefersReducedMotion: boolean | null;
    referenceEnglish: string;
    renderInteractiveCoachText: (text: string) => ReactNode;
    resolvedAt: number;
    variant: RebuildShadowingPromptVariant;
}

interface RebuildSentenceShadowingPromptProps extends RebuildShadowingPromptBaseProps {
    variant: "sentence";
}

interface RebuildPassageShadowingPromptProps extends RebuildShadowingPromptBaseProps {
    activePassageSegmentIndex: number;
    variant: "passage";
}

export type RebuildShadowingPromptProps =
    | RebuildSentenceShadowingPromptProps
    | RebuildPassageShadowingPromptProps;

export function RebuildShadowingPrompt(props: RebuildShadowingPromptProps) {
    if (props.variant === "sentence") {
        return (
            <motion.div
                key={`rebuild-shadowing-prompt-${props.resolvedAt}`}
                initial={props.prefersReducedMotion ? false : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: props.prefersReducedMotion ? 0.16 : 0.3 }}
                className="mx-auto w-full max-w-3xl rounded-[1.9rem] border border-stone-100 bg-white/94 p-6 shadow-[0_18px_34px_rgba(15,23,42,0.05)]"
            >
                <div className="flex items-start gap-3">
                    <div className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <Headphones className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-stone-500">Rebuild 提交成功</p>
                        <h3 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">要先做 Shadowing 训练吗？</h3>
                        <p className="mt-3 text-sm leading-7 text-stone-600">
                            这是可选训练，不影响 Elo / 连胜。你可以先练一遍跟读，再回来看本题重组评分。
                        </p>
                    </div>
                </div>

                <div className="mt-5 rounded-[1.35rem] border border-sky-100 bg-sky-50/60 px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">本题句子</p>
                    <div className="mt-2 text-lg leading-8 text-stone-800 font-newsreader">
                        {props.renderInteractiveCoachText(props.referenceEnglish)}
                    </div>
                    <p className="mt-2 text-sm leading-7 text-stone-500">{props.chinese}</p>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={props.onStart}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-emerald-300 bg-emerald-500 px-5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(16,185,129,0.25)] transition-all hover:-translate-y-0.5 hover:bg-emerald-600"
                    >
                        <Mic className="h-4 w-4" />
                        开始 Shadowing 训练
                    </button>
                    <button
                        type="button"
                        onClick={props.onContinue}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-700 transition-all hover:-translate-y-0.5 hover:bg-stone-50"
                    >
                        先看重组评分
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            key={`rebuild-passage-shadowing-prompt-${props.activePassageSegmentIndex}-${props.resolvedAt}`}
            initial={props.prefersReducedMotion ? false : { opacity: 0, y: 28, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={props.prefersReducedMotion ? { duration: 0.14 } : { type: "spring" as const, stiffness: 280, damping: 24, mass: 0.82 }}
            className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-[2.1rem] border border-pink-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,244,251,0.95))] p-6 shadow-[0_24px_56px_rgba(236,72,153,0.14)]"
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(251,207,232,0.55),transparent_70%)]" />
            <motion.div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-pink-200/45 blur-2xl"
                animate={props.prefersReducedMotion ? { opacity: 0.6 } : { opacity: [0.45, 0.8, 0.45], scale: [0.95, 1.08, 0.95] }}
                transition={{ duration: 2.8, repeat: props.prefersReducedMotion ? 0 : Infinity, ease: "easeInOut" }}
            />
            <div className="flex items-start gap-3">
                <div className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-pink-200 bg-pink-50 text-pink-600 shadow-[0_8px_16px_rgba(244,114,182,0.18)]">
                    <Heart className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-pink-500">Rebuild Passage · 第 {props.activePassageSegmentIndex + 1} 段</p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">要先做 Shadowing 训练吗？</h3>
                    <p className="mt-3 text-sm leading-7 text-stone-600">
                        可选训练，不影响 Elo / 连胜。先练一下当前段跟读，再返回短文继续就好。
                    </p>
                </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-pink-600">
                    <Sparkles className="h-3 w-3" />
                    CUTE MODE
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-emerald-600">
                    <Headphones className="h-3 w-3" />
                    SHADOWING
                </span>
            </div>

            <div className="mt-5 rounded-[1.45rem] border border-pink-100 bg-[linear-gradient(180deg,rgba(252,231,243,0.55),rgba(239,246,255,0.52))] px-4 py-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-pink-600">当前段句子</p>
                <div className="mt-2 text-lg leading-8 text-stone-800 font-newsreader">
                    {props.renderInteractiveCoachText(props.referenceEnglish)}
                </div>
                <p className="mt-2 text-sm leading-7 text-stone-500">{props.chinese}</p>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                    type="button"
                    onClick={props.onStart}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pink-300 bg-gradient-to-r from-pink-500 to-rose-500 px-5 text-sm font-bold text-white shadow-[0_12px_26px_rgba(244,114,182,0.3)] transition-all hover:-translate-y-0.5 hover:from-pink-600 hover:to-rose-600"
                >
                    <Mic className="h-4 w-4" />
                    开始 Shadowing 训练
                </button>
                <button
                    type="button"
                    onClick={props.onContinue}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-sky-200 bg-white/92 px-5 text-sm font-semibold text-sky-700 transition-all hover:-translate-y-0.5 hover:bg-sky-50"
                >
                    先继续短文
                    <ArrowRight className="h-4 w-4" />
                </button>
            </div>
        </motion.div>
    );
}
