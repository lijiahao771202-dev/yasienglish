"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    AudioLines,
    BookAudio,
    Loader2,
    Play,
    Sparkles,
    Trash2,
    WandSparkles,
} from "lucide-react";

import { db } from "@/lib/db";
import { getListeningCabinTtsPayload } from "@/lib/listening-cabin-audio";
import {
    createListeningCabinSession,
    DEFAULT_LISTENING_CABIN_REQUEST,
    LISTENING_CABIN_CEFR_OPTIONS,
    LISTENING_CABIN_DURATION_OPTIONS,
    LISTENING_CABIN_FOCUS_OPTIONS,
    LISTENING_CABIN_SCRIPT_STYLE_OPTIONS,
    LISTENING_CABIN_SENTENCE_COUNT_OPTIONS,
    type ListeningCabinGenerationRequest,
    type ListeningCabinGenerationResponse,
    type ListeningCabinSession,
} from "@/lib/listening-cabin";
import { deleteListeningCabinSession, saveListeningCabinSession } from "@/lib/listening-cabin-store";
import { DEFAULT_TTS_VOICE, TTS_VOICE_OPTIONS } from "@/lib/profile-settings";
import { getPressableStyle } from "@/lib/pressable";
import { cn } from "@/lib/utils";

function formatSessionTime(timestamp: number) {
    return new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(timestamp);
}

function DashboardCard({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                "rounded-[28px] border border-[#e5ddd3] bg-[rgba(255,255,255,0.88)] p-5 shadow-[0_16px_38px_rgba(60,37,11,0.05)] backdrop-blur-sm sm:p-6",
                className,
            )}
        >
            {children}
        </section>
    );
}

function SoftChip({
    active,
    children,
    onClick,
    className,
}: {
    active: boolean;
    children: ReactNode;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "ui-pressable rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-[0.02em] transition",
                active
                    ? "border-[#d2caf8] bg-[#f1edff] text-[#49446b]"
                    : "border-[#ebe3da] bg-white/88 text-[#72685c]",
                className,
            )}
            style={getPressableStyle(active ? "rgba(182,168,255,0.18)" : "rgba(40,26,10,0.05)", 2)}
        >
            {children}
        </button>
    );
}

