"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useSearchParams } from "next/navigation";

import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { HomeDashboardPanels } from "@/components/home/HomeDashboardPanels";
import { buildHomeDashboardModel } from "@/components/home/home-data";
import { HomeSidebar } from "@/components/home/HomeSidebar";
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
        <main className="min-h-screen bg-[#cdc7bd] px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="mx-auto max-w-[1600px]">
                <section className="relative overflow-hidden rounded-[2.8rem] border border-white/65 bg-[linear-gradient(180deg,#ebe6dc_0%,#e5dfd5_100%)] p-4 shadow-[0_40px_80px_-46px_rgba(31,27,24,0.34)] lg:p-6">
                    <div className="pointer-events-none absolute inset-x-[22%] top-[-16%] h-56 rounded-full bg-white/32 blur-3xl" />
                    <div className="pointer-events-none absolute bottom-[-8%] right-[10%] h-56 w-56 rounded-full bg-[#f2d996]/24 blur-3xl" />
                    <div className="pointer-events-none absolute left-[10%] top-[22%] h-40 w-40 rounded-full bg-white/18 blur-3xl" />

                    <div className="relative z-10 grid gap-4 lg:grid-cols-[112px_minmax(0,1fr)]">
                        <HomeSidebar email={sessionUser?.email} />
                        <HomeDashboardPanels
                            model={model}
                            eloHistory={eloHistory ?? []}
                            accountEmail={sessionUser?.email}
                            passwordUpdated={resolvedPasswordUpdated}
                        />
                    </div>
                </section>
            </div>
        </main>
    );
}
