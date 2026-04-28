"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, useEffect } from "react";
import confetti from "canvas-confetti";
import {
    ArrowLeft,
    CircleCheckBig,
    Loader2,
    RotateCcw,
    Sparkles,
    TriangleAlert,
} from "lucide-react";

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

function formatTime(iso: string | undefined) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function scoreTone(score: number) {
    if (score >= 85) return "text-[#047857]";
    if (score >= 70) return "text-[#9a6700]";
    return "text-[#be123c]";
}

function scoreSurface(score: number) {
    if (score >= 85) return "border-[#9ae6b4] bg-[#ecfdf3]";
    if (score >= 70) return "border-[#f4d38a] bg-[#fff7df]";
    return "border-[#f8b4c6] bg-[#fff1f4]";
}

function RewriteScorePageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const scoreId = searchParams.get("id");

    const [isContinuing, setIsContinuing] = useState(false);
    const payload = useMemo(() => {
        if (!scoreId || typeof window === "undefined") return null;
        const raw = window.sessionStorage.getItem(`rewrite-score:${scoreId}`);
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw) as RewriteScoreNavigationPayload;
            if (!parsed?.score || !parsed?.source_sentence_en || !parsed?.rewriteId) {
                return null;
            }
            return parsed;
        } catch {
            return null;
        }
    }, [scoreId]);

    const [hasCelebrated, setHasCelebrated] = useState(false);

    useEffect(() => {
        if (payload?.score?.total_score === 100 && !hasCelebrated) {
            setHasCelebrated(true);

            // Synthesized success chime
            const playSuccessSound = () => {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContextClass) return;
                const audioCtx = new AudioContextClass();
                const playTone = (freq: number, type: OscillatorType, time: number, duration: number) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + time);
                    gain.gain.setValueAtTime(0.1, audioCtx.currentTime + time);
                    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + time + duration);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(audioCtx.currentTime + time);
                    osc.stop(audioCtx.currentTime + time + duration);
                };
                playTone(523.25, "sine", 0, 0.15); // C5
                playTone(659.25, "sine", 0.15, 0.15); // E5
                playTone(783.99, "sine", 0.3, 0.15); // G5
                playTone(1046.50, "sine", 0.45, 0.4); // C6
            };

            try {
                playSuccessSound();
            } catch (e) {
                console.error("Audio playback failed", e);
            }

            // Confetti animation
            const duration = 2500;
            const end = Date.now() + duration;

            const frame = () => {
                confetti({
                    particleCount: 4,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 },
                    colors: ["#f6ad55", "#6366f1", "#10b981", "#ecfeff"]
                });
                confetti({
                    particleCount: 4,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 },
                    colors: ["#f6ad55", "#6366f1", "#10b981", "#ecfeff"]
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            };
            frame();
        }
    }, [payload, hasCelebrated]);

    const handleContinueNext = () => {
        if (!payload || typeof window === "undefined") return;
        setIsContinuing(true);
        window.sessionStorage.setItem(
            `rewrite-progress:${payload.rewriteId}`,
            JSON.stringify({ seenRewriteSentences: payload.seenRewriteSentences }),
        );
        router.push(`/read/rewrite?id=${payload.rewriteId}&continue=1`);
    };

    if (!payload) {
        return (
            <main className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(253,230,138,0.28),transparent_48%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] px-4 py-14 sm:px-6">
                <div className="mx-auto max-w-3xl rounded-3xl border border-white/70 bg-white/88 p-8 shadow-[0_40px_85px_-52px_rgba(15,23,42,0.65)]">
                    <h1 className="text-2xl font-bold text-slate-900">未找到仿写评分记录</h1>
                    <p className="mt-3 text-sm text-slate-600">请先在完整测试里的仿写练习中完成作答并提交评分。</p>
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
    const scoredAt = formatTime(payload.scoredAt);
    const returnHref = payload.articleUrl
        ? `/read?from=rewrite-score&url=${encodeURIComponent(payload.articleUrl)}`
        : "/read?from=home";

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_18%_8%,rgba(253,224,71,0.2),transparent_45%),radial-gradient(circle_at_92%_14%,rgba(147,197,253,0.18),transparent_42%),linear-gradient(180deg,#efe5d3_0%,#ece7db_100%)] px-4 py-5 sm:px-6 sm:py-6 lg:h-screen lg:overflow-hidden">
            <div className="mx-auto flex max-w-[1360px] flex-col gap-4 lg:h-full">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                        href={returnHref}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[#585a68] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回阅读
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white px-3.5 py-1.5 text-[11px] font-black text-[#9a6700] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]">
                            Rewrite Score
                        </span>
                        {scoredAt ? (
                            <span className="rounded-full bg-white px-3.5 py-1.5 text-[11px] font-black text-[#6366f1] shadow-[7px_7px_16px_rgba(15,23,42,0.08),-7px_-7px_16px_rgba(255,255,255,0.7)]">
                                {scoredAt}
                            </span>
                        ) : null}
                    </div>
                </div>

                <section className="rounded-[40px] bg-[#e8eaf0] p-4 shadow-[18px_18px_40px_rgba(15,23,42,0.11),-16px_-16px_36px_rgba(255,255,255,0.72)] sm:p-6 lg:flex-1 lg:min-h-0">
                    <div className="grid h-full min-h-[calc(100vh-10rem)] gap-5 lg:min-h-0 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
                        <div className="space-y-4 lg:min-h-0">
                            <div className="rounded-[30px] bg-[#eef1f8] px-5 py-5 shadow-[inset_8px_8px_16px_rgba(15,23,42,0.06),inset_-8px_-8px_16px_rgba(255,255,255,0.78)]">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#6366f1]">Rewrite Studio</p>
                                        <h1 className="mt-1 text-[1.7rem] font-black text-[#1f2435] sm:text-[1.95rem]">仿写评分</h1>
                                        <p className="mt-2 text-[13px] leading-6 text-[#585a68]">
                                            {payload.articleTitle ? `${payload.articleTitle} · ` : ""}第 {payload.paragraphOrder} 段
                                        </p>
                                    </div>
                                    <div className={`rounded-[24px] border px-5 py-3 text-center shadow-[6px_6px_14px_rgba(15,23,42,0.07),-6px_-6px_14px_rgba(255,255,255,0.7)] ${scoreSurface(score.total_score)}`}>
                                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7b6a46]">总分</p>
                                        <p className={`mt-1 text-4xl font-black ${scoreTone(score.total_score)}`}>{score.total_score}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-[28px] bg-white/72 px-4 py-4 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6366f1]">Target Sentence</p>
                                    <p className="mt-2 text-[15px] font-semibold leading-7 text-[#1f2435]">{payload.source_sentence_en}</p>
                                </div>

                                <div className="rounded-[28px] bg-white/72 px-4 py-4 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#047857]">你的仿写</p>
                                    <p className="mt-2 text-[15px] font-semibold leading-7 text-[#1f2435]">{payload.user_rewrite_en}</p>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {[
                                    { label: "语法", value: score.dimension_scores.grammar },
                                    { label: "词汇", value: score.dimension_scores.vocabulary },
                                    { label: "内容", value: score.dimension_scores.semantics },
                                    { label: "仿写度", value: score.dimension_scores.imitation },
                                ].map((item) => (
                                    <div key={item.label} className="rounded-[24px] bg-white/72 px-4 py-3 text-center shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                        <p className="text-[11px] font-black tracking-[0.08em] text-[#7b6a46]">{item.label}</p>
                                        <p className={`mt-1 text-2xl font-black ${scoreTone(item.value)}`}>{item.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                                <div className="rounded-[28px] bg-[#dff7e9] px-4 py-4 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#047857]">灵感提示</p>
                                    <p className="mt-2 text-[13px] leading-6 text-[#214a3b]">{payload.imitation_prompt_cn}</p>
                                </div>
                                <div className="rounded-[28px] bg-[#efe7fb] px-4 py-4 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6d28d9]">结构焦点</p>
                                    <p className="mt-2 text-[13px] leading-6 text-[#43206c]">{payload.pattern_focus_cn}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:min-h-0 lg:grid-rows-[auto_auto_auto_1fr_auto]">
                            <div className="rounded-[28px] bg-white/72 px-4 py-4 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b6a46]">反馈</p>
                                <p className="mt-2 text-[13px] leading-6 text-[#2e3040]">{score.feedback_cn}</p>
                            </div>

                            {score.better_version_en ? (
                                <div className="rounded-[28px] bg-[#eef1f8] px-4 py-4 shadow-[inset_4px_4px_10px_rgba(15,23,42,0.04),inset_-4px_-4px_10px_rgba(255,255,255,0.72)]">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6366f1]">推荐改写</p>
                                    <p className="mt-2 text-[13px] leading-6 text-[#1f2435]">{score.better_version_en}</p>
                                </div>
                            ) : null}

                            <div className={`rounded-[24px] border px-4 py-3 text-[12px] font-bold ${scoreSurface(score.total_score)} ${scoreTone(score.total_score)}`}>
                                <div className="flex items-center gap-2">
                                    {score.copy_penalty_applied ? (
                                        <TriangleAlert className="h-4 w-4" />
                                    ) : (
                                        <CircleCheckBig className="h-4 w-4" />
                                    )}
                                    <span>
                                        相似度 {Math.round(score.copy_similarity * 100)}%
                                        {score.copy_penalty_applied ? "，已触发仿写度降分。" : "，未触发照抄惩罚。"}
                                    </span>
                                </div>
                            </div>

                            <div className="grid gap-4 lg:min-h-0 lg:grid-cols-2">
                                <div className="rounded-[28px] bg-white/72 px-4 py-4 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b6a46]">提升建议</p>
                                    <div className="mt-2 space-y-2">
                                        {(score.improvement_points_cn ?? []).slice(0, 3).map((point, idx) => (
                                            <p key={`${point}-${idx}`} className="text-[13px] leading-6 text-[#2e3040]">
                                                {idx + 1}. {point}
                                            </p>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-[28px] bg-white/72 px-4 py-4 shadow-[6px_6px_14px_rgba(15,23,42,0.05),-6px_-6px_14px_rgba(255,255,255,0.68)]">
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7b6a46]">批改修订</p>
                                    <div className="mt-2 space-y-2">
                                        {(score.corrections ?? []).slice(0, 3).map((item, idx) => (
                                            <div key={`${item.segment}-${idx}`} className="rounded-[18px] bg-[#fff7df] px-3 py-2">
                                                <p className="text-[12px] font-black text-[#9a6700]">
                                                    {item.segment} → {item.correction}
                                                </p>
                                                <p className="mt-1 text-[12px] leading-5 text-[#5d5544]">{item.reason}</p>
                                            </div>
                                        ))}
                                        {!(score.corrections ?? []).length ? (
                                            <p className="text-[13px] leading-6 text-[#2e3040]">这一句没有明显硬伤，可以直接继续下一题。</p>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3 pt-1">
                                <Link
                                    href={`/read/rewrite?id=${payload.rewriteId}`}
                                    className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[12px] font-black text-[#585a68] shadow-[6px_6px_14px_rgba(15,23,42,0.08),-6px_-6px_14px_rgba(255,255,255,0.7)] transition hover:scale-[1.02]"
                                >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    返回仿写页
                                </Link>
                                <button
                                    onClick={handleContinueNext}
                                    disabled={isContinuing}
                                    className="inline-flex items-center gap-2 rounded-full bg-[#f6ad55] px-4 py-2.5 text-[12px] font-black text-white shadow-[8px_8px_18px_rgba(15,23,42,0.12),-6px_-6px_14px_rgba(255,255,255,0.24)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isContinuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                    继续抽一句
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}

export default function RewriteScorePage() {
    return (
        <Suspense fallback={null}>
            <RewriteScorePageContent />
        </Suspense>
    );
}
