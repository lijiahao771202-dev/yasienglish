"use client";

import { useState, useMemo, useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    WandSparkles,
    Play,
    Loader2,
    Trash2,
    BookAudio,
    ChevronRight,
    ChevronLeft,
    X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    DEFAULT_LISTENING_CABIN_REQUEST,
    LISTENING_CABIN_FOCUS_OPTIONS,
    LISTENING_CABIN_SCRIPT_MODE_OPTIONS,
    LISTENING_CABIN_SCRIPT_STYLE_OPTIONS,
    LISTENING_CABIN_CEFR_OPTIONS,
    LISTENING_CABIN_LEXICAL_DENSITY_OPTIONS,
    LISTENING_CABIN_MULTI_SPEAKER_MIN,
    LISTENING_CABIN_MULTI_SPEAKER_MAX,
    LISTENING_CABIN_SCRIPT_LENGTH_OPTIONS,
    LISTENING_CABIN_SENTENCE_LENGTH_OPTIONS,
    LISTENING_CABIN_SPEAKER_STRATEGY_OPTIONS,
    LISTENING_CABIN_THINKING_MODE_OPTIONS,
    LISTENING_CABIN_TOPIC_MODE_OPTIONS,
    TTS_VOICE_OPTIONS,
} from "@/lib/listening-cabin";
import {
    resolveListeningCabinLengthProfile,
    isListeningCabinMultiSpeakerMode,
    buildDefaultMultiSpeakerAssignments,
    normalizeListeningCabinVoice,
    ensureUniqueVoiceAssignments,
    pickListeningCabinRandomTopic,
    getListeningCabinRandomTopicPoolSize,
    getVoiceLabel,
} from "@/lib/listening-cabin";
import { getListeningCabinTtsPayload } from "@/lib/listening-cabin-audio";
import { useListeningCabin } from "@/hooks/use-listening-cabin";
import type {
    ListeningCabinFocusTag,
    ListeningCabinGenerationRequest,
    ListeningCabinGenerationResponse,
    ListeningCabinScriptMode,
    ListeningCabinSession,
} from "@/lib/listening-cabin";

// --- Minimal Dashboard Card Component ---
type MultiSpeakerMode = Exclude<ListeningCabinScriptMode, "monologue">;

const DashboardCard = ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={cn("glass-panel rounded-[2.5rem] border-white/60 bg-white/60 shadow-xl backdrop-blur-md", className)}>
        {children}
    </div>
);

const getPressableStyle = (color: string, radius: number) => ({
    "--ui-pressable-color": color,
    "--ui-pressable-radius": `${radius}px`,
} as CSSProperties);

