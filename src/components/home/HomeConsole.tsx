"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "next/navigation";
import { ArrowRight, BookOpenText, BrainCircuit, Sparkles, Swords } from "lucide-react";

import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { HomeDashboardPanels } from "@/components/home/HomeDashboardPanels";
import { buildHomeDashboardModel } from "@/components/home/home-data";
import { GlassCard } from "@/components/ui/GlassCard";
import { db } from "@/lib/db";

interface HomeConsoleProps {
    passwordUpdated?: boolean;
}

export function HomeConsole({ passwordUpdated = false }: HomeConsoleProps) {
    const searchParams = useSearchParams();
    const sessionUser = useAuthSessionUser();
    const activityCutoff = useMemo(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    }, []);
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const readCount = useLiveQuery(() => db.read_articles.count(), []);
    const vocabularyCount = useLiveQuery(() => db.vocabulary.count(), []);
    const writingCount = useLiveQuery(() => db.writing_history.count(), []);
    const recentReadArticles = useLiveQuery(
        () => db.read_articles.where("timestamp").aboveOrEqual(activityCutoff).toArray(),
        [activityCutoff],
    );
    const recentVocabulary = useLiveQuery(
        () => db.vocabulary.where("timestamp").aboveOrEqual(activityCutoff).toArray(),
        [activityCutoff],
    );
    const recentWritingEntries = useLiveQuery(
        () => db.writing_history.where("timestamp").aboveOrEqual(activityCutoff).toArray(),
        [activityCutoff],
    );
    const eloHistory = useLiveQuery(
        () => db.elo_history.orderBy("timestamp").reverse().limit(36).toArray(),
        [],
    );
    const resolvedPasswordUpdated = passwordUpdated || searchParams.get("password") === "updated";

    const model = useMemo(() => buildHomeDashboardModel({
        email: sessionUser?.email,
        profile: profile ?? null,
        readCount: readCount ?? 0,
        vocabularyCount: vocabularyCount ?? 0,
        writingCount: writingCount ?? 0,
        readArticles: recentReadArticles ?? [],
        vocabulary: recentVocabulary ?? [],
        writingEntries: recentWritingEntries ?? [],
        eloHistory: eloHistory ?? [],
    }), [
        eloHistory,
        profile,
        readCount,
        recentReadArticles,
        recentVocabulary,
        recentWritingEntries,
        sessionUser?.email,
        vocabularyCount,
        writingCount,
    ]);

    return (
        <main className="font-welcome-ui relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#8fa0de_0%,#a8b5e8_18%,#d5d9f3_42%,#d9dcf7_60%,#c8d4f3_74%,#b8c9eb_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_30%_at_50%_0%,rgba(255,176,120,0.42),transparent_62%),radial-gradient(120%_60%_at_74%_42%,rgba(235,240,255,0.54),transparent_64%),radial-gradient(100%_52%_at_14%_32%,rgba(150,167,226,0.48),transparent_68%),radial-gradient(120%_64%_at_50%_100%,rgba(236,242,255,0.74),transparent_76%)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34%] bg-[linear-gradient(180deg,rgba(232,238,255,0)_0%,rgba(228,236,255,0.68)_42%,rgba(222,232,255,0.86)_100%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(220%_120%_at_50%_120%,rgba(255,255,255,0.28),transparent_70%)]" />

            <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
                <GlassCard
                    breathe
                    className="liquid-glass-hero liquid-glass-apple-radius p-5 sm:p-6 lg:p-8"
                >
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                        <div className="space-y-4">
                            <p className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/22 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#6f294f]">
                                <Sparkles className="h-3.5 w-3.5" />
                                WELCOME
                            </p>
                            <h1 className="font-welcome-display text-[2.1rem] leading-[0.95] tracking-[-0.03em] text-[#2c1321] sm:text-[2.8rem]">
                                欢迎回来
                            </h1>
                            <p className="max-w-2xl text-sm leading-6 text-[#754f62] sm:text-[15px]">
                                今天练一点，就很好。
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <a
                                href="/read"
                                className="liquid-glass-hover liquid-glass-tap flex min-w-[172px] items-center justify-between gap-3 rounded-[1.3rem] border border-[#f7b9d8] bg-[linear-gradient(145deg,rgba(255,233,244,0.82),rgba(255,211,230,0.64))] px-4 py-3 text-[#8d2e5e] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <BookOpenText className="h-4 w-4" />
                                    阅读
                                </span>
                                <ArrowRight className="h-4 w-4" />
                            </a>
                            <a
                                href="/battle"
                                className="liquid-glass-hover liquid-glass-tap flex min-w-[172px] items-center justify-between gap-3 rounded-[1.3rem] border border-[#f59cc6] bg-[linear-gradient(145deg,rgba(255,219,237,0.84),rgba(255,190,221,0.66))] px-4 py-3 text-[#892656] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <Swords className="h-4 w-4" />
                                    对战
                                </span>
                                <ArrowRight className="h-4 w-4" />
                            </a>
                            <a
                                href="/vocab"
                                className="liquid-glass-hover liquid-glass-tap flex min-w-[172px] items-center justify-between gap-3 rounded-[1.3rem] border border-[#f6c0da] bg-[linear-gradient(145deg,rgba(255,238,247,0.84),rgba(255,218,234,0.66))] px-4 py-3 text-[#9c3468] shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold">
                                    <BrainCircuit className="h-4 w-4" />
                                    生词本
                                </span>
                                <ArrowRight className="h-4 w-4" />
                            </a>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="liquid-glass-no-frame liquid-glass-apple-radius p-0 bg-transparent">
                    <HomeDashboardPanels
                        model={model}
                        eloHistory={eloHistory ?? []}
                        accountEmail={sessionUser?.email}
                        passwordUpdated={resolvedPasswordUpdated}
                    />
                </GlassCard>
            </div>
        </main>
    );
}
