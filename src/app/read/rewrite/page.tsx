"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useRef } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    GitBranch,
    Lightbulb,
    Loader2,
    PenTool,
    Quote,
    Rocket,
    RotateCcw,
} from "lucide-react";
import { PretextTextarea } from "@/components/ui/PretextTextarea";
import { useReadingSettings } from "@/contexts/ReadingSettingsContext";
import { cn } from "@/lib/utils";

type RewritePracticePrompt = {
    source_sentence_en: string;
    imitation_prompt_cn: string;
    rewrite_tips_cn: string[];
    pattern_focus_cn: string;
    sentence_skeleton_en?: string;
    vocab_hints?: Array<{ word_cn: string; word_en: string }>;
};

type RewritePracticeScore = {
    total_score: number;
    dimension_scores: {
        grammar: number;
        vocabulary: number;
        semantics: number;
        imitation: number;
    };
    feedback_cn: string;
    better_version_en: string;
    copy_similarity: number;
    copy_penalty_applied: boolean;
    improvement_points_cn: string[];
    corrections?: Array<{
        segment: string;
        correction: string;
        reason: string;
        category?: string;
    }>;
};

type RewritePracticeNavigationPayload = {
    openedAt: string;
    articleTitle?: string;
    articleUrl?: string;
    paragraphOrder: number;
    paragraphText: string;
};

type RewriteScoreNavigationPayload = {
    scoredAt: string;
    rewriteId: string;
    articleTitle?: string;
    articleUrl?: string;
    paragraphOrder: number;
    paragraphText: string;
    seenRewriteSentences: string[];
    source_sentence_en: string;
    imitation_prompt_cn: string;
    pattern_focus_cn: string;
    rewrite_tips_cn: string[];
    user_rewrite_en: string;
    score: RewritePracticeScore;
};

function RewritePracticePageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rewriteId = searchParams.get("id");
    const { fontClass, fontSizeClass } = useReadingSettings();

    const [payload, setPayload] = useState<RewritePracticeNavigationPayload | null>(null);
    const [rewritePrompt, setRewritePrompt] = useState<RewritePracticePrompt | null>(null);
    const [rewriteAttempt, setRewriteAttempt] = useState("");
    const [isGeneratingRewritePrompt, setIsGeneratingRewritePrompt] = useState(false);
    const [isScoringRewrite, setIsScoringRewrite] = useState(false);
    const [seenRewriteSentences, setSeenRewriteSentences] = useState<string[]>([]);
    const [rewriteCycleHint, setRewriteCycleHint] = useState<string | null>(null);

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleInsertText = (text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) {
            setRewriteAttempt(rewriteAttempt ? `${rewriteAttempt} ${text}` : text);
            return;
        }
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const nextValue = rewriteAttempt.substring(0, start) + text + rewriteAttempt.substring(end);
        setRewriteAttempt(nextValue);
        
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        }, 0);
    };

    useEffect(() => {
        if (!rewriteId || typeof window === "undefined") {
            setPayload(null);
            return;
        }

        const raw = window.sessionStorage.getItem(`rewrite-practice:${rewriteId}`);
        if (!raw) {
            setPayload(null);
            return;
        }

        try {
            const parsed = JSON.parse(raw) as RewritePracticeNavigationPayload;
            if (!parsed?.paragraphText?.trim()) {
                setPayload(null);
                return;
            }
            setPayload(parsed);
        } catch {
            setPayload(null);
        }
    }, [rewriteId]);

    const requestRewritePrompt = async (excludedSentences: string[]) => {
        if (!payload?.paragraphText) return;

        setIsGeneratingRewritePrompt(true);
        setRewriteCycleHint(null);

        try {
            const res = await fetch("/api/ai/rewrite-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "generate",
                    paragraphText: payload.paragraphText,
                    excludedSentences,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Failed to generate rewrite prompt");
            }

            const prompt = data as RewritePracticePrompt;
            const selectedSentence = prompt.source_sentence_en?.trim();
            if (!selectedSentence) {
                throw new Error("No sentence selected for rewrite practice");
            }

            setRewritePrompt(prompt);
            setRewriteAttempt("");

            const seenSet = new Set(excludedSentences);
            const hasLooped = seenSet.size > 0 && seenSet.has(selectedSentence);
            if (hasLooped) {
                setSeenRewriteSentences([selectedSentence]);
                setRewriteCycleHint("这一段已经轮询完一遍，已重新开始抽句。");
            } else {
                setSeenRewriteSentences((prev) => (
                    prev.includes(selectedSentence) ? prev : [...prev, selectedSentence]
                ));
            }
        } catch (error) {
            console.error(error);
            setRewritePrompt(null);
            setRewriteCycleHint("暂时无法生成仿写句，请稍后重试。");
        } finally {
            setIsGeneratingRewritePrompt(false);
        }
    };

    useEffect(() => {
        if (!payload?.paragraphText) return;
        setRewritePrompt(null);
        setRewriteAttempt("");
        setSeenRewriteSentences([]);
        setRewriteCycleHint(null);
        if (typeof window !== "undefined" && rewriteId) {
            const continueMode = searchParams.get("continue") === "1";
            if (continueMode) {
                const progressRaw = window.sessionStorage.getItem(`rewrite-progress:${rewriteId}`);
                if (progressRaw) {
                    try {
                        const progress = JSON.parse(progressRaw) as { seenRewriteSentences?: string[] };
                        void requestRewritePrompt(Array.isArray(progress.seenRewriteSentences) ? progress.seenRewriteSentences : []);
                        return;
                    } catch {
                        // fall back to the initial sentence below
                    }
                }
            }
        }
        void requestRewritePrompt([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payload?.paragraphText, rewriteId, searchParams]);

    const handleShuffleRewriteSentence = async () => {
        if (isGeneratingRewritePrompt) return;
        await requestRewritePrompt(seenRewriteSentences);
    };

    const navigateToRewriteScorePage = (scorePayload: RewriteScoreNavigationPayload) => {
        if (typeof window === "undefined") return;
        const reviewId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.sessionStorage.setItem(`rewrite-score:${reviewId}`, JSON.stringify(scorePayload));
        router.push(`/read/rewrite-score?id=${reviewId}`);
    };

    const handleScoreRewrite = async () => {
        if (!payload || !rewritePrompt || !rewriteAttempt.trim()) return;

        setIsScoringRewrite(true);
        setRewriteCycleHint(null);
        try {
            const res = await fetch("/api/ai/rewrite-practice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "score",
                    source_sentence_en: rewritePrompt.source_sentence_en,
                    imitation_prompt_cn: rewritePrompt.imitation_prompt_cn,
                    user_rewrite_en: rewriteAttempt,
                    strict_semantic_match: false,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Failed to score rewrite practice");
            }

            const nextScore = data as RewritePracticeScore;
            if (typeof window !== "undefined" && rewriteId) {
                window.sessionStorage.setItem(
                    `rewrite-progress:${rewriteId}`,
                    JSON.stringify({ seenRewriteSentences }),
                );
            }
            navigateToRewriteScorePage({
                scoredAt: new Date().toISOString(),
                rewriteId: rewriteId ?? "",
                articleTitle: payload.articleTitle,
                articleUrl: payload.articleUrl,
                paragraphOrder: payload.paragraphOrder,
                paragraphText: payload.paragraphText,
                seenRewriteSentences,
                source_sentence_en: rewritePrompt.source_sentence_en,
                imitation_prompt_cn: rewritePrompt.imitation_prompt_cn,
                pattern_focus_cn: rewritePrompt.pattern_focus_cn,
                rewrite_tips_cn: rewritePrompt.rewrite_tips_cn,
                user_rewrite_en: rewriteAttempt,
                score: nextScore,
            });
        } catch (error) {
            console.error(error);
            setRewriteCycleHint("评分失败，请稍后重试。");
        } finally {
            setIsScoringRewrite(false);
        }
    };

    const returnHref = payload?.articleUrl
        ? `/read?from=rewrite&url=${encodeURIComponent(payload.articleUrl)}`
        : "/read?from=home";

    if (!payload) {
        return (
            <main className="min-h-screen bg-[var(--theme-base-bg)] px-4 py-12 sm:px-6 flex items-center justify-center">
                <div className="mx-auto max-w-md w-full rounded-2xl border border-[color-mix(in_srgb,var(--theme-border)_25%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_65%,transparent)] p-6 shadow-lg backdrop-blur-md text-center">
                    <h1 className="text-xl font-bold text-[var(--theme-text)]">未找到仿写练习上下文</h1>
                    <p className="mt-2 text-xs text-[var(--theme-text-muted)]">请从完整测试里的仿写练习进入。</p>
                    <Link
                        href="/read?from=home"
                        className="mt-5 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--theme-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_80%,transparent)] px-4 py-2 text-xs font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] shadow-2xs transition hover:scale-[1.01]"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        返回阅读页
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="h-screen overflow-hidden bg-[var(--theme-base-bg)] bg-[radial-gradient(circle_at_18%_14%,color-mix(in_srgb,var(--theme-active-bg,theme(colors.orange.400))_12%,transparent),transparent_32%),radial-gradient(circle_at_78%_10%,color-mix(in_srgb,var(--theme-active-bg,theme(colors.indigo.400))_8%,transparent),transparent_32%)] px-4 py-4 sm:px-6 sm:py-4 text-[var(--theme-text)]">
            <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <Link
                        href={returnHref}
                        className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--theme-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_80%,transparent)] px-3.5 py-1.5 text-[12px] font-bold text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] shadow-2xs hover:scale-[1.01] transition-all duration-200 cursor-pointer"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回阅读
                    </Link>
                </div>

                <section className="relative flex-1 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--theme-border)_25%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_65%,transparent)] p-4 shadow-lg sm:p-5 flex flex-col justify-between">
                    <div className="relative mx-auto flex h-full w-full max-w-[920px] flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--theme-card-bg)_90%,transparent)] border border-[color-mix(in_srgb,var(--theme-border)_20%,transparent)] text-[var(--theme-active-bg,theme(colors.indigo.500))] shadow-3xs">
                                    <PenTool className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--theme-active-bg,theme(colors.indigo.600))]">Rewrite Studio</p>
                                    <h1 className="mt-0.5 text-[1.4rem] font-black tracking-tight text-[var(--theme-text)] sm:text-[1.6rem]">仿写模式</h1>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <div className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--theme-border)_20%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_90%,transparent)] px-3 py-1.5 text-[10.5px] font-bold text-[var(--theme-text-muted)]">
                                    <span className="h-2 w-2 rounded-full bg-[var(--theme-active-bg,theme(colors.orange.500))]" />
                                    LIVE SESSION
                                </div>
                                {payload.articleTitle ? (
                                    <span className="max-w-[32ch] truncate rounded-full border border-[color-mix(in_srgb,var(--theme-border)_20%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_90%,transparent)] px-3 py-1.5 text-[10px] font-bold text-[var(--theme-active-bg,theme(colors.indigo.600))]">
                                        {payload.articleTitle} · 第 {payload.paragraphOrder} 段
                                    </span>
                                ) : null}
                                <button
                                    onClick={() => void handleShuffleRewriteSentence()}
                                    disabled={isGeneratingRewritePrompt}
                                    className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--theme-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_80%,transparent)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--theme-active-bg,theme(colors.indigo.600))] shadow-2xs hover:scale-[1.01] transition duration-200 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                >
                                    {isGeneratingRewritePrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                    换一句
                                </button>
                            </div>
                        </div>

                        {rewriteCycleHint ? (
                            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
                                {rewriteCycleHint}
                            </div>
                        ) : null}

                        <div className="flex flex-1 flex-col gap-4 lg:min-h-0">
                            {/* Target Sentence Box */}
                            <div className="rounded-xl border border-[color-mix(in_srgb,var(--theme-border)_20%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_50%,transparent)] px-4 py-3 shadow-2xs">
                                <div className="mb-1.5 flex items-center gap-1.5 text-[var(--theme-active-bg,theme(colors.indigo.500))]">
                                    <Quote className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">Target Sentence</span>
                                </div>
                                {isGeneratingPrompt ? (
                                    <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--theme-text-muted)]">
                                        <Loader2 className="h-4 w-4 animate-spin text-[var(--theme-active-bg,theme(colors.orange.500))]" />
                                        正在抽取适合仿写的句子…
                                    </div>
                                ) : rewritePrompt ? (
                                    <p className="text-[14.5px] sm:text-[16px] font-bold leading-relaxed text-[var(--theme-text)]">
                                        {rewritePrompt.source_sentence_en}
                                    </p>
                                ) : (
                                    <p className="text-[13px] font-medium text-[var(--theme-text-muted)]">暂时无法生成仿写句，请点击“换一句”重试。</p>
                                )}
                            </div>

                            {/* Prompt helper Cards (Structure & Inspiration Grid) */}
                            {rewritePrompt && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                    {/* Left Side: Structure & Formula */}
                                    <div className="rounded-xl bg-[color-mix(in_srgb,var(--theme-card-bg)_40%,transparent)] border border-[color-mix(in_srgb,var(--theme-border)_25%,transparent)] p-3 shadow-2xs flex flex-col justify-between space-y-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--theme-text-muted)] opacity-85 uppercase tracking-wider">
                                                <GitBranch className="h-3.5 w-3.5 text-[var(--theme-active-bg,theme(colors.indigo.500))]" strokeWidth={2} />
                                                <span>句型公式 · Structure</span>
                                            </div>
                                            <p className="text-[12px] leading-relaxed font-medium text-[var(--theme-text)] opacity-95">
                                                {rewritePrompt.pattern_focus_cn}
                                            </p>
                                            {rewritePrompt.rewrite_tips_cn && rewritePrompt.rewrite_tips_cn.length > 0 && (
                                                <p className="text-[11px] text-[var(--theme-text-muted)] font-normal leading-normal">
                                                    提示：{rewritePrompt.rewrite_tips_cn.join(" / ")}
                                                </p>
                                            )}
                                        </div>
                                        {rewritePrompt.sentence_skeleton_en && (
                                            <div 
                                                className="rounded-lg bg-[color-mix(in_srgb,var(--theme-card-bg)_60%,transparent)] border border-[color-mix(in_srgb,var(--theme-border)_35%,transparent)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--theme-text)] shadow-3xs"
                                            >
                                                <span className="break-words leading-relaxed font-medium">{rewritePrompt.sentence_skeleton_en}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Side: Inspiration & Vocab */}
                                    <div className="rounded-xl bg-[color-mix(in_srgb,var(--theme-card-bg)_40%,transparent)] border border-[color-mix(in_srgb,var(--theme-border)_25%,transparent)] p-3 shadow-2xs flex flex-col justify-between space-y-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--theme-text-muted)] opacity-85 uppercase tracking-wider">
                                                <Lightbulb className="h-3.5 w-3.5 text-[var(--theme-active-bg,theme(colors.indigo.500))]" strokeWidth={2} />
                                                <span>仿写灵感 · Inspiration</span>
                                            </div>
                                            <p className="text-[12px] leading-relaxed font-medium text-[var(--theme-text)] opacity-95">{rewritePrompt.imitation_prompt_cn}</p>
                                        </div>

                                        {rewritePrompt.vocab_hints && rewritePrompt.vocab_hints.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-1 pt-1">
                                                {rewritePrompt.vocab_hints.map((hint, index) => (
                                                    <button
                                                        key={`${hint.word_en}-${index}`}
                                                        type="button"
                                                        onClick={() => handleInsertText(hint.word_en)}
                                                        className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--theme-active-bg)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--theme-active-bg)_18%,transparent)] px-2 py-0.5 text-[10px] font-medium text-[var(--theme-text)] border border-[color-mix(in_srgb,var(--theme-border)_20%,transparent)] transition active:scale-95 cursor-pointer shadow-3xs"
                                                        title="点击插入词汇"
                                                    >
                                                        <span className="opacity-90">{hint.word_cn}</span>
                                                        <span className="opacity-40">·</span>
                                                        <span className="font-mono font-semibold opacity-95">{hint.word_en}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Textarea Input Panel */}
                            <div className="relative mt-auto rounded-xl border border-[color-mix(in_srgb,var(--theme-border)_40%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_60%,transparent)] shadow-2xs overflow-hidden">
                                <PretextTextarea
                                    ref={textareaRef}
                                    value={rewriteAttempt}
                                    onChange={(event) => setRewriteAttempt(event.target.value)}
                                    placeholder="试着按这个句式改写成你自己的英文句子..."
                                    className="w-full resize-none bg-transparent px-4 py-3.5 pb-16 text-[14px] leading-relaxed text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] opacity-85 outline-none focus:outline-none"
                                    minRows={4}
                                    maxRows={6}
                                />
                                <div className="absolute right-3 bottom-3 flex items-center pointer-events-auto">
                                    <button
                                        onClick={() => void handleScoreRewrite()}
                                        disabled={isScoringRewrite || isGeneratingRewritePrompt || !rewritePrompt || !rewriteAttempt.trim()}
                                        className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full px-4.5 py-1.5 text-[11px] font-bold shadow-2xs active:scale-95 transition duration-200 cursor-pointer",
                                            rewriteAttempt.trim() && !isScoringRewrite
                                                ? "bg-[var(--theme-active-bg,theme(colors.indigo.600))] hover:opacity-90 text-white border border-black/10"
                                                : "cursor-not-allowed border-[color-mix(in_srgb,var(--theme-border)_30%,transparent)] bg-[color-mix(in_srgb,var(--theme-card-bg)_40%,transparent)] text-[var(--theme-text-muted)] opacity-60",
                                        )}
                                    >
                                        {isScoringRewrite ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                                        提交评分
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}

export default function RewritePracticePage() {
    return (
        <Suspense fallback={null}>
            <RewritePracticePageContent />
        </Suspense>
    );
}
