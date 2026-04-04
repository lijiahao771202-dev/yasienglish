"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
    ChevronLeft,
    ChevronRight,
    Loader2,
    Pause,
    Play,
    X,
} from "lucide-react";

import { useListeningCabinPlayer } from "@/hooks/useListeningCabinPlayer";
import { db } from "@/lib/db";
import type {
    ListeningCabinPlaybackMode,
    ListeningCabinSentence,
    ListeningCabinSession,
} from "@/lib/listening-cabin";
import { getPressableStyle } from "@/lib/pressable";
import { cn } from "@/lib/utils";

function renderSentence(sentence: string | undefined) {
    if (!sentence) {
        return null;
    }

    return sentence;
}

function getPlaybackModeLabel(mode: ListeningCabinPlaybackMode) {
    switch (mode) {
        case "single_pause":
            return "单句";
        case "repeat_current":
            return "循环";
        case "auto_all":
        default:
            return "连续";
    }
}

function renderSubtitleBlock(sentences: ListeningCabinSentence[]) {
    return sentences.map((sentence, index) => (
        <span key={sentence.index}>
            {renderSentence(sentence.english)}
            {index < sentences.length - 1 ? <br /> : null}
        </span>
    ));
}

function joinChineseSubtitle(sentences: ListeningCabinSentence[]) {
    return sentences.map((sentence) => sentence.chinese).join(" ");
}

