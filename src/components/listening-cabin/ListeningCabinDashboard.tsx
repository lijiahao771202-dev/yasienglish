"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    BookAudio,
    Loader2,
    Play,
    Trash2,
    WandSparkles,
} from "lucide-react";

import { db } from "@/lib/db";
import { getListeningCabinTtsPayload } from "@/lib/listening-cabin-audio";
import {
    createListeningCabinSession,
    DEFAULT_LISTENING_CABIN_REQUEST,
    isListeningCabinMultiSpeakerMode,
    LISTENING_CABIN_CEFR_OPTIONS,
    LISTENING_CABIN_FOCUS_OPTIONS,
    LISTENING_CABIN_LEXICAL_DENSITY_OPTIONS,
    LISTENING_CABIN_MULTI_SPEAKER_MAX,
    LISTENING_CABIN_MULTI_SPEAKER_MIN,
    LISTENING_CABIN_SCRIPT_LENGTH_OPTIONS,
    LISTENING_CABIN_SCRIPT_MODE_OPTIONS,
    LISTENING_CABIN_SCRIPT_STYLE_OPTIONS,
    LISTENING_CABIN_THINKING_MODE_OPTIONS,
    LISTENING_CABIN_SPEAKER_STRATEGY_OPTIONS,
    LISTENING_CABIN_SENTENCE_LENGTH_OPTIONS,
    LISTENING_CABIN_TOPIC_MODE_OPTIONS,
    getListeningCabinRandomTopicPoolSize,
    pickListeningCabinRandomTopic,
    resolveListeningCabinLengthProfile,
    type ListeningCabinGenerationRequest,
    type ListeningCabinGenerationResponse,
    type ListeningCabinSession,
} from "@/lib/listening-cabin";
import { deleteListeningCabinSession, saveListeningCabinSession } from "@/lib/listening-cabin-store";
import { DEFAULT_TTS_VOICE, TTS_VOICE_OPTIONS } from "@/lib/profile-settings";
import { getPressableStyle } from "@/lib/pressable";
import { cn } from "@/lib/utils";

const LISTENING_CABIN_VOICE_OPTIONS = TTS_VOICE_OPTIONS.filter((option) => option.voice.startsWith("en-"));
const LISTENING_CABIN_DEFAULT_VOICE = LISTENING_CABIN_VOICE_OPTIONS.find((option) => option.voice === DEFAULT_TTS_VOICE)?.voice
    ?? LISTENING_CABIN_VOICE_OPTIONS[0]?.voice
    ?? DEFAULT_TTS_VOICE;

function ensureListeningCabinVoice(voice: (typeof TTS_VOICE_OPTIONS)[number]["voice"] | string | null | undefined) {
    if (typeof voice === "string" && LISTENING_CABIN_VOICE_OPTIONS.some((option) => option.voice === voice)) {
        return voice as (typeof TTS_VOICE_OPTIONS)[number]["voice"];
    }

    return LISTENING_CABIN_DEFAULT_VOICE;
}

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

function normalizeSpeakerLabel(value: string) {
    return value.trim();
}

function isGenericSpeakerName(value: string) {
    const normalized = normalizeSpeakerLabel(value).toLowerCase();
    return (
        /^speaker\s*[a-z0-9]+$/i.test(normalized)
        || /^guest\s*\d*$/i.test(normalized)
        || normalized === "host"
        || normalized === "narrator"
    );
}

function getVoiceOption(voice: (typeof TTS_VOICE_OPTIONS)[number]["voice"]) {
    return LISTENING_CABIN_VOICE_OPTIONS.find((option) => option.voice === voice);
}

function getVoiceLabel(voice: (typeof TTS_VOICE_OPTIONS)[number]["voice"]) {
    return getVoiceOption(voice)?.label ?? voice;
}

