"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ArrowLeft, CircleCheckBig, TriangleAlert } from "lucide-react";

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

type RewriteScoreNavigationPayload = {
    scoredAt: string;
    articleTitle?: string;
    articleUrl?: string;
    paragraphOrder: number;
    source_sentence_en: string;
    imitation_prompt_cn: string;
    pattern_focus_cn: string;
    rewrite_tips_cn: string[];
    user_rewrite_en: string;
    score: RewritePracticeScore;
};

function formatTime(iso: string | undefined) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function scoreTone(score: number) {
    if (score >= 85) return "text-emerald-600";
    if (score >= 70) return "text-amber-600";
    return "text-rose-600";
}

function RewriteScoreContent() {
    const searchParams = useSearchParams();
    const scoreId = searchParams.get("id");

    const payload = useMemo(() => {
        if (!scoreId || typeof window === "undefined") {
            return null;
        }

        const raw = window.sessionStorage.getItem(`rewrite-score:${scoreId}`);
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw) as RewriteScoreNavigationPayload;
            if (!parsed?.score || !parsed?.source_sentence_en) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }, [scoreId]);

    const scoredAt = useMemo(() => formatTime(payload?.scoredAt), [payload?.scoredAt]);

    if (!payload) {
        return (
            <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(253,230,138,0.28),transparent_48%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-14 sm:px-6">
                <div className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/88 p-8 shadow-[0_40px_85px_-52px_rgba(15,23,42,0.65)]">
                    <h1 className="text-2xl font-bold text-slate-900">未找到仿写评分记录</h1>
                    <p className="mt-3 text-sm text-slate-600">请从阅读页进入仿写模式并提交评分后查看。</p>
                    <Link
                        href="/read?from=home"
                        className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回阅读页
                    </Link>
                </div>
            </main>
        );
    }

    const score = payload.score;
    const returnHref = payload.articleUrl
        ? `/read?from=rewrite-score&url=${encodeURIComponent(payload.articleUrl)}`
        : "/read?from=home";

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_18%_8%,rgba(253,224,71,0.2),transparent_45%),radial-gradient(circle_at_92%_14%,rgba(147,197,253,0.18),transparent_42%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-10 sm:px-6 sm:py-14">
            <div className="mx-auto max-w-4xl space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                        href={returnHref}
                        className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/88 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_14px_26px_-18px_rgba(15,23,42,0.55)] transition hover:text-slate-900"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回阅读继续练
                    </Link>
                    {scoredAt ? <p className="text-xs font-medium text-slate-500">评分时间：{scoredAt}</p> : null}
                </div>

                <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-[0_44px_86px_-52px_rgba(15,23,42,0.62)] sm:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-amber-600">Rewrite Score</p>
                            <h1 className="mt-1.5 text-3xl font-bold text-slate-900">仿写评分结果</h1>
                            <p className="mt-2 text-sm text-slate-600">
                                {payload.articleTitle ? `${payload.articleTitle} · ` : ""}第 {payload.paragraphOrder} 段
                            </p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">总分</p>
                            <p className={`mt-1 text-4xl font-bold ${scoreTone(score.total_score)}`}>{score.total_score}</p>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">原句</p>
                            <p className="mt-2 text-xl leading-8 text-slate-900">{payload.source_sentence_en}</p>
                        </div>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">灵感提示（可选）</p>
                            <p className="mt-2 text-base leading-7 text-emerald-900">{payload.imitation_prompt_cn}</p>
                            <p className="mt-1 text-[11px] text-emerald-700/85">这是仿写灵感线索，不要求和原句语义一一对应，可自由替换场景和主语。</p>
                            <p className="mt-3 text-xs text-emerald-700/90">结构焦点：{payload.pattern_focus_cn}</p>
                        </div>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white/92">
                        <div className="bg-blue-50/70 px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">你的仿写</p>
                            <p className="mt-2 text-lg leading-8 text-blue-950">{payload.user_rewrite_en}</p>
                        </div>

                        <div className="border-t border-slate-200/80 bg-indigo-50/65 px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-700">推荐改写</p>
                            <p className="mt-2 text-base leading-7 text-indigo-950">
                                {score.better_version_en || "暂无推荐改写。"}
                            </p>
                        </div>

                        <div className="border-t border-slate-200/80 bg-rose-50/55 px-4 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">批改修订</p>
                            {score.corrections?.length ? (
                                <div className="mt-3 space-y-2.5">
                                    {score.corrections.map((item, idx) => (
                                        <div key={`${item.segment}-${idx}`} className="rounded-xl border border-rose-200/75 bg-white/92 px-3 py-2.5">
                                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                                <span className="font-semibold text-rose-700 line-through decoration-rose-300">{item.segment}</span>
                                                <span className="text-slate-400">→</span>
                                                <span className="font-semibold text-emerald-700">{item.correction}</span>
                                                {item.category ? (
                                                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{item.category}</span>
                                                ) : null}
                                            </div>
                                            <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.reason}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-2 text-sm leading-6 text-rose-700/90">未发现明确错误。</p>
                            )}
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                            { label: "语法", value: score.dimension_scores.grammar },
                            { label: "词汇", value: score.dimension_scores.vocabulary },
                            { label: "内容表达", value: score.dimension_scores.semantics },
                            { label: "仿写度", value: score.dimension_scores.imitation },
                        ].map((item) => (
                            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
                                <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                                <p className={`mt-1.5 text-2xl font-bold ${scoreTone(item.value)}`}>{item.value}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-5 space-y-3">
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/65 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">反馈</p>
                            <p className="mt-2 text-base leading-7 text-slate-800">{score.feedback_cn}</p>
                        </div>

                        {score.improvement_points_cn?.length ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">提升建议</p>
                                <div className="mt-2 space-y-1.5">
                                    {score.improvement_points_cn.map((point, idx) => (
                                        <p key={`${point}-${idx}`} className="text-sm leading-6 text-slate-700">{idx + 1}. {point}</p>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                            {score.copy_penalty_applied ? (
                                <TriangleAlert className="h-4 w-4 text-rose-500" />
                            ) : (
                                <CircleCheckBig className="h-4 w-4 text-emerald-500" />
                            )}
                            <span>
                                与原句相似度：
                                <span className="ml-1 font-semibold text-slate-900">{Math.round(score.copy_similarity * 100)}%</span>
                                {score.copy_penalty_applied ? "（已触发仿写度降分）" : "（未触发照抄惩罚）"}
                            </span>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}

import { Suspense } from "react";

export default function RewriteScorePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
            <RewriteScoreContent />
        </Suspense>
    );
}