function ListeningCabinPlayerView({
    restart,
    session,
}: {
    restart: boolean;
    session: ListeningCabinSession;
}) {
    const router = useRouter();
    const player = useListeningCabinPlayer({ session, restart });
    const { playerState, currentSubtitleSentences } = player;
    const {
        nextSentenceAction,
        previousSentenceAction,
        replayCurrentSentence,
        cyclePlaybackRate,
    } = player;
    const [showControls, setShowControls] = useState(false);
    const hideControlsTimerRef = useRef<number | null>(null);

    const completionLabel = useMemo(() => {
        const current = String(playerState.currentSentenceIndex + 1).padStart(2, "0");
        const total = String(session.sentences.length).padStart(2, "0");
        return `${current} / ${total}`;
    }, [playerState.currentSentenceIndex, session.sentences.length]);
    const currentEnglishText = useMemo(
        () => currentSubtitleSentences.map((sentence) => sentence.english).join(" "),
        [currentSubtitleSentences],
    );
    const subtitleTypographyClass = useMemo(() => {
        if (currentEnglishText.length > 140) {
            return "max-w-[54rem] text-balance text-[2.05rem] font-normal leading-[1.2] tracking-[-0.018em] sm:text-[2.4rem] lg:text-[2.95rem]";
        }

        if (currentEnglishText.length > 95) {
            return "max-w-[52rem] text-balance text-[2.2rem] font-normal leading-[1.18] tracking-[-0.02em] sm:text-[2.65rem] lg:text-[3.3rem]";
        }

        return "max-w-[50rem] text-balance text-[2.4rem] font-normal leading-[1.16] tracking-[-0.022em] sm:text-[2.9rem] lg:text-[3.65rem]";
    }, [currentEnglishText]);
    const activeSubtitleKey = currentSubtitleSentences.map((sentence) => sentence.index).join("-");
    const cyclePlaybackMode = useCallback(() => {
        if (playerState.playbackMode === "single_pause") {
            player.setAutoAllMode();
            return;
        }

        if (playerState.playbackMode === "auto_all") {
            player.setRepeatCurrentMode();
            return;
        }

        player.setSinglePauseMode();
    }, [player, playerState.playbackMode]);

    useEffect(() => {
        return () => {
            if (hideControlsTimerRef.current !== null) {
                window.clearTimeout(hideControlsTimerRef.current);
            }
        };
    }, []);

    const scheduleHideControls = useCallback(() => {
        if (hideControlsTimerRef.current !== null) {
            window.clearTimeout(hideControlsTimerRef.current);
        }

        hideControlsTimerRef.current = window.setTimeout(() => {
            setShowControls(false);
        }, 1600);
    }, []);

    const revealControls = useCallback(() => {
        setShowControls(true);
        scheduleHideControls();
    }, [scheduleHideControls]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === " " || event.code === "Space") {
                event.preventDefault();
                void replayCurrentSentence();
                revealControls();
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                void previousSentenceAction();
                revealControls();
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                void nextSentenceAction();
                revealControls();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [nextSentenceAction, previousSentenceAction, replayCurrentSentence, revealControls]);

    return (
        <main
            className="relative min-h-screen overflow-hidden bg-[#f8f9fa] text-[#202325]"
            onMouseMove={(event) => {
                const viewportHeight = window.innerHeight || 0;
                if (event.clientY >= viewportHeight - 180) {
                    revealControls();
                }
            }}
            onMouseLeave={scheduleHideControls}
        >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(247,240,230,0.7),transparent_22%),radial-gradient(circle_at_84%_16%,rgba(224,234,241,0.7),transparent_22%),linear-gradient(180deg,#fafafa_0%,#f8f9fa_46%,#f5f7f8_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[14rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.55),transparent)]" />
            <div className="pointer-events-none absolute left-1/2 top-[36%] h-[18rem] w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.72),rgba(255,255,255,0)_72%)] blur-3xl" />

            <button
                type="button"
                onClick={() => {
                    void previousSentenceAction();
                    revealControls();
                }}
                className="absolute inset-y-0 left-0 z-10 hidden w-[20%] min-w-[120px] cursor-w-resize bg-transparent md:block"
                aria-label="上一句"
            />
            <button
                type="button"
                onClick={() => {
                    void nextSentenceAction();
                    revealControls();
                }}
                className="absolute inset-y-0 right-0 z-10 hidden w-[20%] min-w-[120px] cursor-e-resize bg-transparent md:block"
                aria-label="下一句"
            />

            <div className="relative z-20 flex min-h-screen flex-col px-5 py-5 sm:px-8 lg:px-10">
                <header
                    className={cn(
                        "flex items-center justify-end transition-all duration-300",
                        showControls ? "opacity-100" : "pointer-events-none opacity-0",
                    )}
                >
                    <button
                        type="button"
                        onClick={() => router.push("/listening-cabin")}
                        className="ui-pressable inline-flex h-8 w-8 items-center justify-center rounded-full text-[#4c555b]"
                        style={getPressableStyle("rgba(67,83,99,0.08)", 2)}
                        aria-label="关闭播放器"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="relative flex flex-1 flex-col items-center justify-center py-6 text-center">
                    <div className="flex w-full max-w-[76rem] flex-col items-center justify-center gap-7">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeSubtitleKey}
                                initial={{ opacity: 0, y: 16, filter: "blur(7px)" }}
                                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                                exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                            >
                                <h1
                                    className={cn(
                                        "font-newsreader mx-auto text-[#232a31]",
                                        subtitleTypographyClass,
                                    )}
                                >
                                    {renderSubtitleBlock(currentSubtitleSentences)}
                                </h1>
                                <p
                                    className={cn(
                                        "font-welcome-ui mx-auto mt-6 max-w-[54rem] text-[16px] font-normal leading-[1.72] tracking-[0.01em] text-[#5f6770] transition-opacity sm:text-[17px]",
                                        playerState.showChineseSubtitle ? "opacity-100" : "opacity-0",
                                    )}
                                >
                                    {joinChineseSubtitle(currentSubtitleSentences)}
                                </p>
                            </motion.div>
                        </AnimatePresence>
                        <div className="w-full max-w-[28rem] px-6">
                            <div className="h-px w-full bg-[#adb3b5]/20">
                                <motion.div
                                    className="h-px bg-[#24667f] shadow-[0_0_8px_rgba(36,102,127,0.18)] transition-[width]"
                                    style={{ width: `${Math.max(6, playerState.progressRatio * 100)}%` }}
                                />
                            </div>
                            <div className="mt-3 flex justify-center">
                                <p className="text-[10px] tracking-[0.22em] text-[#5a6062]/40">
                                    {completionLabel}
                                </p>
                            </div>
                        </div>
                    </div>

                    {playerState.errorMessage ? (
                        <div className="mt-8 rounded-full border border-[#ecc8cf] bg-white/78 px-4 py-2 text-sm text-[#b4233c] shadow-sm">
                            {playerState.errorMessage}
                        </div>
                    ) : null}
                </div>

                <div className="pb-4 text-center">
                    <motion.div
                        className="mx-auto flex w-fit items-center gap-8 rounded-full bg-white/72 px-8 py-4 shadow-[0_20px_50px_rgba(45,51,53,0.06)] backdrop-blur-3xl"
                        initial={false}
                        animate={
                            showControls
                                ? { opacity: 1, y: 0, pointerEvents: "auto" }
                                : { opacity: 0, y: 28, pointerEvents: "none" }
                        }
                        transition={{ duration: 0.26, ease: "easeOut" }}
                        onMouseMove={revealControls}
                        onMouseEnter={revealControls}
                        onMouseLeave={scheduleHideControls}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                cyclePlaybackMode();
                                revealControls();
                            }}
                            className="ui-pressable inline-flex min-w-[3.75rem] items-center justify-center text-[12px] tracking-[0.14em] text-[#33556e]/48 transition hover:text-[#24667f]"
                            style={getPressableStyle("rgba(45,51,53,0.04)", 2)}
                            aria-label={`播放模式：${getPlaybackModeLabel(playerState.playbackMode)}`}
                        >
                            {getPlaybackModeLabel(playerState.playbackMode)}
                        </button>

                        <div className="flex items-center gap-8">
                            <button
                                type="button"
                                onClick={() => {
                                    void previousSentenceAction();
                                    revealControls();
                                }}
                                disabled={playerState.currentSentenceIndex === 0}
                                className="ui-pressable text-[#33556e] transition hover:opacity-70 disabled:opacity-30"
                                style={getPressableStyle("rgba(45,51,53,0.04)", 2)}
                                aria-label="上一句"
                            >
                                <ChevronLeft className="h-7 w-7" />
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (playerState.isPlaying) {
                                        player.pausePlayback();
                                        return;
                                    }

                                    void player.resumeOrPlay();
                                }}
                                className="ui-pressable flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#f1f4f5] text-[#2d3335] shadow-[0_12px_28px_rgba(45,51,53,0.04)] transition-all duration-300"
                                style={getPressableStyle("rgba(45,51,53,0.08)", 4)}
                                aria-label={playerState.isPlaying ? "暂停播放" : "开始播放"}
                            >
                                {playerState.isLoading ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : playerState.isPlaying ? (
                                    <Pause className="h-6 w-6 fill-current" />
                                ) : (
                                    <Play className="h-7 w-7 fill-current" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void nextSentenceAction();
                                    revealControls();
                                }}
                                disabled={playerState.currentSentenceIndex >= session.sentences.length - 1}
                                className="ui-pressable text-[#33556e] transition hover:opacity-70 disabled:opacity-30"
                                style={getPressableStyle("rgba(45,51,53,0.04)", 2)}
                                aria-label="下一句"
                            >
                                <ChevronRight className="h-7 w-7" />
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                cyclePlaybackRate();
                                revealControls();
                            }}
                            className="ui-pressable inline-flex min-w-[3.75rem] items-center justify-center text-[12px] tracking-[0.08em] text-[#33556e]/48 transition hover:text-[#24667f]"
                            style={getPressableStyle("rgba(45,51,53,0.04)", 2)}
                            aria-label={`播放速度 ${playerState.playbackRate.toFixed(2)}x`}
                        >
                            {playerState.playbackRate.toFixed(2)}x
                        </button>
                    </motion.div>
                </div>
            </div>
        </main>
    );
}

