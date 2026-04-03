"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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

type RewritePracticePrompt = {
    source_sentence_en: string;
    imitation_prompt_cn: string;
    rewrite_tips_cn: string[];
    pattern_focus_cn: string;
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

export default function RewritePracticePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const rewriteId = searchParams.get("id");

    const [payload, setPayload] = useState<RewritePracticeNavigationPayload | null>(null);
    const [rewritePrompt, setRewritePrompt] = useState<RewritePracticePrompt | null>(null);
    const [rewriteAttempt, setRewriteAttempt] = useState("");
    const [isGeneratingRewritePrompt, setIsGeneratingRewritePrompt] = useState(false);
    const [isScoringRewrite, setIsScoringRewrite] = useState(false);
    const [seenRewriteSentences, setSeenRewriteSentences] = useState<string[]>([]);
    const [rewriteCycleHint, setRewriteCycleHint] = useState<string | null>(null);

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
        if (!rewritePrompt || !rewriteAttempt.trim()) return;

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
            <main className="min-h-screen bg-[#ede7d8] px-4 py-12 sm:px-6">
                <div className="mx-auto max-w-3xl rounded-[32px] bg-[#e8eaf0] p-8 shadow-[18px_18px_40px_rgba(15,23,42,0.11),-16px_-16px_36px_rgba(255,255,255,0.72)]">
                    <h1 className="text-2xl font-black text-[#1f2435]">未找到仿写练习上下文</h1>
                    <p className="mt-3 text-sm text-[#585a68]">请从阅读页的段落工具栏进入仿写模式。</p>
                    <Link
                        href="/read?from=home"
                        className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#585a68] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回阅读页
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="h-screen overflow-hidden bg-[radial-gradient(circle_at_18%_14%,rgba(246,173,85,0.16),transparent_32%),radial-gradient(circle_at_78%_10%,rgba(99,102,241,0.12),transparent_32%),linear-gradient(180deg,#e7ddca_0%,#ece8de_46%,#efe9de_100%)] px-4 py-4 sm:px-6 sm:py-4">
            <div className="mx-auto flex h-full max-w-[1280px] flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <Link
                        href={returnHref}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#585a68] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回阅读
                    </Link>
                </div>

                <section className="relative flex-1 overflow-hidden rounded-[40px] bg-[#e8eaf0] p-4 shadow-[18px_18px_40px_rgba(15,23,42,0.11),-16px_-16px_36px_rgba(255,255,255,0.72)] sm:p-5">
                    <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-[#f6ad55]/20 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-16 -left-14 h-52 w-52 rounded-full bg-[#c6f6d5]/30 blur-3xl" />

                    <div className="relative mx-auto flex h-full w-full max-w-[920px] flex-col gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-white text-[#f6ad55] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]">
                                    <PenTool className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#6366f1]">Rewrite Studio</p>
                                    <h1 className="mt-1 text-[1.55rem] font-black tracking-tight text-[#1f2435] sm:text-[1.75rem]">仿写模式</h1>
                                    <p className="mt-1 text-[12px] font-medium text-[#585a68]">Step into the shoes of a native speaker</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <div className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-black text-[#585a68] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]">
                                    <span className="h-2.5 w-2.5 rounded-full bg-[#f6ad55]" />
                                    LIVE SESSION
                                </div>
                                {payload.articleTitle ? (
                                    <span className="max-w-[32ch] truncate rounded-full bg-white px-3 py-1.5 text-[10px] font-black text-[#6366f1] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]">
                                        {payload.articleTitle} · 第 {payload.paragraphOrder} 段
                                    </span>
                                ) : null}
                                <button
                                    onClick={() => void handleShuffleRewriteSentence()}
                                    disabled={isGeneratingRewritePrompt}
                                    className="inline-flex items-center gap-2 rounded-full bg-[#e8eaf0] px-3 py-1.5 text-[11px] font-black text-[#6366f1] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isGeneratingRewritePrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                    换一句
                                </button>
                            </div>
                        </div>

                        {rewriteCycleHint ? (
                            <div className="rounded-[22px] bg-[#fff4d8] px-4 py-3 text-sm font-medium text-[#9a6700] shadow-[inset_4px_4px_9px_rgba(15,23,42,0.04),inset_-4px_-4px_9px_rgba(255,255,255,0.75)]">
                                {rewriteCycleHint}
                            </div>
                        ) : null}

                        <div className="flex flex-1 flex-col gap-5 lg:min-h-0">
                            <div className="rounded-[30px] bg-[#eef1f8] px-5 py-4 shadow-[inset_8px_8px_16px_rgba(15,23,42,0.06),inset_-8px_-8px_16px_rgba(255,255,255,0.78)] sm:px-6 sm:py-5">
                                <div className="mb-2 flex items-center gap-2 text-[#6366f1]">
                                    <Quote className="h-4 w-4" />
                                    <span className="text-[11px] font-black uppercase tracking-[0.22em]">Target Sentence</span>
                                </div>
                                {isGeneratingRewritePrompt ? (
                                    <div className="flex items-center gap-2 text-sm font-medium text-[#585a68]">
                                        <Loader2 className="h-4 w-4 animate-spin text-[#f6ad55]" />
                                        正在抽取适合仿写的句子…
                                    </div>
                                ) : rewritePrompt ? (
                                    <p className="text-[1.02rem] font-semibold leading-[1.72] text-[#1f2435] sm:text-[1.28rem]">
                                        {rewritePrompt.source_sentence_en}
                                    </p>
                                ) : (
                                    <p className="text-sm font-medium text-[#585a68]">暂时无法生成仿写句，请点击“换一句”重试。</p>
                                )}
                            </div>

                            {rewritePrompt && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-[26px] bg-[#c6f6d5]/34 px-5 py-4 shadow-[9px_9px_18px_rgba(15,23,42,0.05),-7px_-7px_14px_rgba(255,255,255,0.6)]">
                                        <div className="flex items-start gap-4">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-white text-green-600 shadow-[5px_5px_12px_rgba(15,23,42,0.07),-5px_-5px_12px_rgba(255,255,255,0.68)]">
                                                <Lightbulb className="h-4 w-4 fill-current" />
                                            </div>
                                            <div>
                                                <p className="text-[1rem] font-black text-green-800">Inspiration</p>
                                                <p className="mt-1 text-[13px] leading-6 text-green-900/90">{rewritePrompt.imitation_prompt_cn}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-[26px] bg-[#e9d8fd]/38 px-5 py-4 shadow-[9px_9px_18px_rgba(15,23,42,0.05),-7px_-7px_14px_rgba(255,255,255,0.6)]">
                                        <div className="flex items-start gap-4">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] bg-white text-purple-600 shadow-[5px_5px_12px_rgba(15,23,42,0.07),-5px_-5px_12px_rgba(255,255,255,0.68)]">
                                                <GitBranch className="h-4 w-4" />
                                            </div>
                                            <div>
                                                <p className="text-[1rem] font-black text-purple-800">Structure Focus</p>
                                                <p className="mt-1 text-[13px] leading-6 text-purple-900/92">{rewritePrompt.pattern_focus_cn}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {rewritePrompt?.rewrite_tips_cn?.length ? (
                                <div className="px-1">
                                    <p className="text-[12px] font-black uppercase tracking-[0.18em] text-[#585a68]">Expert Advice</p>
                                    <div className="mt-3 space-y-2.5">
                                        {rewritePrompt.rewrite_tips_cn.slice(0, 2).map((tip, idx) => (
                                            <div key={`${tip}-${idx}`} className="flex items-center gap-4">
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#6366f1] shadow-[5px_5px_12px_rgba(15,23,42,0.07),-5px_-5px_12px_rgba(255,255,255,0.68)]">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                </div>
                                                <p className="text-[13px] font-medium leading-6 text-[#2e3040]">{tip}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            <div className="relative mt-auto rounded-[32px] bg-[#dde1ea] p-2 shadow-[inset_9px_9px_18px_rgba(15,23,42,0.06),inset_-9px_-9px_18px_rgba(255,255,255,0.74)]">
                                <PretextTextarea
                                    value={rewriteAttempt}
                                    onChange={(event) => setRewriteAttempt(event.target.value)}
                                    placeholder="Write your version here..."
                                    className="min-h-[122px] w-full resize-none rounded-[26px] border-none bg-transparent px-5 py-4 pr-32 text-[14px] font-medium leading-6 text-[#1f2435] placeholder:text-[#a1a5b5] focus:outline-none sm:px-6 sm:py-5 sm:pr-40"
                                    minRows={4}
                                    maxRows={7}
                                />
                                <div className="pointer-events-none absolute inset-x-6 bottom-5 h-14 rounded-full bg-[radial-gradient(circle_at_center,rgba(246,173,85,0.12),transparent_70%)] blur-2xl" />
                                <div className="absolute bottom-4 right-4 sm:bottom-5 sm:right-5">
                                    <button
                                        onClick={() => void handleScoreRewrite()}
                                        disabled={isScoringRewrite || isGeneratingRewritePrompt || !rewritePrompt || !rewriteAttempt.trim()}
                                        className="inline-flex items-center gap-2 rounded-full bg-[#f6ad55] px-4 py-2 text-[12px] font-black text-white shadow-[10px_10px_20px_rgba(15,23,42,0.12),-8px_-8px_16px_rgba(255,255,255,0.2)] transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-55 sm:px-5 sm:py-2.5"
                                    >
                                        {isScoringRewrite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
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