const formatSessionTime = (isoString: number) => {
    const date = new Date(isoString);
    return date.toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

function getMultiSpeakerMode(scriptMode: ListeningCabinScriptMode): MultiSpeakerMode | null {
    return scriptMode === "monologue" ? null : scriptMode;
}

export default function ListeningCabinDashboard() {
    const router = useRouter();
    const {
        sessions,
        createSession,
        deleteSession,
    } = useListeningCabin();

    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [isGeneratingAiTopic, setIsGeneratingAiTopic] = useState(false);
    const [topicNotice, setTopicNotice] = useState<string | null>(null);
    const [showChineseSubtitle, setShowChineseSubtitle] = useState(true);
    const [randomTopicLocked, setRandomTopicLocked] = useState(false);
    const [previewSentenceKey, setPreviewSentenceKey] = useState<string | null>(null);

    // Phase 25: Wizard & View Transitions
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(1);
    const [activeView, setActiveView] = useState<'dashboard' | 'script'>('dashboard');

    const previewAudioRef = useRef<HTMLAudioElement | null>(null);
    const usedRandomTopicsRef = useRef<Set<string>>(new Set());

    const [request, setRequest] = useState<ListeningCabinGenerationRequest>({
        ...DEFAULT_LISTENING_CABIN_REQUEST,
        topicMode: "random",
        topicSource: "pool",
        style: "storytelling",
    });

    const selectedSession = useMemo(
        () => sessions.find((s: ListeningCabinSession) => s.id === selectedSessionId) || (sessions.length > 0 ? sessions[0] : null),
        [sessions, selectedSessionId],
    );

    useEffect(() => {
        if (!selectedSessionId && sessions.length > 0) {
            setSelectedSessionId(sessions[0].id);
        }
    }, [sessions, selectedSessionId]);

    const lengthProfile = useMemo(
        () => resolveListeningCabinLengthProfile(request.scriptLength, request.sentenceLength),
        [request.scriptLength, request.sentenceLength],
    );

    const handleGenerate = async () => {
        setIsGenerating(true);
        setGenerateError(null);
        try {
            const finalRequest = { ...request };
            if (isRandomTopicMode && !finalRequest.prompt) {
                finalRequest.prompt = randomizeTopicFromPool() || "";
            }

            const response = await fetch("/api/ai/listening-cabin/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(finalRequest),
            });

            const data = await response.json() as ListeningCabinGenerationResponse & { error?: string };
            if (!response.ok) throw new Error(data.error || "生成失败");

            const newSession = await createSession({
                response: data,
                request: finalRequest,
                showChineseSubtitle,
            });
            router.push(`/listening-cabin/${newSession.id}?showChinese=${showChineseSubtitle}`);
        } catch (error) {
            setGenerateError(error instanceof Error ? error.message : "锻造失败，请稍后重试");
            setIsGenerating(false);
        }
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (confirm("确定要删除这个脚本吗？删除后无法恢复。")) {
            await deleteSession(sessionId);
            if (selectedSessionId === sessionId) {
                setSelectedSessionId(null);
            }
        }
    };

    const openSession = (id: string, restart = false) => {
        router.push(`/listening-cabin/${id}?showChinese=${showChineseSubtitle}${restart ? "&restart=true" : ""}`);
    };

    const handlePreviewSentence = async (session: ListeningCabinSession, index: number) => {
        const sentence = session.sentences[index];
        const previewKey = `${session.id}:${index}`;

        if (previewSentenceKey === previewKey) {
            previewAudioRef.current?.pause();
            setPreviewSentenceKey(null);
            return;
        }

        setPreviewSentenceKey(previewKey);
        try {
            const audio = previewAudioRef.current;
            if (!audio) {
                throw new Error("Preview audio element is unavailable");
            }

            const speakerVoice = sentence.speaker
                ? session.speakerPlan.assignments.find((assignment) => assignment.speaker === sentence.speaker)?.voice
                : undefined;
            const payload = await getListeningCabinTtsPayload(
                sentence.english,
                speakerVoice || session.speakerPlan.primaryVoice,
                session.playbackRate,
            );

            audio.pause();
            audio.src = payload.audio;
            audio.currentTime = 0;
            audio.onended = () => setPreviewSentenceKey(null);
            await audio.play();
        } catch (error) {
            console.error("Preview failed:", error);
            setPreviewSentenceKey(null);
        }
    };

    const randomizeTopicFromPool = () => {
        const usedTopics = usedRandomTopicsRef.current;
        let randomTopic = pickListeningCabinRandomTopic(`${Date.now()}-${Math.random()}`, request.scriptMode);

        if (usedTopics.has(randomTopic) && usedTopics.size < getListeningCabinRandomTopicPoolSize(request.scriptMode)) {
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

    const toggleFocusTag = (tag: ListeningCabinFocusTag) => {
        setRequest((current) => ({
            ...current,
            focusTags: current.focusTags.includes(tag)
                ? current.focusTags.filter((value) => value !== tag)
                : [...current.focusTags, tag],
        }));
    };

    const generateAiRandomTopic = async () => {
        setIsGeneratingAiTopic(true);

        try {
            const response = await fetch("/api/ai/listening-cabin/random-topic", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
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
        } catch (error) {
            randomizeTopicFromPool();
            setRequest((current) => ({
                ...current,
                topicMode: "random",
                topicSource: "pool",
            }));
            console.error("Listening cabin AI random topic failed:", error);
        } finally {
            setIsGeneratingAiTopic(false);
        }
    };

    const updatePrimaryVoice = (nextVoice: string) => {
        const resolvedVoice = normalizeListeningCabinVoice(
            nextVoice,
            DEFAULT_LISTENING_CABIN_REQUEST.speakerPlan.primaryVoice,
        );
        const multiSpeakerMode = getMultiSpeakerMode(request.scriptMode);
        setRequest((current) => ({
            ...current,
            speakerPlan: {
                ...current.speakerPlan,
                primaryVoice: resolvedVoice,
                assignments: multiSpeakerMode
                    ? ensureUniqueVoiceAssignments(buildDefaultMultiSpeakerAssignments(multiSpeakerMode, resolvedVoice), resolvedVoice).map((assignment, index) => (
                        index === 0 ? { ...assignment, speaker: getVoiceLabel(resolvedVoice), voice: resolvedVoice } : assignment
                    ))
                    : [{ speaker: "Narrator", voice: resolvedVoice }],
            },
        }));
    };

    const updateMultiSpeakerVoice = (speakerIndex: number, voice: string) => {
        const resolvedVoice = normalizeListeningCabinVoice(
            voice,
            DEFAULT_LISTENING_CABIN_REQUEST.speakerPlan.primaryVoice,
        );
        setRequest((current) => {
            if (!isListeningCabinMultiSpeakerMode(current.scriptMode)) {
                return current;
            }
            const nextAssignments = [...current.speakerPlan.assignments];
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
            const nextAssignments = [...current.speakerPlan.assignments];

            if (nextAssignments.length >= LISTENING_CABIN_MULTI_SPEAKER_MAX) {
                return current;
            }
            const usedVoices = new Set(nextAssignments.map((assignment) => assignment.voice));
            const candidateVoice = TTS_VOICE_OPTIONS.find((option) => !usedVoices.has(option.voice))?.voice
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

            const targetCount = current.speakerPlan.assignments.length;
            const shuffled = [...TTS_VOICE_OPTIONS]
                .filter((v) => v.voice.startsWith("en-"))
                .sort(() => Math.random() - 0.5)
                .slice(0, targetCount)
                .map((option) => option.voice);
            const uniqueVoices = ensureUniqueVoiceAssignments(shuffled.map((voice, index) => ({
                speaker: `Speaker ${index + 1}`,
                voice,
            })), current.speakerPlan.primaryVoice);
            const randomizedAssignments = uniqueVoices.map((assignment) => ({
                speaker: getVoiceLabel(assignment.voice),
                voice: assignment.voice,
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
            const nextAssignments = [...current.speakerPlan.assignments];

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

    const voiceOptions = useMemo(() => TTS_VOICE_OPTIONS.filter((v) => v.voice.startsWith("en-")), []);
    const isRandomTopicMode = request.topicMode === "random" || request.topicMode === "hybrid";
    const isMultiSpeaker = isListeningCabinMultiSpeakerMode(request.scriptMode);

    // Auto-init multi-speaker assignments when scriptMode changes
    useEffect(() => {
        const multiSpeakerMode = getMultiSpeakerMode(request.scriptMode);
        if (multiSpeakerMode) {
            if (request.speakerPlan.assignments.length < LISTENING_CABIN_MULTI_SPEAKER_MIN) {
                const defaults = buildDefaultMultiSpeakerAssignments(multiSpeakerMode, request.speakerPlan.primaryVoice);
                const unique = ensureUniqueVoiceAssignments(defaults, request.speakerPlan.primaryVoice);
                setRequest(c => ({
                    ...c,
                    speakerPlan: {
                        ...c.speakerPlan,
                        strategy: "mixed_dialogue",
                        assignments: unique.map((assignment) => ({
                            speaker: getVoiceLabel(assignment.voice),
                            voice: assignment.voice,
                        })),
                    },
                }));
            }
        } else {
            setRequest(c => ({
                ...c,
                speakerPlan: {
                    ...c.speakerPlan,
                    strategy: "fixed",
                    assignments: [{ speaker: "Narrator", voice: c.speakerPlan.primaryVoice }],
                },
            }));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request.scriptMode]);

    return (
        <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f6f2eb_0%,#f2ece3_48%,#f5f0ea_100%)] text-[#1b1611]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,197,80,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(191,207,255,0.3),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(250,240,224,0.9),transparent_26%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[18rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.58),transparent)]" />

            <div className="relative mx-auto max-w-[1120px] px-4 pb-10 pt-5 sm:px-6 lg:px-8">
                <header className="mb-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            type="button"
                            onClick={() => router.push("/?from=listening-cabin")}
                            className="ui-pressable group inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#1b1611] shadow-[0_8px_18px_rgba(46,27,8,0.06)] backdrop-blur-md transition-all active:scale-90"
                            style={getPressableStyle("rgba(24,20,17,0.08)", 2)}
                            aria-label="返回首页"
                        >
                            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div>
                            <p className="text-sm font-black tracking-[0.2em] text-[#1a1c1d] uppercase">The Listening Cabin</p>
                            <p className="text-[11px] text-[#8f8478] font-bold mt-0.5">引导式深度听力锻造系统 · Guidance Forge v2.5</p>
                        </div>
                    </div>
                </header>

                <AnimatePresence mode="wait">
                    {activeView === 'dashboard' ? (
                        <motion.div 
                            key="dashboard"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex flex-col gap-16 max-w-7xl mx-auto w-full"
                        >
                            {/* Top Hero: Guidance Forge */}
                            <section className="flex flex-col items-center">
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ type: "spring", damping: 20, stiffness: 100 }}
                                    className="relative group w-full max-w-5xl"
                                >
                                    <div className="absolute -inset-4 bg-gradient-to-br from-pink-300 via-amber-200 to-indigo-200 rounded-[4rem] blur-3xl opacity-15 group-hover:opacity-30 transition duration-1000" />
                                    <button
                                        onClick={() => { setWizardStep(1); setShowWizard(true); }}
                                        className="relative w-full min-h-[480px] bg-[#fffaf5]/80 backdrop-blur-sm border-[4px] border-white/90 rounded-[4rem] p-12 lg:p-20 flex flex-col items-center justify-center text-center overflow-hidden shadow-[0_48px_80px_-16px_rgba(255,160,122,0.15),inset_0_4px_16px_rgba(255,255,255,1)] group active:scale-[0.98] transition-all"
                                    >
                                        {/* Floating Decorative Elements */}
                                        <motion.div 
                                            animate={{ y: [0, -15, 0], x: [0, 10, 0] }}
                                            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute top-12 left-12 w-32 h-32 bg-pink-100/40 rounded-full blur-2xl" 
                                        />
                                        <motion.div 
                                            animate={{ y: [0, 12, 0], x: [0, -8, 0] }}
                                            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                                            className="absolute bottom-10 right-24 w-40 h-40 bg-blue-100/40 rounded-full blur-3xl" 
                                        />

                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.8)_0%,transparent_80%)]" />
                                        
                                        <div className="relative z-10 flex flex-col items-center gap-10">
                                            <motion.div 
                                                whileHover={{ rotate: [0, -15, 15, 0], scale: 1.2 }}
                                                transition={{ type: "spring", stiffness: 400, damping: 12 }}
                                                className="w-32 h-32 rounded-[2.5rem] bg-white flex items-center justify-center shadow-[0_24px_48px_-8px_rgba(255,165,0,0.15)] border-2 border-orange-50 group-hover:border-orange-100 transition-colors"
                                            >
                                                <div className="text-7xl">🪄</div>
                                            </motion.div>
                                            <div>
                                                <h2 className="text-5xl font-black tracking-tighter text-[#4a3a2a] drop-shadow-sm mb-6">开启引导式锻造</h2>
                                                <p className="text-lg text-[#8f8478] max-w-xl font-black leading-relaxed opacity-80">
                                                    超级可爱的导览体验，只需几步，即可定制专属于你的梦想英语听力 🌈
                                                </p>
                                            </div>
                                            <div className="px-16 py-6 bg-gradient-to-r from-[#ff8ca0] to-[#ff6b95] text-white text-[16px] font-black uppercase tracking-[0.2em] rounded-[2rem] shadow-[0_20px_40px_-8px_rgba(255,107,149,0.35)] group-hover:shadow-[0_24px_48px_-8px_rgba(255,107,149,0.45)] group-hover:translate-y-[-4px] transition-all">
                                                Start Your Magic ✨
                                            </div>
                                        </div>
                                    </button>
                                </motion.div>

                                {generateError && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-6 rounded-[2.5rem] bg-red-50 border-2 border-red-100 text-red-600 text-[14px] font-black italic max-w-xl text-center">
                                        {generateError}
                                    </motion.div>
                                )}
                            </section>

                            {/* Bottom Section: History Records Gallery */}
                            <section className="flex flex-col gap-10 pb-20">
                                <div className="flex items-end justify-between px-6">
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center text-2xl shadow-sm">📜</div>
                                            <h3 className="text-2xl font-black text-[#5c4033] tracking-tighter uppercase">冒险日志</h3>
                                        </div>
                                        <p className="text-[12px] font-black text-slate-400 uppercase tracking-[0.3em] ml-13">Adventure Records</p>
                                    </div>
                                    <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-white/50 rounded-2xl border border-white/80 text-[11px] font-black text-slate-400 uppercase tracking-widest shadow-sm">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                        Ready for New Echoes
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {sessions.length > 0 ? sessions.slice(0, 12).map((session: ListeningCabinSession) => (
                                        <motion.div 
                                            key={session.id} 
                                            whileHover={{ y: -8, scale: 1.02 }}
                                            className={cn(
                                                "rounded-[3rem] border-2 p-8 transition-all duration-500 relative group overflow-hidden h-full flex flex-col justify-between",
                                                selectedSessionId === session.id 
                                                    ? "border-pink-300 bg-white shadow-[0_32px_64px_-16px_rgba(255,107,149,0.18)]" 
                                                    : "border-[#ede4db] bg-white/60 hover:bg-white hover:border-pink-200 shadow-[0_16px_32px_-12px_rgba(0,0,0,0.03)] hover:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)]"
                                            )}
                                        >
                                            {/* Top corner gloss */}
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-pink-50/20 to-transparent rounded-full -translate-y-12 translate-x-12 blur-2xl" />
                                            
                                            <div className="relative z-10 mb-8" onClick={() => setSelectedSessionId(session.id)}>
                                                <div className="flex items-center gap-3 mb-4">
                                                    <span className={cn(
                                                        "px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border-2 shadow-sm",
                                                        session.cefrLevel === 'A1' || session.cefrLevel === 'A2' ? "bg-emerald-50 border-emerald-100 text-emerald-500" :
                                                        session.cefrLevel === 'B1' || session.cefrLevel === 'B2' ? "bg-blue-50 border-blue-100 text-blue-500" :
                                                        "bg-purple-50 border-purple-100 text-purple-500"
                                                    )}>
                                                        {session.cefrLevel} Level
                                                    </span>
                                                    <span className="text-[11px] text-slate-300 font-black">•</span>
                                                    <p className="text-[11px] text-slate-400 font-black">{formatSessionTime(session.updated_at)}</p>
                                                </div>
                                                <h4 className="text-xl font-black text-[#5c4033] leading-tight line-clamp-2 tracking-tight group-hover:text-pink-400 transition-colors">{session.title}</h4>
                                            </div>

                                            <div className="mt-auto flex items-center gap-3 pt-6 border-t border-slate-50 relative z-10">
                                                <button 
                                                    onClick={() => openSession(session.id)} 
                                                    className="flex-1 px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] hover:scale-105 active:scale-95 transition-all shadow-lg"
                                                >
                                                    Continue
                                                </button>
                                                <button 
                                                    onClick={() => { setSelectedSessionId(session.id); setActiveView('script'); }} 
                                                    className="px-6 py-3.5 bg-white border-2 border-slate-100 text-[#5c4033] rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] hover:border-pink-200 hover:text-pink-400 transition-all active:scale-95 shadow-sm"
                                                >
                                                    Script 📜
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteSession(session.id)} 
                                                    className="w-12 h-12 flex items-center justify-center rounded-2xl bg-red-50 text-red-300 hover:bg-red-500 hover:text-white transition-all active:scale-95 shadow-sm"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </motion.div>
                                    )) : (
                                        <div className="lg:col-span-3 py-32 text-center rounded-[3rem] bg-white/40 border-2 border-dashed border-slate-200">
                                            <div className="text-7xl mb-6 opacity-20">🍯</div>
                                            <p className="text-lg font-black text-slate-300 italic">空空如也，快去锻造你的第一段听力吧！</p>
                                        </div>
                                    )}
                                </div>
                            </section>
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="script"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                            className="flex flex-col gap-8 max-w-5xl mx-auto w-full px-4 lg:px-0"
                        >
                            {selectedSession && (
                                <>
                                    <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-4 p-8 rounded-[3rem] bg-white/40 border-2 border-white/60 backdrop-blur-xl">
                                        <div className="flex items-center gap-8 text-center md:text-left">
                                            <motion.button 
                                                whileHover={{ scale: 1.1, rotate: -10 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={() => setActiveView('dashboard')}
                                                className="w-14 h-14 rounded-2xl bg-white border-2 border-slate-100 flex items-center justify-center text-slate-600 hover:border-pink-200 hover:text-pink-400 transition-all shadow-[0_8px_24px_-4px_rgba(0,0,0,0.05)] active:scale-90"
                                            >
                                                <ChevronLeft size={24} strokeWidth={3} />
                                            </motion.button>
                                            <div>
                                                <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-400 bg-pink-50 px-3 py-1 rounded-full border border-pink-100 shadow-sm">Script Artifact 💎</span>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{selectedSession.cefrLevel} Level</span>
                                                </div>
                                                <h2 className="text-4xl font-black text-[#5c4033] tracking-tighter leading-tight drop-shadow-sm">{selectedSession.title}</h2>
                                            </div>
                                        </div>
                                        <motion.button 
                                            whileHover={{ scale: 1.05, y: -4 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => openSession(selectedSession.id)} 
                                            className="px-12 py-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-[2.5rem] text-[15px] font-black uppercase tracking-[0.15em] shadow-[0_24px_48px_-12px_rgba(15,23,42,0.35)] hover:shadow-[0_28px_56px_-12px_rgba(15,23,42,0.45)] active:scale-95 transition-all flex items-center gap-3"
                                        >
                                            <Play size={20} fill="currentColor" strokeWidth={0} />
                                            Enter Magic 🎧
                                        </motion.button>
                                    </div>

                                    <div className="grid gap-6 mb-20">
                                        {selectedSession.sentences.map((sentence, idx: number) => {
                                            const previewKey = `${selectedSession.id}:${sentence.index}`;
                                            const isPreviewing = previewSentenceKey === previewKey;
                                            return (
                                                <motion.div 
                                                    key={idx} 
                                                    initial={{ opacity: 0, y: 30 }}
                                                    animate={{ opacity: 1, y: 0, transition: { delay: idx * 0.04, type: "spring", stiffness: 120, damping: 15 } }}
                                                    className={cn(
                                                        "p-8 sm:p-10 rounded-[3.5rem] border-2 transition-all group relative overflow-hidden",
                                                        isPreviewing 
                                                            ? "bg-pink-50/40 border-pink-200 shadow-xl shadow-pink-100/30" 
                                                            : "bg-white/80 border-white/60 hover:border-pink-100 hover:bg-white shadow-sm"
                                                    )}
                                                >
                                                    {/* Decorative background blobs */}
                                                    <div className="absolute -top-10 -right-10 w-24 h-24 bg-gradient-to-br from-pink-50 to-orange-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    
                                                    <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-8 relative z-10">
                                                        <div className="flex-1 text-center sm:text-left">
                                                            <div className="flex items-center justify-center sm:justify-start gap-4 mb-6">
                                                                <span className="w-9 h-9 rounded-2xl bg-slate-50 border-2 border-slate-100 flex items-center justify-center text-[12px] font-black text-slate-400 shadow-sm group-hover:bg-white transition-colors">{idx + 1}</span>
                                                                <div className="px-3 py-1 bg-gradient-to-r from-orange-50 to-pink-50 border-2 border-orange-100/50 rounded-full">
                                                                     <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">{sentence.speaker || "Narrator"}</p>
                                                                </div>
                                                            </div>
                                                            <p className="text-[22px] font-black text-[#5c4033] leading-relaxed tracking-tight italic mb-5 antialiased">
                                                                {`"${sentence.english}"`}
                                                            </p>
                                                            <div className="inline-block px-4 py-2 rounded-2xl bg-slate-50/80 group-hover:bg-pink-50/50 transition-colors">
                                                                <p className="text-[14px] text-slate-500 leading-relaxed font-black opacity-80">{sentence.chinese}</p>
                                                            </div>
                                                        </div>
                                                        <motion.button 
                                                            whileHover={{ scale: 1.1, rotate: 15 }}
                                                            whileTap={{ scale: 0.9 }}
                                                            onClick={() => handlePreviewSentence(selectedSession, idx)} 
                                                            className={cn(
                                                                "w-16 h-16 rounded-[2.2rem] flex items-center justify-center transition-all active:scale-90 shadow-lg shrink-0",
                                                                isPreviewing 
                                                                    ? "bg-[#ff8ca0] text-white rotate-12 shadow-[0_12px_24px_-8px_rgba(255,140,160,0.6)]" 
                                                                    : "bg-white border-2 border-slate-50 text-slate-300 hover:border-pink-200 hover:text-[#ff8ca0] hover:shadow-xl hover:shadow-pink-100"
                                                            )}
                                                        >
                                                            {isPreviewing ? (
                                                                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                                                                    <Play size={22} fill="currentColor" />
                                                                </motion.div>
                                                            ) : (
                                                                <Play size={22} fill="currentColor" />
                                                            )}
                                                        </motion.button>
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Phase 25: The Guidance Forge Wizard — Cute Bottom Sheet */}
            <AnimatePresence>
                {showWizard && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        className="fixed inset-0 z-[1000] flex items-end justify-center"
                    >
                        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setShowWizard(false)} />
                        <motion.div 
                            initial={{ y: "100%" }} 
                            animate={{ y: 0 }} 
                            exit={{ y: "100%" }} 
                            transition={{ type: "spring", damping: 30, stiffness: 300 }}
                            className="relative w-full max-w-lg rounded-t-[2.5rem] bg-white shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.15)] flex flex-col max-h-[58vh]"
                        >
                            {/* Drag Handle */}
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 rounded-full bg-slate-200" />
                            </div>

                            {/* Header */}
                             <div className="px-7 pb-4 pt-2 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-2xl bg-amber-50 flex items-center justify-center shadow-inner">
                                        <span className="text-xl">🧁</span>
                                    </div>
                                    <h2 className="text-[17px] font-black text-[#5c4033] tracking-tight">打造可爱脚本</h2>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="flex gap-1.5 px-3 py-2 bg-slate-50 rounded-full border border-slate-100">
                                        {[1,2,3,4,5].map(step => (
                                            <motion.div 
                                                key={step} 
                                                animate={{ 
                                                    width: step === wizardStep ? 18 : 8,
                                                    backgroundColor: step < wizardStep ? "#ffcc00" : step === wizardStep ? "#ff8ca0" : "#e2e8f0"
                                                }}
                                                className="h-2 rounded-full" 
                                            />
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => setShowWizard(false)} 
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-red-50 hover:text-red-400 transition-colors text-slate-300"
                                    >
                                        <X size={16} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Body */}
                            <div className="flex-1 overflow-y-auto px-6 pb-6 overscroll-contain">
                                <AnimatePresence mode="wait">
                                    {/* Step 1: Mode */}
                                    {wizardStep === 1 && (
                                        <motion.div key="s1" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">🎭 选择模式</h3>
                                                <p className="text-xs text-slate-400 mt-1 font-semibold">脚本的基础交互方式</p>
                                            </div>
                                            <div className="grid gap-3">
                                                {LISTENING_CABIN_SCRIPT_MODE_OPTIONS.map(o => (
                                                    <motion.button 
                                                        key={o.value} 
                                                        whileHover={{ scale: 1.02, x: 4 }}
                                                        whileTap={{ scale: 0.98 }}
                                                        onClick={() => { setRequest(c => ({ ...c, scriptMode: o.value })); setWizardStep(2); }} 
                                                        className={cn(
                                                            "w-full px-6 py-5 text-left rounded-[2rem] border-2 transition-all group flex items-center justify-between",
                                                            o.value === 'monologue' ? "bg-orange-50/50 border-orange-100 hover:bg-orange-100/50" :
                                                            o.value === 'podcast' ? "bg-purple-50/50 border-purple-100 hover:bg-purple-100/50" :
                                                            "bg-blue-50/50 border-blue-100 hover:bg-blue-100/50"
                                                        )}
                                                    >
                                                        <div>
                                                            <p className="text-[16px] font-black text-slate-700">{o.value === 'monologue' ? '🎙️' : o.value === 'podcast' ? '🎧' : '💬'} {o.label}</p>
                                                            <p className="text-[11px] text-slate-400 mt-1 font-bold leading-tight">{o.value === 'monologue' ? '单人口音，聚焦语言本身' : o.value === 'podcast' ? '播客模式，多人深度讨论' : '自然场景对话，真实语境'}</p>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                                            <ChevronRight className="text-slate-300" size={18} strokeWidth={3} />
                                                        </div>
                                                    </motion.button>
                                                ))}
                                            </div>
                                            <div className="space-y-2 pt-2">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">推理模式</p>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {LISTENING_CABIN_THINKING_MODE_OPTIONS.map((option) => (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() => setRequest((current) => ({ ...current, thinkingMode: option.value }))}
                                                            className={cn(
                                                                "rounded-2xl border-2 px-5 py-2.5 text-[12px] font-black tracking-tight transition-all active:scale-95",
                                                                request.thinkingMode === option.value
                                                                    ? "border-pink-300 bg-pink-50 text-pink-600 shadow-[0_4px_12px_rgba(255,140,160,0.15)]"
                                                                    : "border-slate-100 bg-white text-slate-400 hover:border-pink-100 hover:text-slate-600",
                                                            )}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Step 2: Style */}
                                    {wizardStep === 2 && (
                                        <motion.div key="s2" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">💫 注入灵魂</h3>
                                                <p className="text-xs text-slate-400 mt-1 font-semibold">选择稿件的核心文风</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2.5">
                                                {LISTENING_CABIN_SCRIPT_STYLE_OPTIONS.map(o => (
                                                    <button 
                                                        key={o.value} 
                                                        onClick={() => setRequest(c => ({ ...c, style: o.value }))} 
                                                        className={cn(
                                                            "px-5 py-3 rounded-2xl border-2 text-[13px] font-black tracking-tight transition-all active:scale-95", 
                                                            request.style === o.value 
                                                                ? "border-purple-300 bg-purple-50 text-purple-600 shadow-[0_4px_12px_rgba(167,139,250,0.15)]" 
                                                                : "border-slate-100 bg-white text-slate-400 hover:border-purple-100 hover:text-slate-600"
                                                        )}
                                                    >
                                                        ✨ {o.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex justify-between pt-5 items-center">
                                                <button onClick={() => setWizardStep(1)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all">
                                                    <ChevronLeft size={16} strokeWidth={3} /> 返回
                                                </button>
                                                <motion.button 
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => setWizardStep(3)} 
                                                    className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-[0_12px_24px_-4px_rgba(15,23,42,0.3)] active:scale-95 transition-all uppercase tracking-widest"
                                                >
                                                    下一步 🎀
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Step 3: CEFR */}
                                    {wizardStep === 3 && (
                                        <motion.div key="s3" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">📚 难度等级</h3>
                                                <p className="text-xs text-slate-400 mt-1 font-semibold">基于 CEFR 标准和词汇密度</p>
                                            </div>
                                            <div className="grid grid-cols-3 gap-3">
                                                {LISTENING_CABIN_CEFR_OPTIONS.map(o => (
                                                    <motion.button 
                                                        key={o} 
                                                        whileHover={{ scale: 1.05, y: -4 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => setRequest(c => ({ ...c, cefrLevel: o }))} 
                                                        className={cn(
                                                            "py-5 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-1 active:scale-95 shadow-sm", 
                                                            request.cefrLevel === o 
                                                                ? "border-blue-400 bg-blue-50/50 text-blue-600" 
                                                                : "border-slate-100 bg-white text-slate-400 hover:border-blue-200"
                                                        )}
                                                    >
                                                        <p className="text-2xl font-black">{o}</p>
                                                        <span className="text-[9px] font-black uppercase tracking-widest opacity-60">Level</span>
                                                    </motion.button>
                                                ))}
                                            </div>
                                            <div className="space-y-2">
                                                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">词汇密度</p>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {LISTENING_CABIN_LEXICAL_DENSITY_OPTIONS.map((option) => (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() => setRequest((current) => ({ ...current, lexicalDensity: option.value }))}
                                                            className={cn(
                                                                "rounded-2xl border-2 px-5 py-2.5 text-[12px] font-black transition-all active:scale-95",
                                                                request.lexicalDensity === option.value
                                                                    ? "border-indigo-400 bg-indigo-50 text-indigo-600 shadow-[0_4px_12px_rgba(129,140,248,0.15)]"
                                                                    : "border-slate-100 bg-white text-slate-400 hover:border-indigo-100 hover:text-indigo-600",
                                                            )}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex justify-between pt-5 items-center">
                                                <button onClick={() => setWizardStep(2)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all">
                                                    <ChevronLeft size={16} strokeWidth={3} /> 返回
                                                </button>
                                                <motion.button 
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => setWizardStep(4)} 
                                                    className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-[0_12px_24px_-4px_rgba(15,23,42,0.3)] active:scale-95 transition-all uppercase tracking-widest"
                                                >
                                                    下一步 🎨
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Step 4: Topic */}
                                    {wizardStep === 4 && (
                                        <motion.div key="s4" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">🌸 主题灵感</h3>
                                                <p className="text-xs text-slate-400 mt-1 font-semibold">设置主题来源，并描述你想听的内容</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2.5">
                                                {LISTENING_CABIN_TOPIC_MODE_OPTIONS.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => setRequest((current) => ({
                                                            ...current,
                                                            topicMode: option.value,
                                                            topicSource: option.value === "manual" ? "manual" : option.value === "random" ? "pool" : current.topicSource,
                                                        }))}
                                                        className={cn(
                                                            "rounded-2xl border-2 px-5 py-2.5 text-[12px] font-black transition-all active:scale-95",
                                                            request.topicMode === option.value
                                                                ? "border-amber-400 bg-amber-50 text-amber-700 shadow-[0_4px_12px_rgba(245,158,11,0.15)]"
                                                                : "border-slate-100 bg-white text-slate-400 hover:border-amber-100 hover:text-amber-600",
                                                        )}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="rounded-[2rem] bg-white border-2 border-slate-100 p-6 shadow-inner focus-within:border-amber-200 transition-all">
                                                <textarea 
                                                    value={request.prompt} 
                                                    onChange={e => setRequest(c => ({ ...c, prompt: e.target.value, topicSource: "manual" }))} 
                                                    className="w-full h-24 bg-transparent text-sm font-black text-slate-700 outline-none placeholder:text-slate-300 resize-none leading-relaxed" 
                                                    placeholder="越具体越好，比如：一个关于太空旅行的科幻小故事…" 
                                                />
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={generateAiRandomTopic} disabled={isGeneratingAiTopic} className="flex-1 py-4 bg-purple-50 border-2 border-purple-100 rounded-2xl text-[13px] font-black text-purple-600 flex items-center justify-center gap-2.5 hover:bg-purple-100 transition-all active:scale-95">
                                                    {isGeneratingAiTopic ? <Loader2 size={15} className="animate-spin" /> : <span>🔮 AI 生成</span>} 
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        randomizeTopicFromPool();
                                                        setTopicNotice("已从本地随机池填入一个主题。");
                                                    }}
                                                    disabled={!isRandomTopicMode}
                                                    className="flex-1 py-4 bg-blue-50 border-2 border-blue-100 rounded-2xl text-[13px] font-black text-blue-600 hover:bg-blue-100 transition-all active:scale-95 disabled:opacity-40"
                                                >
                                                    🎲 随机发现
                                                </button>
                                            </div>
                                            <div className="flex justify-between pt-5 items-center">
                                                <button onClick={() => setWizardStep(3)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all">
                                                    <ChevronLeft size={16} strokeWidth={3} /> 返回
                                                </button>
                                                <motion.button 
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => setWizardStep(5)} 
                                                    className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-[0_12px_24px_-4px_rgba(15,23,42,0.3)] active:scale-95 transition-all uppercase tracking-widest"
                                                >
                                                    下一步 🎙️
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Step 5: Voice — Multi-Speaker Aware */}
                                    {wizardStep === 5 && (
                                        <motion.div key="s5" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.3 }} className="space-y-4">
                                            <div>
                                                <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
                                                    🍭 {isMultiSpeaker ? `选择环节 (${request.speakerPlan.assignments.length}人)` : '节奏与声线'} 🍬
                                                </h3>
                                            </div>
                                            <div className="space-y-4 rounded-[2.5rem] bg-slate-50/50 border-2 border-slate-100 p-6">
                                                <div className="space-y-2.5">
                                                    <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">句子长度</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {LISTENING_CABIN_SENTENCE_LENGTH_OPTIONS.map((option) => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => setRequest((current) => ({ ...current, sentenceLength: option.value }))}
                                                                className={cn(
                                                                    "rounded-2xl border-2 px-5 py-2.5 text-[12px] font-black transition-all active:scale-95",
                                                                    request.sentenceLength === option.value
                                                                        ? "border-amber-300 bg-amber-50 text-amber-700 shadow-sm"
                                                                        : "border-slate-100 bg-white text-slate-400 hover:border-amber-100 hover:text-slate-700",
                                                                )}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="space-y-2.5">
                                                    <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">文章长度</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {LISTENING_CABIN_SCRIPT_LENGTH_OPTIONS.map((option) => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => setRequest((current) => ({ ...current, scriptLength: option.value }))}
                                                                className={cn(
                                                                    "rounded-2xl border-2 px-5 py-2.5 text-[12px] font-black transition-all active:scale-95",
                                                                    request.scriptLength === option.value
                                                                        ? "border-pink-300 bg-pink-50 text-[#ff8ca0] shadow-sm"
                                                                        : "border-slate-100 bg-white text-slate-400 hover:border-pink-100 hover:text-[#ff8ca0]",
                                                                )}
                                                            >
                                                                {option.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-5 py-4 text-[12px] font-black leading-relaxed text-[#8f8478]">
                                                    预计 {Math.round(lengthProfile.targetWords)} 词，约 {lengthProfile.estimatedMinutes.toFixed(1)} 分钟，
                                                    句数区间约 {lengthProfile.targetSentenceRange.min}-{lengthProfile.targetSentenceRange.max} 句。
                                                </div>
                                            </div>

                                            {isMultiSpeaker ? (
                                                /* Multi-Speaker Panel */
                                                <div className="space-y-3">
                                                    {/* Controls Row */}
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={randomizeMultiSpeakerVoices}
                                                            className="flex-1 py-2.5 bg-amber-50 border border-amber-100 rounded-xl text-[11px] font-bold text-amber-700 flex items-center justify-center gap-1.5 hover:bg-amber-100 transition-all active:scale-95"
                                                        >
                                                            🎲 随机分配
                                                        </button>
                                                        <button
                                                            onClick={addSpeakerAssignment}
                                                            disabled={request.speakerPlan.assignments.length >= LISTENING_CABIN_MULTI_SPEAKER_MAX}
                                                            className="py-2.5 px-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-30"
                                                        >
                                                            + 添加
                                                        </button>
                                                        <button
                                                            onClick={removeSpeakerAssignment}
                                                            disabled={request.speakerPlan.assignments.length <= LISTENING_CABIN_MULTI_SPEAKER_MIN}
                                                            className="py-2.5 px-3 bg-slate-50 border border-slate-100 rounded-xl text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-30"
                                                        >
                                                            − 移除
                                                        </button>
                                                    </div>

                                                    {/* Per-Speaker Voice Selectors */}
                                                    <div className="space-y-2 max-h-[24vh] overflow-y-auto pr-1 custom-scrollbar">
                                                        {request.speakerPlan.assignments.map((assignment, idx: number) => (
                                                            <div key={idx} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                                                                <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-2">
                                                                    发言人 {idx + 1}: {assignment.speaker || `Speaker ${idx + 1}`}
                                                                </p>
                                                                <select
                                                                    value={assignment.voice}
                                                                    onChange={(e) => updateMultiSpeakerVoice(idx, e.target.value)}
                                                                    className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-amber-300 transition-colors"
                                                                >
                                                                    {voiceOptions.map((v) => (
                                                                        <option key={v.voice} value={v.voice}>{v.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Single Speaker List */
                                                <div className="space-y-3">
                                                    <div className="space-y-2">
                                                        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">声线策略</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {LISTENING_CABIN_SPEAKER_STRATEGY_OPTIONS
                                                                .filter((option) => option.value !== "mixed_dialogue")
                                                                .map((option) => (
                                                                    <button
                                                                        key={option.value}
                                                                        type="button"
                                                                        onClick={() => setRequest((current) => ({
                                                                            ...current,
                                                                            speakerPlan: {
                                                                                ...current.speakerPlan,
                                                                                strategy: option.value,
                                                                                assignments: [{ speaker: "Narrator", voice: current.speakerPlan.primaryVoice }],
                                                                            },
                                                                        }))}
                                                                        className={cn(
                                                                            "rounded-full border px-4 py-2 text-[12px] font-bold transition-all active:scale-95",
                                                                            request.speakerPlan.strategy === option.value
                                                                                ? "border-amber-300 bg-amber-50 text-amber-700 shadow-sm"
                                                                                : "border-slate-100 bg-white text-slate-500 hover:border-amber-200 hover:text-slate-700",
                                                                        )}
                                                                    >
                                                                        {option.label}
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    </div>

                                                    {request.speakerPlan.strategy === "fixed" ? (
                                                        <div className="grid gap-1.5 max-h-[18vh] overflow-y-auto pr-1 custom-scrollbar">
                                                            {voiceOptions.map(v => (
                                                                <button 
                                                                    key={v.voice} 
                                                                    onClick={() => updatePrimaryVoice(v.voice)} 
                                                                    className={cn(
                                                                        "px-4 py-3 rounded-xl border transition-all flex items-center gap-3 active:scale-[0.98]", 
                                                                        request.speakerPlan.primaryVoice === v.voice 
                                                                            ? "border-amber-300 bg-amber-50/80 shadow-sm" 
                                                                            : "border-slate-50 bg-white hover:bg-slate-50"
                                                                    )}
                                                                >
                                                                    <div className={cn("w-2.5 h-2.5 rounded-full transition-all shrink-0", request.speakerPlan.primaryVoice === v.voice ? "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" : "bg-slate-200")} />
                                                                    <p className="text-sm font-bold text-slate-700 truncate">{v.label}</p>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-[12px] font-semibold leading-6 text-slate-500">
                                                            当前为随机单声线。每次生成会随机选择一个英文声线，但整篇保持一致。
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="space-y-3">
                                                <p className="text-[11px] font-black uppercase tracking-widest text-[#8f8478]">听力目标 🎯</p>
                                                <div className="flex flex-wrap gap-2.5">
                                                    {LISTENING_CABIN_FOCUS_OPTIONS.map((option) => (
                                                        <button
                                                            key={option.value}
                                                            onClick={() => toggleFocusTag(option.value)}
                                                            className={cn(
                                                                "rounded-2xl border-2 px-5 py-2.5 text-[12px] font-black transition-all active:scale-95",
                                                                request.focusTags.includes(option.value)
                                                                    ? "border-[#5c4033] bg-[#5c4033] text-white shadow-sm"
                                                                    : "border-slate-100 bg-white text-slate-400 hover:border-pink-100",
                                                            )}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => setShowChineseSubtitle((current) => !current)}
                                                className={cn(
                                                    "flex w-full items-center justify-between rounded-[2rem] border-2 px-6 py-5 text-left transition-all",
                                                    showChineseSubtitle
                                                        ? "border-pink-200 bg-pink-50/50 shadow-sm"
                                                        : "border-slate-100 bg-white",
                                                )}
                                            >
                                                <div>
                                                    <p className="text-[14px] font-black text-[#5c4033]">默认显示中文字幕 📖</p>
                                                    <p className="text-[11px] font-black text-[#8f8478] mt-1">进入播放器时的默认偏好</p>
                                                </div>
                                                <div className={cn(
                                                    "flex h-8 w-14 items-center rounded-full px-1.5 transition-colors",
                                                    showChineseSubtitle ? "bg-[#ff8ca0]" : "bg-slate-200",
                                                )}>
                                                    <motion.div 
                                                        animate={{ x: showChineseSubtitle ? 24 : 0 }}
                                                        className="h-5 w-5 rounded-full bg-white shadow-sm" 
                                                    />
                                                </div>
                                            </button>

                                            <div className="flex justify-between pt-5 items-center border-t border-slate-100/50">
                                                <button onClick={() => setWizardStep(4)} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black text-slate-400 hover:bg-slate-50 transition-all">
                                                    <ChevronLeft size={16} strokeWidth={3} /> 返回
                                                </button>
                                                <motion.button 
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => { setShowWizard(false); handleGenerate(); }} 
                                                    className="px-10 py-4.5 bg-gradient-to-r from-[#ff8ca0] to-[#ff6b95] text-white rounded-3xl text-[14px] font-black shadow-[0_16px_32px_-8px_rgba(255,107,149,0.4)] transition-all flex items-center gap-3 tracking-[0.12em] uppercase"
                                                >
                                                    ✨ 开启锻造
                                                </motion.button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Phase 25: Immersive Forge Loader Overlay */}
            <AnimatePresence>
                {isGenerating && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        className="fixed inset-0 z-[2000] flex items-center justify-center bg-white/90 backdrop-blur-3xl overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-pink-50/50 via-yellow-50/50 to-blue-50/50 opacity-40" />
                        
                        {/* Decorative Background Circles */}
                        <motion.div animate={{ scale: [1, 1.2, 1], x: [0, 20, 0] }} transition={{ duration: 8, repeat: Infinity }} className="absolute -top-20 -left-20 w-80 h-80 bg-pink-100 rounded-full blur-[80px]" />
                        <motion.div animate={{ scale: [1, 1.5, 1], x: [0, -40, 0] }} transition={{ duration: 10, repeat: Infinity }} className="absolute -bottom-40 -right-20 w-96 h-96 bg-blue-100 rounded-full blur-[100px]" />

                        <div className="relative flex flex-col items-center gap-12 z-10">
                            <div className="relative">
                                <motion.div 
                                    animate={{ rotate: 360 }} 
                                    transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                                    className="w-56 h-56 rounded-full border-[12px] border-white/80 border-t-[#ff8ca0] border-r-[#7dd3fc] shadow-[0_32px_64px_-12px_rgba(255,107,149,0.2)]" 
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <motion.span 
                                        animate={{ scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] }}
                                        transition={{ duration: 2, repeat: Infinity }}
                                        className="text-7xl"
                                    >
                                        🧁
                                    </motion.span>
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-4xl font-black text-[#5c4033] tracking-tighter drop-shadow-sm">Magic in Progress...</h3>
                                <div className="flex items-center justify-center gap-2 mt-4">
                                    <p className="text-xs text-[#8f8478] uppercase tracking-[0.4em] font-black">正在调制你的梦想听力...</p>
                                    <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.5, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-pink-400" />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <audio ref={previewAudioRef} hidden />
        </main>
    );
}