export function ListeningCabinDashboard() {
    const router = useRouter();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const rawSessions = useLiveQuery(
        () => db.listening_cabin_sessions.orderBy("updated_at").reverse().toArray(),
        [],
    );
    const sessions = useMemo(() => rawSessions ?? [], [rawSessions]);

    const [request, setRequest] = useState<ListeningCabinGenerationRequest>({
        ...DEFAULT_LISTENING_CABIN_REQUEST,
        prompt: "做一个 B1 难度的产品经理晨会英语口播，语气自然流畅，适合逐句精听。",
    });
    const [voice, setVoice] = useState(DEFAULT_TTS_VOICE);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showChineseSubtitle, setShowChineseSubtitle] = useState(true);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [previewSentenceKey, setPreviewSentenceKey] = useState<string | null>(null);

    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const profileVoiceHydratedRef = useRef(false);

    useEffect(() => {
        if (profileVoiceHydratedRef.current) {
            return;
        }

        const preferredVoice = profile?.learning_preferences?.tts_voice;
        if (preferredVoice) {
            setVoice(preferredVoice);
            profileVoiceHydratedRef.current = true;
        }
    }, [profile?.learning_preferences?.tts_voice]);

    useEffect(() => {
        if (selectedSessionId && sessions.some((session) => session.id === selectedSessionId)) {
            return;
        }

        setSelectedSessionId(sessions[0]?.id ?? null);
    }, [selectedSessionId, sessions]);

    useEffect(() => {
        const audio = new Audio();
        previewAudioRef.current = audio;

        const handleEnded = () => {
            setPreviewSentenceKey(null);
        };

        audio.addEventListener("ended", handleEnded);

        return () => {
            audio.pause();
            audio.removeEventListener("ended", handleEnded);
            previewAudioRef.current = null;
        };
    }, []);

    const selectedSession = useMemo(
        () => sessions.find((session) => session.id === selectedSessionId) ?? null,
        [selectedSessionId, sessions],
    );

    const toggleFocusTag = (value: typeof LISTENING_CABIN_FOCUS_OPTIONS[number]["value"]) => {
        setRequest((current) => {
            const exists = current.focusTags.includes(value);
            return {
                ...current,
                focusTags: exists
                    ? current.focusTags.filter((item) => item !== value)
                    : [...current.focusTags, value],
            };
        });
    };

    const handleGenerate = async () => {
        setGenerateError(null);
        setIsGenerating(true);

        try {
            const response = await fetch("/api/ai/listening-cabin/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(request),
            });

            const data = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(data?.error || "生成失败，请稍后再试。");
            }

            const session = createListeningCabinSession({
                response: data as ListeningCabinGenerationResponse,
                request,
                voice,
                playbackRate,
                showChineseSubtitle,
            });

            await saveListeningCabinSession(session);
            setSelectedSessionId(session.id);
        } catch (error) {
            console.error("Listening cabin generation failed:", error);
            setGenerateError(error instanceof Error ? error.message : "生成失败，请稍后再试。");
        } finally {
            setIsGenerating(false);
        }
    };

    const handlePreviewSentence = async (session: ListeningCabinSession, sentenceIndex: number) => {
        const sentence = session.sentences[sentenceIndex];
        const audio = previewAudioRef.current;
        if (!sentence || !audio) {
            return;
        }

        const nextKey = `${session.id}:${sentence.index}`;
        if (previewSentenceKey === nextKey && !audio.paused) {
            audio.pause();
            setPreviewSentenceKey(null);
            return;
        }

        setPreviewSentenceKey(nextKey);

        try {
            const payload = await getListeningCabinTtsPayload(sentence.english, session.voice, session.playbackRate);
            audio.pause();
            audio.src = payload.audio;
            audio.currentTime = 0;
            await audio.play();
        } catch (error) {
            console.error("Listening cabin preview failed:", error);
            setPreviewSentenceKey(null);
        }
    };

    const openSession = (sessionId: string, restart = false) => {
        previewAudioRef.current?.pause();
        router.push(restart ? `/listening-cabin/${sessionId}?restart=1` : `/listening-cabin/${sessionId}`);
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (selectedSessionId === sessionId) {
            previewAudioRef.current?.pause();
            setPreviewSentenceKey(null);
        }

        await deleteListeningCabinSession(sessionId);
    };

    return (
        <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f6f2eb_0%,#f2ece3_48%,#f5f0ea_100%)] text-[#1b1611]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,197,80,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(191,207,255,0.3),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(250,240,224,0.9),transparent_26%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[18rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.58),transparent)]" />

            <div className="relative mx-auto max-w-[1120px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
                <header className="mb-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => router.push("/?from=listening-cabin")}
                            className="ui-pressable inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-[#1b1611] shadow-[0_8px_18px_rgba(46,27,8,0.06)]"
                            style={getPressableStyle("rgba(24,20,17,0.08)", 2)}
                            aria-label="返回首页"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                        <div>
                            <p className="text-sm font-medium tracking-[-0.02em] text-[#221a14]">沉浸听力</p>
                            <p className="text-[11px] text-[#8f8478]">生成单人口播并直接进入练习</p>
                        </div>
                    </div>
                </header>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,410px)]">
                    <div className="space-y-5">
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <DashboardCard className="p-5 sm:p-6">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-[13px] font-medium text-[#2b231d]">Describe Your Script</p>
                                        <p className="mt-1 max-w-[34rem] text-[12px] leading-6 text-[#91867a]">
                                            Paint the scene, production angle, listening level, and what the learner should feel.
                                        </p>
                                    </div>
                                    <div className="rounded-full bg-[#fff7e2] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#a67a13]">
                                        Intentive Mode
                                    </div>
                                </div>

                                <div className="mt-4 rounded-[22px] bg-[linear-gradient(180deg,#eeebfa_0%,#eae6f5_100%)] p-4 sm:p-5">
                                    <textarea
                                        value={request.prompt}
                                        onChange={(event) => setRequest((current) => ({ ...current, prompt: event.target.value }))}
                                        className="min-h-[112px] w-full resize-none bg-transparent text-[14px] leading-7 text-[#5a536d] outline-none placeholder:text-[#a29bb7]"
                                        placeholder="e.g. A warm product update for a small creative team, with natural pacing and encouraging language."
                                    />
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {LISTENING_CABIN_SCRIPT_STYLE_OPTIONS.map((option) => (
                                        <SoftChip
                                            key={option.value}
                                            active={request.style === option.value}
                                            onClick={() => setRequest((current) => ({ ...current, style: option.value }))}
                                        >
                                            {option.label}
                                        </SoftChip>
                                    ))}
                                </div>
                            </DashboardCard>
                        </motion.div>

                        <DashboardCard>
                            <div className="flex items-center gap-2">
                                <div className="rounded-full bg-[#edf4ff] p-2 text-[#4264ba]">
                                    <AudioLines className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-[13px] font-medium text-[#2b231d]">Fine-Tune Audio</p>
                                    <p className="text-[12px] leading-6 text-[#91867a]">
                                        Shape the accent, density, and pace before the script is generated.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                                <label className="space-y-2">
                                    <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">Voice</span>
                                    <div className="rounded-[18px] border border-[#e9e1d8] bg-white px-4 py-3">
                                        <select
                                            value={voice}
                                            onChange={(event) => setVoice(event.target.value as typeof voice)}
                                            className="w-full bg-transparent text-sm text-[#201914] outline-none"
                                        >
                                            {TTS_VOICE_OPTIONS.filter((option) => option.voice.startsWith("en-US")).map((option) => (
                                                <option key={option.voice} value={option.voice}>{option.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </label>

                                <div className="space-y-2">
                                    <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">CEFR Level</span>
                                    <div className="flex flex-wrap gap-2">
                                        {LISTENING_CABIN_CEFR_OPTIONS.map((option) => (
                                            <SoftChip
                                                key={option}
                                                active={request.cefrLevel === option}
                                                onClick={() => setRequest((current) => ({ ...current, cefrLevel: option }))}
                                            >
                                                {option}
                                            </SoftChip>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">Appearance</span>
                                    <div className="rounded-[18px] border border-[#e9e1d8] bg-white px-4 py-3">
                                        <div className="flex items-center justify-between text-[12px] text-[#877d70]">
                                            <span>Slow</span>
                                            <span className="rounded-full bg-[#edf3ff] px-2 py-0.5 text-[#4664b5]">{playbackRate.toFixed(2)}x</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0.85"
                                            max="1.20"
                                            step="0.05"
                                            value={playbackRate}
                                            onChange={(event) => setPlaybackRate(Number(event.target.value))}
                                            className="mt-3 w-full accent-[#6484f0]"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">Material Volume</span>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div className="rounded-[18px] border border-[#e9e1d8] bg-white px-4 py-3">
                                            <select
                                                value={request.targetDurationMinutes}
                                                onChange={(event) => setRequest((current) => ({ ...current, targetDurationMinutes: Number(event.target.value) }))}
                                                className="w-full bg-transparent text-sm text-[#201914] outline-none"
                                            >
                                                {LISTENING_CABIN_DURATION_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>{option} min</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="rounded-[18px] border border-[#e9e1d8] bg-white px-4 py-3">
                                            <select
                                                value={request.sentenceCount}
                                                onChange={(event) => setRequest((current) => ({ ...current, sentenceCount: Number(event.target.value) }))}
                                                className="w-full bg-transparent text-sm text-[#201914] outline-none"
                                            >
                                                {LISTENING_CABIN_SENTENCE_COUNT_OPTIONS.map((option) => (
                                                    <option key={option} value={option}>{option} lines</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowChineseSubtitle((current) => !current)}
                                className={cn(
                                    "mt-5 flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left",
                                    showChineseSubtitle ? "border-[#d8d1ff] bg-[#f6f3ff]" : "border-[#e9e1d8] bg-white",
                                )}
                            >
                                <div>
                                    <p className="text-sm font-medium text-[#201914]">Show Chinese translation</p>
                                    <p className="text-[12px] leading-6 text-[#93887c]">The player follows this default when you open immersive mode.</p>
                                </div>
                                <div
                                    className={cn(
                                        "flex h-7 w-12 items-center rounded-full px-1 transition",
                                        showChineseSubtitle ? "bg-[#dad4ff]" : "bg-[#ece4d9]",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                                            showChineseSubtitle ? "translate-x-5" : "translate-x-0",
                                        )}
                                    />
                                </div>
                            </button>
                        </DashboardCard>

                        <DashboardCard>
                            <div className="flex items-center gap-2">
                                <div className="rounded-full bg-[#fff6dc] p-2 text-[#a47a11]">
                                    <Sparkles className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-[13px] font-medium text-[#2b231d]">Learning Focus Targets</p>
                                    <p className="text-[12px] leading-6 text-[#91867a]">
                                        Add just enough pressure: linking, weak forms, numbers, or fast spoken rhythm.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                                {LISTENING_CABIN_FOCUS_OPTIONS.map((option) => (
                                    <SoftChip
                                        key={option.value}
                                        active={request.focusTags.includes(option.value)}
                                        onClick={() => toggleFocusTag(option.value)}
                                        className="pl-3 pr-3.5"
                                    >
                                        <span className="inline-flex items-center gap-2">
                                            <span
                                                className={cn(
                                                    "h-1.5 w-1.5 rounded-full",
                                                    request.focusTags.includes(option.value) ? "bg-[#8f5b00]" : "bg-[#cdc3b8]",
                                                )}
                                            />
                                            {option.label}
                                        </span>
                                    </SoftChip>
                                ))}
                            </div>

                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.985 }}
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="ui-pressable mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#ffc538_0%,#ffb300_100%)] text-[14px] font-semibold text-[#21170d] shadow-[0_14px_26px_rgba(255,179,0,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                                style={getPressableStyle("rgba(255,179,0,0.28)", 4)}
                            >
                                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                                {isGenerating ? "Generating Script..." : "Generate Script"}
                            </motion.button>

                            {generateError ? (
                                <div className="mt-4 rounded-[18px] border border-[#efc7cf] bg-[#fff4f5] px-4 py-3 text-sm text-[#b4233c]">
                                    {generateError}
                                </div>
                            ) : null}
                        </DashboardCard>

                    </div>

                    <aside className="space-y-5">
                        <DashboardCard className="p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[13px] font-medium text-[#2a221c]">历史脚本</p>
                                    <p className="mt-1 text-[12px] leading-6 text-[#91867a]">从这里继续上次的练习，或者重新开始。</p>
                                </div>
                            </div>

                            <div className="mt-4 space-y-4">
                                {sessions.length > 0 ? sessions.slice(0, 5).map((session) => (
                                    <div key={session.id} className="rounded-[18px] border border-[#ede4db] bg-[#fffdfa] px-4 py-4">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedSessionId(session.id)}
                                            className="w-full text-left"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-[#201914]">{session.title}</p>
                                                    <p className="mt-1 text-[12px] leading-6 text-[#8c8176]">
                                                        {formatSessionTime(session.updated_at)}
                                                    </p>
                                                </div>
                                                <span className="rounded-full bg-[#f4efe9] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#7f7367]">
                                                    {session.cefrLevel}
                                                </span>
                                            </div>
                                        </button>

                                        <div className="mt-3 flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => openSession(session.id)}
                                                className="ui-pressable rounded-full bg-[#f3efe9] px-3 py-1.5 text-[11px] font-medium text-[#211913]"
                                                style={getPressableStyle("rgba(24,20,17,0.06)", 2)}
                                            >
                                                Continue
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => openSession(session.id, true)}
                                                className="ui-pressable rounded-full bg-[#f3efe9] px-3 py-1.5 text-[11px] font-medium text-[#211913]"
                                                style={getPressableStyle("rgba(24,20,17,0.06)", 2)}
                                            >
                                                Restart
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSession(session.id)}
                                                className="ui-pressable ml-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#fff2f4] text-[#c15669]"
                                                style={getPressableStyle("rgba(193,86,105,0.12)", 2)}
                                                aria-label={`删除 ${session.title}`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="rounded-[20px] border border-dashed border-[#ddd3c7] bg-[#fffdf9] px-4 py-8 text-center text-sm text-[#95897d]">
                                        No archive yet. Your generated monologues will appear here.
                                    </div>
                                )}
                            </div>
                        </DashboardCard>

                        <DashboardCard className="p-5">
                            <div className="flex items-center gap-2">
                                <div className="rounded-full bg-[#edf4ff] p-2 text-[#4264ba]">
                                    <BookAudio className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-[13px] font-medium text-[#2b231d]">脚本展开</p>
                                    <p className="text-[12px] leading-6 text-[#91867a]">选中历史脚本后可试听单句，或直接进入沉浸模式。</p>
                                </div>
                                {selectedSession ? (
                                    <button
                                        type="button"
                                        onClick={() => openSession(selectedSession.id)}
                                        className="ui-pressable ml-auto inline-flex h-10 items-center justify-center rounded-full bg-[#15110e] px-4 text-[12px] font-medium text-white"
                                        style={getPressableStyle("rgba(21,17,14,0.14)", 3)}
                                    >
                                        进入沉浸听力
                                    </button>
                                ) : null}
                            </div>

                            <div className="mt-5">
                                {selectedSession ? (
                                    <div className="space-y-2">
                                        <div className="rounded-[20px] border border-[#ebe3da] bg-[#fffdf9] px-4 py-4">
                                            <p className="text-[10px] uppercase tracking-[0.22em] text-[#a09488]">{selectedSession.cefrLevel}</p>
                                            <h2 className="mt-2 text-xl font-medium tracking-[-0.03em] text-[#201914]">
                                                {selectedSession.title}
                                            </h2>
                                            <p className="mt-2 line-clamp-3 text-[13px] leading-6 text-[#8e8174]">
                                                {selectedSession.sourcePrompt}
                                            </p>
                                        </div>

                                        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                                            {selectedSession.sentences.map((sentence) => {
                                                const previewKey = `${selectedSession.id}:${sentence.index}`;
                                                const isPreviewing = previewSentenceKey === previewKey;

                                                return (
                                                    <div
                                                        key={previewKey}
                                                        className="grid gap-3 rounded-[20px] border border-[#ebe3da] bg-[#fffdf9] px-4 py-4 sm:grid-cols-[18px_minmax(0,1fr)_40px]"
                                                    >
                                                        <div className="flex items-start justify-center pt-2">
                                                            <span className="h-1.5 w-1.5 rounded-full bg-[#15110e]" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-[14px] leading-7 text-[#372f29]">{sentence.english}</p>
                                                            <p className="mt-1 text-[13px] leading-7 text-[#a09284]">{sentence.chinese}</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handlePreviewSentence(selectedSession, sentence.index - 1)}
                                                            className={cn(
                                                                "ui-pressable inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                                                                isPreviewing
                                                                    ? "border-[#15110e] bg-[#15110e] text-white"
                                                                    : "border-[#e7dfd6] bg-white text-[#15110e]",
                                                            )}
                                                            style={getPressableStyle(isPreviewing ? "rgba(21,17,14,0.18)" : "rgba(21,17,14,0.06)", 2)}
                                                            aria-label={`试听第 ${sentence.index} 句`}
                                                        >
                                                            <Play className="h-3.5 w-3.5 fill-current" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-[22px] border border-dashed border-[#ddd3c7] bg-[#fffdf9] px-6 py-10 text-center text-sm text-[#95897d]">
                                        Generate your first script and the sentence-by-sentence preview will appear here.
                                    </div>
                                )}
                            </div>
                        </DashboardCard>
                    </aside>
                </div>
            </div>
        </main>
    );
}