export function ListeningCabinPlayer() {
    const router = useRouter();
    const params = useParams<{ sessionId: string }>();
    const searchParams = useSearchParams();
    const restart = searchParams.get("restart") === "1";
    const sessionId = params.sessionId;
    const [session, setSession] = useState<ListeningCabinSession | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;

        void (async () => {
            const nextSession = await db.listening_cabin_sessions.get(sessionId);
            if (!cancelled) {
                setSession(nextSession ?? null);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    if (session === undefined) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#f5f0e9] text-[#17120f]">
                <div className="rounded-full bg-white/80 px-5 py-3 text-sm text-[#62584e] shadow-sm">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    正在载入听力舱...
                </div>
            </main>
        );
    }

    if (!session) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#f5f0e9] px-4 text-[#17120f]">
                <div className="max-w-md rounded-[30px] border border-[#e6ddd2] bg-white px-8 py-10 text-center shadow-[0_20px_46px_rgba(24,20,17,0.08)]">
                    <p className="font-newsreader text-[2.2rem] leading-none tracking-[-0.05em]">
                        这份脚本不在听力舱里了。
                    </p>
                    <button
                        type="button"
                        onClick={() => router.push("/listening-cabin")}
                        className="ui-pressable mt-6 inline-flex items-center gap-2 rounded-full border border-[#17120f] bg-white px-4 py-2 text-sm font-medium text-[#17120f]"
                        style={getPressableStyle("rgba(23,18,15,0.08)", 3)}
                    >
                        返回听力舱
                    </button>
                </div>
            </main>
        );
    }

    return <ListeningCabinPlayerView restart={restart} session={session} />;
}