function ensureUniqueVoices(
    voices: Array<(typeof TTS_VOICE_OPTIONS)[number]["voice"]>,
    fallbackVoice: (typeof TTS_VOICE_OPTIONS)[number]["voice"],
) {
    const used = new Set<(typeof TTS_VOICE_OPTIONS)[number]["voice"]>();
    const resolvedFallback = ensureListeningCabinVoice(fallbackVoice);
    return voices.map((voice) => {
        const normalizedVoice = ensureListeningCabinVoice(voice);
        if (!used.has(normalizedVoice)) {
            used.add(normalizedVoice);
            return normalizedVoice;
        }

        const next = LISTENING_CABIN_VOICE_OPTIONS.find((option) => !used.has(option.voice))?.voice ?? resolvedFallback;
        used.add(next);
        return next;
    });
}

function buildMultiSpeakerAssignments(
    scriptMode: ListeningCabinGenerationRequest["scriptMode"],
    primaryVoice: (typeof TTS_VOICE_OPTIONS)[number]["voice"],
    assignments: ListeningCabinGenerationRequest["speakerPlan"]["assignments"],
) {
    const resolvedPrimaryVoice = ensureListeningCabinVoice(primaryVoice);

    if (!isListeningCabinMultiSpeakerMode(scriptMode)) {
        return [{ speaker: "Narrator", voice: resolvedPrimaryVoice }];
    }

    const bounded = assignments.slice(0, LISTENING_CABIN_MULTI_SPEAKER_MAX);
    const expectedCount = Math.min(
        LISTENING_CABIN_MULTI_SPEAKER_MAX,
        Math.max(LISTENING_CABIN_MULTI_SPEAKER_MIN, bounded.length),
    );

    const provisionalVoices = Array.from({ length: expectedCount }, (_, index) => {
        if (bounded[index]?.voice) {
            return ensureListeningCabinVoice(bounded[index].voice);
        }

        const fallback = LISTENING_CABIN_VOICE_OPTIONS.find((option) => option.voice !== resolvedPrimaryVoice)?.voice ?? resolvedPrimaryVoice;
        return index === 0 ? resolvedPrimaryVoice : fallback;
    });
    const uniqueVoices = ensureUniqueVoices(provisionalVoices, resolvedPrimaryVoice);

    const usedSpeakerNames = new Set<string>();
    return uniqueVoices.map((voice, index) => {
        const existingSpeaker = normalizeSpeakerLabel(bounded[index]?.speaker ?? "");
        const defaultSpeaker = getVoiceLabel(voice);
        const candidate = existingSpeaker && !isGenericSpeakerName(existingSpeaker) ? existingSpeaker : defaultSpeaker;
        let speaker = candidate || defaultSpeaker;
        if (usedSpeakerNames.has(speaker)) {
            speaker = `${defaultSpeaker} ${index + 1}`;
        }
        usedSpeakerNames.add(speaker);

        return {
            speaker,
            voice,
        };
    });
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
    const [showChineseSubtitle, setShowChineseSubtitle] = useState(true);
    const [randomTopicLocked, setRandomTopicLocked] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingAiTopic, setIsGeneratingAiTopic] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [topicNotice, setTopicNotice] = useState<string | null>(null);
    const [previewSentenceKey, setPreviewSentenceKey] = useState<string | null>(null);

    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const usedRandomTopicsRef = useRef<Record<ListeningCabinGenerationRequest["scriptMode"], Set<string>>>({
        monologue: new Set<string>(),
        dialogue: new Set<string>(),
        podcast: new Set<string>(),
    });
    const profileVoiceHydratedRef = useRef(false);

    useEffect(() => {
        if (profileVoiceHydratedRef.current) {
            return;
        }

        const preferredVoice = profile?.learning_preferences?.tts_voice;
        const resolvedVoice = ensureListeningCabinVoice(preferredVoice);
        setRequest((current) => ({
            ...current,
            speakerPlan: {
                ...current.speakerPlan,
                primaryVoice: resolvedVoice,
                assignments: current.speakerPlan.assignments.length > 0
                    ? current.speakerPlan.assignments.map((assignment, index) => (
                        index === 0 ? { ...assignment, voice: resolvedVoice } : assignment
                    ))
                    : [{ speaker: "Narrator", voice: resolvedVoice }],
            },
        }));
        profileVoiceHydratedRef.current = true;
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

    const lengthProfile = useMemo(
        () => resolveListeningCabinLengthProfile(request.scriptLength, request.sentenceLength),
        [request.scriptLength, request.sentenceLength],
    );

    const randomizeTopicFromPool = () => {
        const poolSize = getListeningCabinRandomTopicPoolSize(request.scriptMode);
        const usedTopics = usedRandomTopicsRef.current[request.scriptMode];
        if (usedTopics.size >= poolSize) {
            usedTopics.clear();
        }

        let randomTopic = "";
        for (let attempt = 0; attempt < 48; attempt += 1) {
            const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${attempt}`;
            const candidate = pickListeningCabinRandomTopic(seed, request.scriptMode);
            if (!usedTopics.has(candidate)) {
                randomTopic = candidate;
                break;
            }
        }

        if (!randomTopic) {
            const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-fallback`;
            randomTopic = pickListeningCabinRandomTopic(seed, request.scriptMode);
        }

        usedTopics.add(randomTopic);
        setRequest((current) => ({
            ...current,
            prompt: randomTopic,
            topicSource: "pool",
        }));
        return randomTopic;
    };

    const generateAiRandomTopic = async () => {
        setIsGeneratingAiTopic(true);
        setTopicNotice(null);

        try {
            const response = await fetch("/api/ai/listening-cabin/random-topic", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    scriptMode: request.scriptMode,
                    style: request.style,
                    cefrLevel: request.cefrLevel,
                    sentenceLength: request.sentenceLength,
                    scriptLength: request.scriptLength,
                    topicMode: request.topicMode,
                }),
            });
            const data = await response.json().catch(() => null);

            if (!response.ok || typeof data?.topic !== "string" || !data.topic.trim()) {
                throw new Error(data?.error || "AI 随机主题生成失败");
            }

            const nextTopic = data.topic.trim();
            setRequest((current) => ({
                ...current,
                prompt: nextTopic,
                topicMode: "hybrid",
                topicSource: "ai",
            }));
            setTopicNotice("已生成 AI 随机主题，并自动切换到混合模式。");
        } catch (error) {
            randomizeTopicFromPool();
            setRequest((current) => ({
                ...current,
                topicMode: "random",
                topicSource: "pool",
            }));
            setTopicNotice("AI 生成失败，已切换为本地随机主题。");
            console.error("Listening cabin AI random topic failed:", error);
        } finally {
            setIsGeneratingAiTopic(false);
        }
    };

    const updatePrimaryVoice = (nextVoice: (typeof TTS_VOICE_OPTIONS)[number]["voice"]) => {
        const resolvedVoice = ensureListeningCabinVoice(nextVoice);
        setRequest((current) => ({
            ...current,
            speakerPlan: {
                ...current.speakerPlan,
                primaryVoice: resolvedVoice,
                assignments: isListeningCabinMultiSpeakerMode(current.scriptMode)
                    ? buildMultiSpeakerAssignments(current.scriptMode, resolvedVoice, current.speakerPlan.assignments).map((assignment, index) => (
                        index === 0 ? { ...assignment, speaker: getVoiceLabel(resolvedVoice), voice: resolvedVoice } : assignment
                    ))
                    : [{ speaker: "Narrator", voice: resolvedVoice }],
            },
        }));
    };

    const updateMultiSpeakerVoice = (speakerIndex: number, voice: (typeof TTS_VOICE_OPTIONS)[number]["voice"]) => {
        const resolvedVoice = ensureListeningCabinVoice(voice);
        setRequest((current) => {
            if (!isListeningCabinMultiSpeakerMode(current.scriptMode)) {
                return current;
            }
            const nextAssignments = buildMultiSpeakerAssignments(
                current.scriptMode,
                current.speakerPlan.primaryVoice,
                current.speakerPlan.assignments,
            );
            const duplicated = nextAssignments.some((assignment, index) => (
                index !== speakerIndex && assignment.voice === resolvedVoice
            ));
            if (duplicated) {
                return current;
            }
            nextAssignments[speakerIndex] = {
                ...nextAssignments[speakerIndex],
                speaker: getVoiceLabel(resolvedVoice),
                voice: resolvedVoice,
            };

            return {
                ...current,
                speakerPlan: {
                    ...current.speakerPlan,
                    strategy: "mixed_dialogue",
                    primaryVoice: nextAssignments[0]?.voice ?? current.speakerPlan.primaryVoice,
                    assignments: nextAssignments,
                },
            };
        });
    };

    const addSpeakerAssignment = () => {
        setRequest((current) => {
            if (!isListeningCabinMultiSpeakerMode(current.scriptMode)) {
                return current;
            }
            const nextAssignments = buildMultiSpeakerAssignments(
                current.scriptMode,
                current.speakerPlan.primaryVoice,
                current.speakerPlan.assignments,
            );

            if (nextAssignments.length >= LISTENING_CABIN_MULTI_SPEAKER_MAX) {
                return current;
            }
            const usedVoices = new Set(nextAssignments.map((assignment) => assignment.voice));
            const candidateVoice = LISTENING_CABIN_VOICE_OPTIONS.find((option) => !usedVoices.has(option.voice))?.voice
                ?? current.speakerPlan.primaryVoice;

            nextAssignments.push({
                speaker: getVoiceLabel(candidateVoice),
                voice: candidateVoice,
            });

            return {
                ...current,
                speakerPlan: {
                    ...current.speakerPlan,
                    strategy: "mixed_dialogue",
                    assignments: nextAssignments,
                },
            };
        });
    };

    const randomizeMultiSpeakerVoices = () => {
        setRequest((current) => {
            if (!isListeningCabinMultiSpeakerMode(current.scriptMode)) {
                return current;
            }

            const currentAssignments = buildMultiSpeakerAssignments(
                current.scriptMode,
                current.speakerPlan.primaryVoice,
                current.speakerPlan.assignments,
            );
            const targetCount = currentAssignments.length;
            const shuffled = [...LISTENING_CABIN_VOICE_OPTIONS]
                .sort(() => Math.random() - 0.5)
                .slice(0, targetCount)
                .map((option) => option.voice);
            const uniqueVoices = ensureUniqueVoices(shuffled, current.speakerPlan.primaryVoice);
            const randomizedAssignments = uniqueVoices.map((voice) => ({
                speaker: getVoiceLabel(voice),
                voice,
            }));

            return {
                ...current,
                speakerPlan: {
                    ...current.speakerPlan,
                    strategy: "mixed_dialogue",
                    primaryVoice: randomizedAssignments[0]?.voice ?? current.speakerPlan.primaryVoice,
                    assignments: randomizedAssignments,
                },
            };
        });
    };

    const removeSpeakerAssignment = () => {
        setRequest((current) => {
            if (!isListeningCabinMultiSpeakerMode(current.scriptMode)) {
                return current;
            }
            const nextAssignments = buildMultiSpeakerAssignments(
                current.scriptMode,
                current.speakerPlan.primaryVoice,
                current.speakerPlan.assignments,
            );

            if (nextAssignments.length <= LISTENING_CABIN_MULTI_SPEAKER_MIN) {
                return current;
            }

            const trimmed = nextAssignments.slice(0, -1);
            return {
                ...current,
                speakerPlan: {
                    ...current.speakerPlan,
                    strategy: "mixed_dialogue",
                    primaryVoice: trimmed[0]?.voice ?? current.speakerPlan.primaryVoice,
                    assignments: trimmed,
                },
            };
        });
    };

    useEffect(() => {
        if (request.topicMode === "manual" && randomTopicLocked) {
            setRandomTopicLocked(false);
        }
        if (request.topicMode === "manual" && request.topicSource !== "manual") {
            setRequest((current) => ({ ...current, topicSource: "manual" }));
        }
    }, [randomTopicLocked, request.topicMode, request.topicSource]);

    const voiceOptions = useMemo(() => LISTENING_CABIN_VOICE_OPTIONS, []);
    const isRandomTopicMode = request.topicMode === "random" || request.topicMode === "hybrid";
    const isMultiSpeakerMode = isListeningCabinMultiSpeakerMode(request.scriptMode);
    const multiSpeakerAssignments = isMultiSpeakerMode
        ? buildMultiSpeakerAssignments(request.scriptMode, request.speakerPlan.primaryVoice, request.speakerPlan.assignments)
        : [];
    const promptPlaceholder = request.topicMode === "manual"
        ? "例如：一个单人老师讲解‘为什么总是拖延’，口语自然，贴近生活。"
        : request.topicMode === "hybrid"
            ? "输入你的主题方向，系统会叠加随机池灵感（AI随机主题会直接填入）。"
            : "随机池模式下可留空，系统会自动给出生活化主题。";

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
                            <p className="text-[11px] text-[#8f8478]">生成单人 / 对话 / 播客听力稿并直接进入练习</p>
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
                                        <p className="text-[13px] font-medium text-[#2b231d]">听力稿控制台</p>
                                        <p className="mt-1 max-w-[34rem] text-[12px] leading-6 text-[#91867a]">
                                            按“内容模式 → 风格 → 语言难度 → 节奏控制 → 声线策略”一步完成配置，避免参数互相冲突。
                                        </p>
                                    </div>
                                    <div className="rounded-full bg-[#fff7e2] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-[#a67a13]">
                                        Listening v2.1
                                    </div>
                                </div>

                                <div className="mt-5 space-y-4">
                                    <section className="rounded-[20px] border border-[#e8e0d6] bg-[#fffdfa] px-4 py-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-[#988b7e]">内容模式</p>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {LISTENING_CABIN_SCRIPT_MODE_OPTIONS.map((option) => (
                                                <SoftChip
                                                    key={option.value}
                                                    active={request.scriptMode === option.value}
                                                    onClick={() => setRequest((current) => ({
                                                        ...current,
                                                        scriptMode: option.value,
                                                        speakerPlan: isListeningCabinMultiSpeakerMode(option.value)
                                                            ? {
                                                                strategy: "mixed_dialogue",
                                                                primaryVoice: current.speakerPlan.primaryVoice,
                                                                assignments: buildMultiSpeakerAssignments(
                                                                    option.value,
                                                                    current.speakerPlan.primaryVoice,
                                                                    current.speakerPlan.assignments,
                                                                ),
                                                            }
                                                            : {
                                                                strategy: current.speakerPlan.strategy === "mixed_dialogue" ? "fixed" : current.speakerPlan.strategy,
                                                                primaryVoice: current.speakerPlan.primaryVoice,
                                                                assignments: [{ speaker: "Narrator", voice: current.speakerPlan.primaryVoice }],
                                                            },
                                                    }))}
                                                >
                                                    {option.label}
                                                </SoftChip>
                                            ))}
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {LISTENING_CABIN_THINKING_MODE_OPTIONS.map((option) => (
                                                <SoftChip
                                                    key={option.value}
                                                    active={request.thinkingMode === option.value}
                                                    onClick={() => setRequest((current) => ({
                                                        ...current,
                                                        thinkingMode: option.value,
                                                    }))}
                                                >
                                                    {option.label}
                                                </SoftChip>
                                            ))}
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {LISTENING_CABIN_TOPIC_MODE_OPTIONS.map((option) => (
                                                <SoftChip
                                                    key={option.value}
                                                    active={request.topicMode === option.value}
                                                    onClick={() => setRequest((current) => ({
                                                        ...current,
                                                        topicMode: option.value,
                                                        topicSource: option.value === "manual"
                                                            ? "manual"
                                                            : option.value === "random"
                                                                ? "pool"
                                                                : current.topicSource,
                                                    }))}
                                                >
                                                    {option.label}
                                                </SoftChip>
                                            ))}
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
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

                                        <div className="mt-3 rounded-[18px] bg-[linear-gradient(180deg,#efebfa_0%,#ebe6f7_100%)] p-4">
                                            <textarea
                                                value={request.prompt}
                                                onChange={(event) => setRequest((current) => ({
                                                    ...current,
                                                    prompt: event.target.value,
                                                    topicSource: "manual",
                                                }))}
                                                className="min-h-[96px] w-full resize-none bg-transparent text-[14px] leading-7 text-[#574f6d] outline-none placeholder:text-[#9e95b9]"
                                                placeholder={promptPlaceholder}
                                            />
                                        </div>

                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    void generateAiRandomTopic();
                                                }}
                                                disabled={isGeneratingAiTopic}
                                                className="ui-pressable rounded-full border border-[#d8cfbf] bg-[#fff8ea] px-3 py-1.5 text-[11px] font-medium text-[#6a4b16] disabled:cursor-not-allowed disabled:opacity-55"
                                                style={getPressableStyle("rgba(166,122,19,0.14)", 2)}
                                            >
                                                {isGeneratingAiTopic ? "AI 生成中..." : "AI随机主题"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!randomTopicLocked && isRandomTopicMode) {
                                                        randomizeTopicFromPool();
                                                        setTopicNotice("已从本地随机池填入一个主题。");
                                                    }
                                                }}
                                                disabled={!isRandomTopicMode}
                                                className="ui-pressable rounded-full border border-[#e3d9cd] bg-white px-3 py-1.5 text-[11px] font-medium text-[#51463a] disabled:cursor-not-allowed disabled:opacity-45"
                                                style={getPressableStyle("rgba(30,20,10,0.08)", 2)}
                                            >
                                                再来一个随机主题
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRandomTopicLocked((current) => !current)}
                                                disabled={!isRandomTopicMode}
                                                className={cn(
                                                    "ui-pressable rounded-full border px-3 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-45",
                                                    randomTopicLocked
                                                        ? "border-[#cfdcff] bg-[#edf3ff] text-[#355086]"
                                                        : "border-[#e3d9cd] bg-white text-[#51463a]",
                                                )}
                                                style={getPressableStyle("rgba(30,20,10,0.08)", 2)}
                                            >
                                                {randomTopicLocked ? "已锁定主题" : "锁定主题"}
                                            </button>
                                            {!isRandomTopicMode ? (
                                                <p className="text-[11px] text-[#9a8f83]">当前是手动主题模式，不使用随机池。</p>
                                            ) : (
                                                <p className="text-[11px] text-[#9a8f83]">
                                                    随机池（当前模式）{getListeningCabinRandomTopicPoolSize(request.scriptMode).toLocaleString("zh-CN")} 主题，默认去重抽取。
                                                </p>
                                            )}
                                        </div>

                                        <p className="mt-3 text-[11px] leading-6 text-[#9a8f83]">
                                            风格由上方按钮显式控制；AI随机主题会优先生成符合当前模式的生活化口播主题。
                                        </p>
                                        {topicNotice ? (
                                            <p className="mt-1 text-[11px] leading-6 text-[#7d7064]">{topicNotice}</p>
                                        ) : null}
                                    </section>

                                    <section className="rounded-[20px] border border-[#e8e0d6] bg-[#fffdfa] px-4 py-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-[#988b7e]">语言难度</p>
                                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                            <div className="space-y-2">
                                                <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">CEFR</span>
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
                                                <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">词汇密度</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {LISTENING_CABIN_LEXICAL_DENSITY_OPTIONS.map((option) => (
                                                        <SoftChip
                                                            key={option.value}
                                                            active={request.lexicalDensity === option.value}
                                                            onClick={() => setRequest((current) => ({ ...current, lexicalDensity: option.value }))}
                                                        >
                                                            {option.label}
                                                        </SoftChip>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="rounded-[20px] border border-[#e8e0d6] bg-[#fffdfa] px-4 py-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-[#988b7e]">节奏控制</p>
                                        <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                            <div className="space-y-2">
                                                <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">单句长度</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {LISTENING_CABIN_SENTENCE_LENGTH_OPTIONS.map((option) => (
                                                        <SoftChip
                                                            key={option.value}
                                                            active={request.sentenceLength === option.value}
                                                            onClick={() => setRequest((current) => ({ ...current, sentenceLength: option.value }))}
                                                        >
                                                            {option.label}
                                                        </SoftChip>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">篇幅长度</span>
                                                <div className="flex flex-wrap gap-2">
                                                    {LISTENING_CABIN_SCRIPT_LENGTH_OPTIONS.map((option) => (
                                                        <SoftChip
                                                            key={option.value}
                                                            active={request.scriptLength === option.value}
                                                            onClick={() => setRequest((current) => ({ ...current, scriptLength: option.value }))}
                                                        >
                                                            {option.label}
                                                        </SoftChip>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-3 rounded-[14px] border border-[#ece4db] bg-white px-3 py-2 text-[12px] leading-6 text-[#615548]">
                                            预计 {Math.round(lengthProfile.targetWords)} 词，约 {lengthProfile.estimatedMinutes.toFixed(1)} 分钟，
                                            句数区间约 {lengthProfile.targetSentenceRange.min}-{lengthProfile.targetSentenceRange.max} 句。
                                        </div>
                                    </section>

                                    <section className="rounded-[20px] border border-[#e8e0d6] bg-[#fffdfa] px-4 py-4">
                                        <p className="text-[11px] uppercase tracking-[0.22em] text-[#988b7e]">声线策略与听力目标</p>
                                        <div className="mt-3 space-y-3">
                                            {request.scriptMode === "monologue" ? (
                                                <>
                                                    <div className="flex flex-wrap gap-2">
                                                        {LISTENING_CABIN_SPEAKER_STRATEGY_OPTIONS
                                                            .filter((option) => option.value !== "mixed_dialogue")
                                                            .map((option) => (
                                                                <SoftChip
                                                                    key={option.value}
                                                                    active={request.speakerPlan.strategy === option.value}
                                                                    onClick={() => setRequest((current) => ({
                                                                        ...current,
                                                                        speakerPlan: {
                                                                            ...current.speakerPlan,
                                                                            strategy: option.value,
                                                                            assignments: [{ speaker: "Narrator", voice: current.speakerPlan.primaryVoice }],
                                                                        },
                                                                    }))}
                                                                >
                                                                    {option.label}
                                                                </SoftChip>
                                                            ))}
                                                    </div>
                                                    {request.speakerPlan.strategy === "fixed" ? (
                                                        <label className="block">
                                                            <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">主声线</span>
                                                            <div className="mt-2 rounded-[14px] border border-[#e9e1d8] bg-white px-3 py-2">
                                                                <select
                                                                    value={request.speakerPlan.primaryVoice}
                                                                    onChange={(event) => updatePrimaryVoice(event.target.value as (typeof TTS_VOICE_OPTIONS)[number]["voice"])}
                                                                    className="w-full bg-transparent text-sm text-[#201914] outline-none"
                                                                >
                                                                    {voiceOptions.map((option) => (
                                                                        <option key={option.voice} value={option.voice}>
                                                                            {option.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </label>
                                                    ) : (
                                                        <p className="text-[12px] text-[#8f8478]">每次生成会随机选择一个英文声线，保持整篇单人口播一致。</p>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <p className="text-[12px] text-[#7d7064]">
                                                            {request.scriptMode === "podcast" ? "播客模式" : "对话模式"}支持 2-4 人，
                                                            当前 {multiSpeakerAssignments.length} 人。
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={randomizeMultiSpeakerVoices}
                                                                className="ui-pressable rounded-full border border-[#e3d9cd] bg-white px-3 py-1 text-[11px] text-[#51463a]"
                                                                style={getPressableStyle("rgba(30,20,10,0.08)", 2)}
                                                            >
                                                                随机分配声线
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={removeSpeakerAssignment}
                                                                disabled={multiSpeakerAssignments.length <= LISTENING_CABIN_MULTI_SPEAKER_MIN}
                                                                className="ui-pressable rounded-full border border-[#e3d9cd] bg-white px-3 py-1 text-[11px] text-[#51463a] disabled:cursor-not-allowed disabled:opacity-40"
                                                                style={getPressableStyle("rgba(30,20,10,0.08)", 2)}
                                                            >
                                                                减少 1 人
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={addSpeakerAssignment}
                                                                disabled={multiSpeakerAssignments.length >= LISTENING_CABIN_MULTI_SPEAKER_MAX}
                                                                className="ui-pressable rounded-full border border-[#e3d9cd] bg-white px-3 py-1 text-[11px] text-[#51463a] disabled:cursor-not-allowed disabled:opacity-40"
                                                                style={getPressableStyle("rgba(30,20,10,0.08)", 2)}
                                                            >
                                                                增加 1 人
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] text-[#9a8f83]">
                                                        多人模式下每位发言人必须使用不同声线，已自动禁止重复选择。
                                                    </p>

                                                    <div className="grid gap-3 sm:grid-cols-2">
                                                        {multiSpeakerAssignments.map((assignment, speakerIndex) => (
                                                            <label key={`${assignment.speaker}-${speakerIndex}`} className="block">
                                                            <span className="text-[10px] uppercase tracking-[0.24em] text-[#9a9085]">
                                                                {assignment.speaker}
                                                            </span>
                                                            <div className="mt-2 rounded-[14px] border border-[#e9e1d8] bg-white px-3 py-2">
                                                                <select
                                                                    value={assignment.voice}
                                                                    onChange={(event) => updateMultiSpeakerVoice(speakerIndex, event.target.value as (typeof TTS_VOICE_OPTIONS)[number]["voice"])}
                                                                    className="w-full bg-transparent text-sm text-[#201914] outline-none"
                                                                >
                                                                    {voiceOptions.map((option) => (
                                                                        <option
                                                                            key={option.voice}
                                                                            value={option.voice}
                                                                            disabled={multiSpeakerAssignments.some((item, itemIndex) => itemIndex !== speakerIndex && item.voice === option.voice)}
                                                                        >
                                                                            {option.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex flex-wrap gap-2">
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
                                        </div>
                                    </section>
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
                                        <p className="text-sm font-medium text-[#201914]">默认显示中文字幕</p>
                                        <p className="text-[12px] leading-6 text-[#93887c]">仅影响进入沉浸播放器时的默认显示状态。</p>
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

                                <motion.button
                                    type="button"
                                    whileTap={{ scale: 0.985 }}
                                    onClick={handleGenerate}
                                    disabled={isGenerating}
                                    className="ui-pressable mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(180deg,#ffc538_0%,#ffb300_100%)] text-[14px] font-semibold text-[#21170d] shadow-[0_14px_26px_rgba(255,179,0,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
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
                        </motion.div>

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
                                                            {sentence.speaker ? (
                                                                <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[#9a9085]">
                                                                    {sentence.speaker}
                                                                </p>
                                                            ) : null}
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
