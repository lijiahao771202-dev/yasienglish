"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArticleDisplay } from "@/components/reading/ArticleDisplay";
import { AudioPlayer } from "@/components/shadowing/AudioPlayer";
import { WritingEditor } from "@/components/writing/WritingEditor";
import { RecommendedArticles } from "@/components/reading/RecommendedArticles";
import { ReadingQuizPanel, QuizQuestion, type QuizSubmitPayload } from "@/components/reading/ReadingQuizPanel";
import { PenTool, ArrowLeft, House, Palette, Edit3, Flashlight, Eye, ClipboardCheck, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import axios from "axios";
import { useUserStore } from "@/lib/store";
import { resolveDailyArticleCandidate } from "@/lib/dailyArticle";
import { LiquidGlassPanel } from "@/components/ui/LiquidGlassPanel";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { applyBackgroundThemeToDocument, BACKGROUND_CHANGED_EVENT, getBackgroundThemeSpec, getSavedBackgroundTheme } from "@/lib/background-preferences";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ReadingMarkType } from "@/lib/db";
import {
    buildDailyLoginDedupeKey,
    buildQuizCompleteDedupeKey,
    buildReadCompleteDedupeKey,
    type ReadingEconomyAction,
} from "@/lib/reading-economy";
import { applyServerProfilePatchToLocal } from "@/lib/user-repository";
import { ReadingCoinIsland } from "@/components/reading/ReadingCoinIsland";
import {
    READING_COIN_FX_EVENT,
    createReadingCoinFxEvent,
    type ReadingCoinFxEvent,
} from "@/lib/reading-coin-fx";

interface ArticleData {
    title: string;
    content: string;
    byline?: string;
    textContent?: string;
    blocks?: ArticleBlock[];
    url?: string; // Track current URL for sidebar highlighting
    siteName?: string; // For TED video sync
    videoUrl?: string; // TED video URL
    image?: string | null;
    difficulty?: 'cet4' | 'cet6' | 'ielts';
    isAIGenerated?: boolean;
    isCatMode?: boolean;
    catSessionId?: string;
    catBand?: number;
    catScoreSnapshot?: number;
    catQuizBlueprint?: {
        score?: number;
        questionCount?: number;
        ratioBandLabel?: string;
        distribution?: Record<string, number>;
        allowedTypes?: string[];
    };
    catThetaSnapshot?: number;
    catSeSnapshot?: number;
    catSessionBlueprint?: {
        minItems?: number;
        maxItems?: number;
        targetSe?: number;
        stopRule?: string;
        challengeRatioTarget?: [number, number];
        passages?: Array<{
            passageIndex: number;
            title: string;
            content: string;
            targetScore: number;
            qualityTier: "ok" | "low_confidence";
        }>;
        items?: QuizQuestion[];
    };
    quizCompleted?: boolean;
    quizCorrect?: number;
    quizTotal?: number;
    quizScorePercent?: number;
}

interface ArticleBlock {
    type: 'paragraph' | 'header' | 'list' | 'image' | 'blockquote';
    id?: string;
    content?: string;
    tag?: string;
    items?: string[];
    src?: string;
    alt?: string;
    startTime?: number;
    endTime?: number;
}

interface QuizLocateRequest {
    requestId: number;
    questionNumber: number;
    paragraphNumber: number;
    evidence?: string;
}

interface QuizPanelDragState {
    startPointerX: number;
    startPointerY: number;
    originOffsetX: number;
    originOffsetY: number;
    startRectLeft: number;
    startRectTop: number;
    startRectWidth: number;
    startRectHeight: number;
}

interface CatSettlementPayload {
    scoreBefore: number;
    scoreAfter: number;
    delta: number;
    rankBefore: {
        id: string;
        name: string;
        primaryLabel: string;
        secondaryLabel: string;
        index: number;
    };
    rankAfter: {
        id: string;
        name: string;
        primaryLabel: string;
        secondaryLabel: string;
        index: number;
    };
    isRankUp: boolean;
    isRankDown: boolean;
    stopReason?: string | null;
    itemCount?: number | null;
    minItems?: number | null;
    maxItems?: number | null;
}

const buildReadingArticleKey = (article: Pick<ArticleData, "title" | "url">) => {
    const normalizedUrl = typeof article.url === "string" ? article.url.trim() : "";
    if (normalizedUrl) return normalizedUrl;
    return `title:${(article.title || "untitled").trim().toLowerCase()}`;
};

const LEGACY_HIGHLIGHT_HUES: Record<string, number> = {
    mint: 158,
    gold: 43,
    lavender: 270,
    peach: 24,
    sky: 202,
    rose: 346,
};

const MACARON_HUES = [
    10, 24, 38, 52, 66, 80, 94, 108, 122, 136, 150, 164,
    178, 192, 206, 220, 234, 248, 262, 276, 290, 304, 318, 332, 346,
];

const parseHueFromColor = (color: string | undefined): number | null => {
    if (!color) return null;
    if (LEGACY_HIGHLIGHT_HUES[color] !== undefined) {
        return LEGACY_HIGHLIGHT_HUES[color];
    }
    const matched = color.match(/hsl\(\s*(\d+)/i);
    if (!matched) return null;
    const parsed = Number(matched[1]);
    if (!Number.isFinite(parsed)) return null;
    return ((Math.round(parsed) % 360) + 360) % 360;
};

const buildUniqueHighlightColor = (existingColors: string[]) => {
    const usedHues = new Set<number>();
    for (const color of existingColors) {
        const hue = parseHueFromColor(color);
        if (hue !== null) usedHues.add(hue);
    }

    for (const hue of MACARON_HUES) {
        if (!usedHues.has(hue)) {
            return `hsl(${hue} 82% 86%)`;
        }
    }

    const baseStep = 137.508; // keep generating unique pastel tones after palette is consumed
    for (let index = 0; index < 360; index += 1) {
        const hue = Math.round((index * baseStep) % 360);
        if (!usedHues.has(hue)) {
            return `hsl(${hue} 80% 86%)`;
        }
    }

    const fallbackHue = Math.round(Math.random() * 359);
    return `hsl(${fallbackHue} 80% 86%)`;
};

import { ReadingSettingsProvider, useReadingSettings, READING_THEMES } from "@/contexts/ReadingSettingsContext";
import { AppearanceMenu } from "@/components/reading/AppearanceMenu";

function ReadingPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionUser = useAuthSessionUser();
    const profile = useLiveQuery(() => db.user_profile.orderBy("id").first(), []);
    const [isLoading, setIsLoading] = useState(false);
    const [article, setArticle] = useState<ArticleData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [readingCoinFxQueue, setReadingCoinFxQueue] = useState<ReadingCoinFxEvent[]>([]);
    const [activeReadingCoinFx, setActiveReadingCoinFx] = useState<ReadingCoinFxEvent | null>(null);
    const [catNotice, setCatNotice] = useState<string | null>(null);
    const [catSettlement, setCatSettlement] = useState<CatSettlementPayload | null>(null);
    const [isWritingMode, setIsWritingMode] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isQuizMode, setIsQuizMode] = useState(false);
    const [routeExitTarget, setRouteExitTarget] = useState<"home" | "battle" | null>(null);
    const [quizLocateRequest, setQuizLocateRequest] = useState<QuizLocateRequest | null>(null);
    const [articleStartedAt, setArticleStartedAt] = useState<number | null>(null);
    const [quizCache, setQuizCache] = useState<Record<string, QuizQuestion[]>>({});
    const [quizCacheHydrated, setQuizCacheHydrated] = useState<Record<string, boolean>>({});
    const [isWideViewport, setIsWideViewport] = useState(false);
    const [isQuizPanelDragging, setIsQuizPanelDragging] = useState(false);
    const [quizPanelOffset, setQuizPanelOffset] = useState({ x: 0, y: 0 });
    const [quizPanelHeight, setQuizPanelHeight] = useState<number | null>(null);
    const [, forceBackgroundRefresh] = useState(0);
    const { loadUserData, markArticleAsRead } = useUserStore();
    const activeArticleKey = article ? buildReadingArticleKey(article) : null;
    const readingNotes = useLiveQuery(async () => {
        if (!activeArticleKey) return [];
        const rows = await db.reading_notes.where("article_key").equals(activeArticleKey).sortBy("updated_at");
        return rows;
    }, [activeArticleKey]) ?? [];

    // Context Settings
    const { theme, fontClass, isFocusMode, toggleFocusMode, isBionicMode, toggleBionicMode } = useReadingSettings();
    const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
    const [isDockVisible, setIsDockVisible] = useState(true);
    const [isDockHovered, setIsDockHovered] = useState(false);
    const readingColumnRef = useRef<HTMLDivElement | null>(null);
    const quizPanelWrapperRef = useRef<HTMLDivElement | null>(null);
    const quizPanelGlassRef = useRef<HTMLDivElement | null>(null);
    const quizPanelDragStateRef = useRef<QuizPanelDragState | null>(null);
    const wasSplitLayoutRef = useRef(false);
    const scrollBeforeSplitRef = useRef(0);
    const dockHideTimerRef = useRef<number | null>(null);
    const catSettlementTimerRef = useRef<number | null>(null);
    const quizPrefetchRef = useRef<Record<string, boolean>>({});
    const resumedArticleRef = useRef<string | null>(null);

    // Scroll Progress
    const [scrollProgress, setScrollProgress] = useState(0);
    const routeFrom = searchParams.get("from");
    const resumeArticleUrl = searchParams.get("url");
    const hasRouteEntry = routeFrom === "battle" || routeFrom === "home";
    const backgroundTheme = getSavedBackgroundTheme(sessionUser?.id);
    const backgroundSpec = getBackgroundThemeSpec(backgroundTheme);
    const readingThemeFilm: Record<string, string> = {
        warm: "bg-[radial-gradient(circle_at_20%_18%,rgba(254,215,170,0.42),transparent_56%),radial-gradient(circle_at_85%_22%,rgba(251,146,60,0.22),transparent_44%),linear-gradient(180deg,rgba(255,248,240,0.45),rgba(255,243,233,0.28))]",
        sunlight: "bg-[radial-gradient(circle_at_50%_0%,rgba(254,240,138,0.3),transparent_55%),linear-gradient(180deg,rgba(255,251,219,0.42),rgba(255,247,196,0.3))]",
        vintage: "bg-[linear-gradient(180deg,rgba(235,229,217,0.45),rgba(226,217,198,0.38))]",
        green: "bg-[radial-gradient(circle_at_22%_18%,rgba(167,243,208,0.32),transparent_54%),linear-gradient(180deg,rgba(240,253,250,0.42),rgba(220,252,231,0.28))]",
        cool: "bg-[radial-gradient(circle_at_85%_14%,rgba(147,197,253,0.28),transparent_45%),linear-gradient(180deg,rgba(241,245,249,0.42),rgba(219,234,254,0.28))]",
        mono: "bg-[linear-gradient(180deg,rgba(250,250,249,0.45),rgba(245,245,244,0.3))]",
        dark: "bg-[linear-gradient(180deg,rgba(2,6,23,0.6),rgba(15,23,42,0.46))]",
        navy: "bg-[linear-gradient(180deg,rgba(23,37,84,0.56),rgba(30,58,138,0.38))]",
        coal: "bg-[linear-gradient(180deg,rgba(28,25,23,0.56),rgba(41,37,36,0.4))]",
    };
    const activeReadingFilm = article ? readingThemeFilm[theme] : undefined;
    const shouldUseGlobalBackgroundLayers = !article || theme === "welcome";
    const catSettlementFilm = shouldUseGlobalBackgroundLayers
        ? backgroundSpec.transitionFilm
        : (activeReadingFilm ?? "bg-[linear-gradient(180deg,rgba(241,245,249,0.55),rgba(203,213,225,0.48))]");
    const pageIntroEase = [0.22, 1, 0.36, 1] as const;
    const formatCatStopReason = useCallback((payload: {
        stopReason?: string | null;
        itemCount?: number | null;
        minItems?: number | null;
        maxItems?: number | null;
    }) => {
        const itemCount = Number(payload.itemCount ?? 0);
        const minItems = Number(payload.minItems ?? 0);
        const maxItems = Number(payload.maxItems ?? 0);
        if (payload.stopReason === "target_se_reached") {
            return itemCount > 0 ? `第 ${itemCount} 题达到精度阈值，自动收卷` : "达到精度阈值，自动收卷";
        }
        if (payload.stopReason === "max_items_reached") {
            return maxItems > 0 ? `达到上限 ${maxItems} 题，自动收卷` : "达到题量上限，自动收卷";
        }
        if (payload.stopReason === "insufficient_items") {
            return minItems > 0 ? `未达最少题量（至少 ${minItems} 题）` : "题量不足，按已提交结算";
        }
        return "本局已完成结算";
    }, []);
    const pushReadingCoinFx = useCallback((payload: {
        delta?: number;
        action?: ReadingEconomyAction | null;
        applied?: boolean;
    } | null | undefined) => {
        if (!payload) return;
        if (!payload.action) return;
        if (payload.applied === false) return;
        const event = createReadingCoinFxEvent({
            delta: Number(payload.delta ?? 0),
            action: payload.action,
        });
        if (!event) return;
        setReadingCoinFxQueue((prev) => [...prev, event]);
    }, []);
    const navEntryInitial = hasRouteEntry
        ? { opacity: 0, y: 16, scale: 0.992, filter: "blur(8px)" }
        : { opacity: 0, y: 10 };

    const clearDockHideTimer = useCallback(() => {
        if (dockHideTimerRef.current) {
            window.clearTimeout(dockHideTimerRef.current);
            dockHideTimerRef.current = null;
        }
    }, []);

    const clearCatSettlementTimer = useCallback(() => {
        if (catSettlementTimerRef.current) {
            window.clearTimeout(catSettlementTimerRef.current);
            catSettlementTimerRef.current = null;
        }
    }, []);

    const scheduleDockHide = useCallback((delay = 1100) => {
        clearDockHideTimer();
        dockHideTimerRef.current = window.setTimeout(() => {
            setIsDockVisible(false);
        }, delay);
    }, [clearDockHideTimer]);

    const handleRouteExit = (target: "home" | "battle") => {
        if (routeExitTarget) return;
        setRouteExitTarget(target);
        window.setTimeout(() => {
            if (target === "home") {
                router.push("/?from=read");
                return;
            }
            router.push("/battle?from=read");
        }, 560);
    };

    useEffect(() => {
        applyBackgroundThemeToDocument(backgroundTheme);
    }, [backgroundTheme]);

    useEffect(() => {
        const onBackgroundChange = (event: Event) => {
            const detail = (event as CustomEvent<{ themeId?: string }>).detail;
            if (typeof detail?.themeId === "string") {
                forceBackgroundRefresh((value) => value + 1);
                return;
            }
            forceBackgroundRefresh((value) => value + 1);
        };
        window.addEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
        return () => window.removeEventListener(BACKGROUND_CHANGED_EVENT, onBackgroundChange);
    }, [sessionUser?.id]);

    useEffect(() => {
        const handleScroll = () => {
            const totalScroll = document.documentElement.scrollTop;
            const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const scroll = `${totalScroll / windowHeight}`;
            setScrollProgress(Number(scroll));
        }
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const applyReadingEconomy = useCallback(async (params: {
        action: ReadingEconomyAction;
        dedupeKey?: string;
        articleUrl?: string;
        delta?: number;
        meta?: Record<string, unknown>;
    }) => {
        const response = await fetch("/api/reading/economy/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: params.action,
                dedupeKey: params.dedupeKey,
                articleUrl: params.articleUrl,
                delta: params.delta,
                meta: params.meta,
            }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            return null;
        }
        const balance = payload?.result?.balance;
        if (typeof balance === "number") {
            await applyServerProfilePatchToLocal({ reading_coins: balance });
        }
        return payload?.result ?? null;
    }, []);

    const handleCreateReadingNote = useCallback(async (payload: {
        paragraphOrder: number;
        paragraphBlockIndex: number;
        selectedText: string;
        noteText?: string;
        markType: ReadingMarkType;
        startOffset: number;
        endOffset: number;
    }) => {
        if (!article) return;
        const articleKey = buildReadingArticleKey(article);
        const now = Date.now();
        const selectedText = payload.selectedText.trim();
        if (!selectedText) return;

        const existing = await db.reading_notes
            .where("[article_key+paragraph_order]")
            .equals([articleKey, payload.paragraphOrder])
            .filter((row) =>
                row.mark_type === payload.markType
                && row.start_offset === payload.startOffset
                && row.end_offset === payload.endOffset
            )
            .first();

        let nextHighlightColor: string | undefined;
        if (payload.markType === "highlight") {
            const allNotes = await db.reading_notes.where("article_key").equals(articleKey).toArray();
            const existingColors = allNotes
                .filter((row) => row.mark_type === "highlight" && typeof row.mark_color === "string")
                .map((row) => row.mark_color as string);
            nextHighlightColor = buildUniqueHighlightColor(existingColors);
        }

        if (existing?.id) {
            await db.reading_notes.update(existing.id, {
                selected_text: selectedText,
                note_text: payload.noteText?.trim() || existing.note_text || "",
                mark_color: payload.markType === "highlight"
                    ? (existing.mark_color || nextHighlightColor)
                    : existing.mark_color,
                updated_at: now,
            });
        } else {
            await db.reading_notes.add({
                article_key: articleKey,
                article_url: article.url || "",
                article_title: article.title || "",
                paragraph_order: payload.paragraphOrder,
                paragraph_block_index: payload.paragraphBlockIndex,
                selected_text: selectedText,
                note_text: payload.noteText?.trim() || "",
                mark_type: payload.markType,
                mark_color: payload.markType === "highlight" ? nextHighlightColor : undefined,
                start_offset: payload.startOffset,
                end_offset: payload.endOffset,
                created_at: now,
                updated_at: now,
            });
        }

    }, [article]);

    const handleDeleteReadingMarks = useCallback(async (payload: {
        paragraphOrder: number;
        paragraphBlockIndex: number;
        markType: ReadingMarkType;
        startOffset: number;
        endOffset: number;
    }) => {
        if (!article) return;
        const articleKey = buildReadingArticleKey(article);
        const startOffset = Math.max(0, payload.startOffset);
        const endOffset = Math.max(startOffset, payload.endOffset);
        if (endOffset <= startOffset) return;

        const rows = await db.reading_notes
            .where("[article_key+paragraph_order]")
            .equals([articleKey, payload.paragraphOrder])
            .filter((row) =>
                row.mark_type === payload.markType
                && row.start_offset < endOffset
                && row.end_offset > startOffset
            )
            .toArray();

        const ids = rows
            .map((row) => row.id)
            .filter((id): id is number => typeof id === "number");
        if (ids.length === 0) return;
        await db.reading_notes.bulkDelete(ids);
    }, [article]);

    useEffect(() => {
        if (!article) {
            clearDockHideTimer();
            setIsDockVisible(true);
            return;
        }

        setIsDockVisible(true);
        if (!isDockHovered) {
            scheduleDockHide(1300);
        }

        return () => {
            clearDockHideTimer();
        };
    }, [article, clearDockHideTimer, isDockHovered, scheduleDockHide]);

    useEffect(() => {
        const handleTabToggleEditMode = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            if (!article) return;
            if (isWritingMode || isQuizMode) return;

            const target = event.target as HTMLElement | null;
            const tagName = target?.tagName?.toLowerCase();
            const isTypingContext = Boolean(
                target?.isContentEditable
                || tagName === "input"
                || tagName === "textarea"
                || tagName === "select"
                || tagName === "button"
            );
            if (isTypingContext) return;

            event.preventDefault();
            setIsEditMode((prev) => !prev);
        };

        window.addEventListener("keydown", handleTabToggleEditMode);
        return () => window.removeEventListener("keydown", handleTabToggleEditMode);
    }, [article, isWritingMode, isQuizMode]);

    useEffect(() => {
        return () => {
            clearCatSettlementTimer();
        };
    }, [clearCatSettlementTimer]);

    useEffect(() => {
        if (activeReadingCoinFx || readingCoinFxQueue.length === 0) return;
        setActiveReadingCoinFx(readingCoinFxQueue[0]);
        setReadingCoinFxQueue((prev) => prev.slice(1));
    }, [activeReadingCoinFx, readingCoinFxQueue]);

    useEffect(() => {
        if (!activeReadingCoinFx) return;
        const timeoutId = window.setTimeout(() => {
            setActiveReadingCoinFx(null);
        }, 2350);
        return () => window.clearTimeout(timeoutId);
    }, [activeReadingCoinFx]);

    useEffect(() => {
        const onReadingCoinFx = (event: Event) => {
            const detail = (event as CustomEvent<ReadingCoinFxEvent | undefined>).detail;
            if (!detail) return;
            setReadingCoinFxQueue((prev) => [...prev, detail]);
        };
        window.addEventListener(READING_COIN_FX_EVENT, onReadingCoinFx as EventListener);
        return () => {
            window.removeEventListener(READING_COIN_FX_EVENT, onReadingCoinFx as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!article) return;

        const handleMouseMove = (event: MouseEvent) => {
            if (event.clientY <= 92) {
                if (!isDockVisible) {
                    setIsDockVisible(true);
                }
                if (!isDockHovered) {
                    scheduleDockHide(1000);
                }
            }
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [article, isDockHovered, isDockVisible, scheduleDockHide]);

    // Load user data (history, vocab, read status) from DB on mount
    useEffect(() => {
        loadUserData();

        const checkDailyArticle = async () => {
            const { db } = await import("@/lib/db");
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const lastFetchDate = localStorage.getItem('last_daily_fetch_date');

            // Warm the local cache without hijacking the picker UI.
            if (lastFetchDate !== today) {
                try {
                    // Fetch feed list
                    const feedRes = await axios.get('/api/feed?category=psychology');
                    if (feedRes.data && feedRes.data.length > 0) {
                        const resolved = await resolveDailyArticleCandidate({
                            items: feedRes.data,
                            getExistingArticle: async (candidateUrl) => {
                                return db.articles.get({ url: candidateUrl });
                            },
                            parseArticle: async (candidateUrl) => {
                                const parseRes = await axios.post("/api/parse", { url: candidateUrl });
                                return parseRes.data;
                            },
                            onParseFailure: () => undefined,
                        });

                        if (resolved && resolved.source === "parsed") {
                            const articleData = { ...resolved.articleData, url: resolved.url };
                            await db.articles.put({
                                url: resolved.url,
                                title: articleData.title,
                                content: articleData.content,
                                textContent: articleData.textContent,
                                byline: articleData.byline,
                                siteName: articleData.siteName,
                                blocks: articleData.blocks,
                                image: articleData.image,
                                timestamp: Date.now()
                            });
                        }
                    }
                    localStorage.setItem('last_daily_fetch_date', today);
                } catch {
                    // Background warming should fail silently and keep the picker usable.
                }
            }
        };

        checkDailyArticle();
    }, [loadUserData]);

    useEffect(() => {
        if (!sessionUser?.id) return;
        const dateKey = new Date().toISOString().slice(0, 10);
        const dedupeKey = buildDailyLoginDedupeKey({ userId: sessionUser.id, dateKey });
        void applyReadingEconomy({
            action: "daily_login",
            dedupeKey,
            meta: { from: "read_page_enter", dateKey },
        }).then((result) => {
            pushReadingCoinFx(result);
        });
    }, [applyReadingEconomy, pushReadingCoinFx, sessionUser?.id]);

    const canShowQuizPanel = Boolean(isQuizMode && article?.isAIGenerated && article?.difficulty);
    const showStandardSplitQuiz = canShowQuizPanel;
    const readingViewportKey = `${article?.url || article?.title || "reading"}`;
    const quizCacheKey = article ? `${article.url || article.title}::${article.difficulty || "unknown"}` : "";
    const quizDbKey = quizCacheKey ? `reading-quiz::${quizCacheKey}` : "";
    const parseParagraphNumber = (value: string): number | null => {
        const matched = value.match(/\d+/);
        if (!matched) return null;
        const num = Number(matched[0]);
        return Number.isFinite(num) && num > 0 ? num : null;
    };

    const shouldEnableQuizPanelDrag = showStandardSplitQuiz && isWideViewport;

    const handleQuizPanelDragStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!shouldEnableQuizPanelDrag) return;
        const panelWrapper = quizPanelWrapperRef.current;
        if (!panelWrapper) return;

        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);

        const rect = panelWrapper.getBoundingClientRect();
        quizPanelDragStateRef.current = {
            startPointerX: event.clientX,
            startPointerY: event.clientY,
            originOffsetX: quizPanelOffset.x,
            originOffsetY: quizPanelOffset.y,
            startRectLeft: rect.left,
            startRectTop: rect.top,
            startRectWidth: rect.width,
            startRectHeight: rect.height,
        };
        setIsQuizPanelDragging(true);
    }, [quizPanelOffset.x, quizPanelOffset.y, shouldEnableQuizPanelDrag]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const updateViewportFlag = () => {
            setIsWideViewport(window.innerWidth >= 1280);
        };
        updateViewportFlag();
        window.addEventListener("resize", updateViewportFlag);
        return () => window.removeEventListener("resize", updateViewportFlag);
    }, []);

    useEffect(() => {
        if (!isQuizPanelDragging) return;
        const handlePointerMove = (event: PointerEvent) => {
            const dragState = quizPanelDragStateRef.current;
            if (!dragState) return;

            const rawDeltaX = event.clientX - dragState.startPointerX;
            const rawDeltaY = event.clientY - dragState.startPointerY;

            const minLeft = 10;
            const maxLeft = window.innerWidth - dragState.startRectWidth - 10;
            const minTop = 88;
            const maxTop = window.innerHeight - Math.min(180, dragState.startRectHeight * 0.45);

            const candidateLeft = dragState.startRectLeft + rawDeltaX;
            const candidateTop = dragState.startRectTop + rawDeltaY;
            const clampedLeft = Math.min(maxLeft, Math.max(minLeft, candidateLeft));
            const clampedTop = Math.min(maxTop, Math.max(minTop, candidateTop));

            setQuizPanelOffset({
                x: dragState.originOffsetX + (clampedLeft - dragState.startRectLeft),
                y: dragState.originOffsetY + (clampedTop - dragState.startRectTop),
            });
        };

        const handlePointerUp = () => {
            quizPanelDragStateRef.current = null;
            setIsQuizPanelDragging(false);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", handlePointerUp);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", handlePointerUp);
        };
    }, [isQuizPanelDragging]);



    useEffect(() => {
        if (!showStandardSplitQuiz) {
            setQuizPanelOffset({ x: 0, y: 0 });
            setIsQuizPanelDragging(false);
            quizPanelDragStateRef.current = null;
        }
    }, [showStandardSplitQuiz]);

    useEffect(() => {
        if (isQuizMode && (!article?.isAIGenerated || !article?.difficulty)) {
            setIsQuizMode(false);
        }
    }, [isQuizMode, article?.isAIGenerated, article?.difficulty]);

    useLayoutEffect(() => {
        if (!article) {
            wasSplitLayoutRef.current = false;
            return;
        }
        const wasSplit = wasSplitLayoutRef.current;

        if (showStandardSplitQuiz && !wasSplit) {
            const currentWindowScroll = window.scrollY || document.documentElement.scrollTop || 0;
            scrollBeforeSplitRef.current = currentWindowScroll;
            window.scrollTo({ top: 0, behavior: "auto" });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;
            const node = readingColumnRef.current;
            if (node) {
                node.scrollTo({ top: 0, left: 0, behavior: "auto" });
            }
        } else if (!showStandardSplitQuiz && wasSplit) {
            const restoreTop = Math.max(0, scrollBeforeSplitRef.current);
            window.requestAnimationFrame(() => {
                window.scrollTo({ top: restoreTop, behavior: "auto" });
            });
        }

        wasSplitLayoutRef.current = showStandardSplitQuiz;
    }, [article, showStandardSplitQuiz]);

    useEffect(() => {
        if (!article) {
            setQuizLocateRequest(null);
        }
    }, [article]);

    useEffect(() => {
        if (!quizDbKey || quizCacheHydrated[quizDbKey]) return;
        let cancelled = false;

        const hydrateQuizCache = async () => {
            try {
                const { db } = await import("@/lib/db");
                const cached = await db.ai_cache.where("[key+type]").equals([quizDbKey, "quiz"]).first();
                const cachedQuestions = cached?.data?.questions;
                if (!cancelled && Array.isArray(cachedQuestions) && cachedQuestions.length > 0) {
                    setQuizCache((prev) => ({ ...prev, [quizCacheKey]: cachedQuestions as QuizQuestion[] }));
                }
            } catch (error) {
                console.error("Failed to hydrate quiz cache:", error);
            } finally {
                if (!cancelled) {
                    setQuizCacheHydrated((prev) => ({ ...prev, [quizDbKey]: true }));
                }
            }
        };

        hydrateQuizCache();
        return () => {
            cancelled = true;
        };
    }, [quizDbKey, quizCacheKey, quizCacheHydrated]);

    useEffect(() => {
        if (!article?.isAIGenerated || !article?.difficulty) return;
        if (!quizCacheKey || !quizDbKey) return;
        if (article.isCatMode && Array.isArray(article.catSessionBlueprint?.items) && article.catSessionBlueprint.items.length > 0) {
            return;
        }
        if (isQuizMode) return;
        if (Array.isArray(quizCache[quizCacheKey]) && quizCache[quizCacheKey].length > 0) return;
        if (quizPrefetchRef.current[quizCacheKey]) return;

        quizPrefetchRef.current[quizCacheKey] = true;
        let cancelled = false;

        void (async () => {
            try {
                const response = await fetch("/api/ai/generate-quiz", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        articleContent: article.textContent || article.content,
                        difficulty: article.difficulty,
                        title: article.title,
                        quizMode: article.isCatMode ? "cat" : "standard",
                        catBand: article.catBand,
                        catScore: article.catScoreSnapshot,
                        catQuizBlueprint: article.catQuizBlueprint,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error || "Quiz prefetch failed");
                }

                const prefetchedQuestions = Array.isArray(payload?.questions)
                    ? payload.questions as QuizQuestion[]
                    : [];
                if (cancelled || prefetchedQuestions.length === 0) return;

                setQuizCache((prev) => ({ ...prev, [quizCacheKey]: prefetchedQuestions }));
                const { db } = await import("@/lib/db");
                const existing = await db.ai_cache.where("[key+type]").equals([quizDbKey, "quiz"]).first();
                await db.ai_cache.put({
                    id: existing?.id,
                    key: quizDbKey,
                    type: "quiz",
                    data: { questions: prefetchedQuestions },
                    timestamp: Date.now(),
                });
            } catch (prefetchError) {
                console.error("Quiz prefetch failed:", prefetchError);
                quizPrefetchRef.current[quizCacheKey] = false;
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        article,
        isQuizMode,
        quizCache,
        quizCacheKey,
        quizDbKey,
    ]);

    const handleUrlSubmit = useCallback(async (url: string) => {
        setIsLoading(true);
        setError(null);
        try {
            // Check cache first
            const { db } = await import("@/lib/db");
            const cached = await db.articles.get({ url });

            if (cached) {
                setArticle({
                    title: cached.title,
                    content: cached.content,
                    textContent: cached.textContent,
                    byline: cached.byline,
                    siteName: cached.siteName,
                    blocks: cached.blocks,
                    url: cached.url,
                    difficulty: cached.difficulty,
                    isAIGenerated: cached.isAIGenerated,
                    quizCompleted: cached.quizCompleted,
                    quizCorrect: cached.quizCorrect,
                    quizTotal: cached.quizTotal,
                    quizScorePercent: cached.quizScorePercent,
                });

                // Update timestamp
                db.articles.update([cached.url, cached.title, cached.timestamp], { timestamp: Date.now() });
                markArticleAsRead(cached.url);
                setArticleStartedAt(Date.now());
                if (sessionUser?.id) {
                    const dedupeKey = buildReadCompleteDedupeKey({ userId: sessionUser.id, articleUrl: cached.url });
                    void applyReadingEconomy({
                        action: "read_complete",
                        dedupeKey,
                        articleUrl: cached.url,
                        meta: { source: "read_open_cached" },
                    }).then((result) => pushReadingCoinFx(result));
                }
                setIsLoading(false);
                return;
            }

            const response = await axios.post("/api/parse", { url });
            const finalUrl = response.data.url || url;

            const articleData = { ...response.data, url: finalUrl };
            setArticle(articleData);
            markArticleAsRead(finalUrl);
            setArticleStartedAt(Date.now());
            if (sessionUser?.id) {
                const dedupeKey = buildReadCompleteDedupeKey({ userId: sessionUser.id, articleUrl: finalUrl });
                void applyReadingEconomy({
                    action: "read_complete",
                    dedupeKey,
                    articleUrl: finalUrl,
                    meta: { source: "read_open_parse" },
                }).then((result) => pushReadingCoinFx(result));
            }

            // Cache it
            await db.articles.put({
                url: finalUrl,
                title: articleData.title,
                content: articleData.content,
                textContent: articleData.textContent,
                byline: articleData.byline,
                siteName: articleData.siteName,
                blocks: articleData.blocks,
                timestamp: Date.now()
            });

        } catch (err) {
            console.error(err);
            setError("Failed to load article. Please check the URL and try again.");
        } finally {
            setIsLoading(false);
        }
    }, [applyReadingEconomy, markArticleAsRead, pushReadingCoinFx, sessionUser?.id]);

    useEffect(() => {
        const candidate = (resumeArticleUrl || "").trim();
        if (!candidate) return;
        if (resumedArticleRef.current === candidate) return;
        resumedArticleRef.current = candidate;
        if (article?.url?.trim() === candidate) return;
        void handleUrlSubmit(candidate);
    }, [article?.url, handleUrlSubmit, resumeArticleUrl]);

    const renderQuizPanel = () => {
        if (!article?.difficulty) return null;
        return (
            <ReadingQuizPanel
                articleContent={article.textContent || article.content}
                articleTitle={article.title}
                difficulty={article.difficulty as 'cet4' | 'cet6' | 'ielts'}
                quizMode={article.isCatMode ? "cat" : "standard"}
                catBand={article.catBand}
                catScore={article.catScoreSnapshot}
                catTheta={article.catThetaSnapshot}
                catSe={article.catSeSnapshot}
                catTargetSe={article.catSessionBlueprint?.targetSe}
                catMinItems={article.catSessionBlueprint?.minItems}
                catMaxItems={article.catSessionBlueprint?.maxItems}
                catQuizBlueprint={article.catQuizBlueprint}
                floatingCompact={false}
                onClose={() => setIsQuizMode(false)}
                cachedQuestions={
                    article.isCatMode && Array.isArray(article.catSessionBlueprint?.items) && article.catSessionBlueprint.items.length > 0
                        ? article.catSessionBlueprint.items
                        : (quizCacheKey ? quizCache[quizCacheKey] : undefined)
                }
                onQuestionsReady={(questions) => {
                    if (!quizCacheKey || !quizDbKey) return;
                    setQuizCache((prev) => ({ ...prev, [quizCacheKey]: questions }));
                    void (async () => {
                        try {
                            const { db } = await import("@/lib/db");
                            const existing = await db.ai_cache.where("[key+type]").equals([quizDbKey, "quiz"]).first();
                            await db.ai_cache.put({
                                id: existing?.id,
                                key: quizDbKey,
                                type: "quiz",
                                data: { questions },
                                timestamp: Date.now(),
                            });
                        } catch (error) {
                            console.error("Failed to persist quiz cache:", error);
                        }
                    })();
                }}
                onSubmitScore={(submission: QuizSubmitPayload) => {
                    const { correct, total } = submission;
                    const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
                    const readingMs = articleStartedAt ? Math.max(30_000, Date.now() - articleStartedAt) : undefined;
                    setArticle((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            quizCompleted: true,
                            quizCorrect: correct,
                            quizTotal: total,
                            quizScorePercent: scorePercent,
                        };
                    });

                    if (article?.url) {
                        void (async () => {
                            try {
                                const { db } = await import("@/lib/db");
                                await db.articles.update(article.url, {
                                    quizCompleted: true,
                                    quizCorrect: correct,
                                    quizTotal: total,
                                    quizScorePercent: scorePercent,
                                    timestamp: Date.now(),
                                });
                            } catch (error) {
                                console.error("Failed to persist quiz score:", error);
                            }
                        })();
                    }

                    if (sessionUser?.id && article?.url) {
                        const dedupeKey = buildQuizCompleteDedupeKey({ userId: sessionUser.id, articleUrl: article.url });
                        if (article.isCatMode && article.catSessionId) {
                            void (async () => {
                                try {
                                    const response = await fetch("/api/ai/cat/session/submit", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            sessionId: article.catSessionId,
                                            quizCorrect: correct,
                                            quizTotal: total,
                                            readingMs,
                                            responses: submission.responses,
                                            qualityTier: submission.qualityTier,
                                        }),
                                    });
                                    const payload = await response.json();
                                    if (!response.ok) {
                                        throw new Error(payload.error || "CAT submit failed");
                                    }
                                    await applyServerProfilePatchToLocal({
                                        cat_score: payload?.cat?.score,
                                        cat_level: payload?.cat?.level,
                                        cat_theta: payload?.cat?.theta,
                                        cat_se: payload?.cat?.se,
                                        cat_points: payload?.cat?.points,
                                        cat_current_band: payload?.cat?.currentBand,
                                        cat_updated_at: payload?.cat?.updatedAt ?? new Date().toISOString(),
                                        reading_coins: payload?.readingCoins?.balance,
                                    });
                                    if (payload?.readingCoins?.delta > 0) {
                                        pushReadingCoinFx({
                                            action: "quiz_complete",
                                            delta: payload.readingCoins.delta,
                                            applied: payload?.readingCoins?.applied !== false,
                                        });
                                    }
                                    if (payload?.session?.delta !== undefined) {
                                        const signedDelta = Number(payload.session.delta);
                                        const deltaText = signedDelta >= 0 ? `+${signedDelta}` : `${signedDelta}`;
                                        const policyUsed = payload?.session?.policyUsed;
                                        const stopHint = formatCatStopReason({
                                            stopReason: payload?.session?.stopReason,
                                            itemCount: payload?.session?.itemCount,
                                            minItems: policyUsed?.minItems,
                                            maxItems: policyUsed?.maxItems,
                                        });
                                        setCatNotice(`CAT 本局结算 ${deltaText} 分 · ${stopHint}`);
                                        window.setTimeout(() => setCatNotice(null), 4200);
                                    }
                                    if (payload?.animationPayload) {
                                        const policyUsed = payload?.session?.policyUsed;
                                        const animationPayload = {
                                            ...(payload.animationPayload as CatSettlementPayload),
                                            stopReason: payload?.session?.stopReason,
                                            itemCount: payload?.session?.itemCount,
                                            minItems: policyUsed?.minItems,
                                            maxItems: policyUsed?.maxItems,
                                        } as CatSettlementPayload;
                                        setCatSettlement(animationPayload);
                                        clearCatSettlementTimer();
                                        catSettlementTimerRef.current = window.setTimeout(() => {
                                            setCatSettlement(null);
                                            setIsQuizMode(false);
                                            setArticle(null);
                                            setArticleStartedAt(null);
                                        }, 3000);
                                    }
                                } catch (submitError) {
                                    console.error(submitError);
                                }
                            })();
                        } else {
                            void applyReadingEconomy({
                                action: "quiz_complete",
                                dedupeKey,
                                articleUrl: article.url,
                                delta: 5 + (scorePercent >= 80 ? 2 : 0),
                                meta: {
                                    scorePercent,
                                    correct,
                                    total,
                                    source: "read_quiz_standard",
                                },
                            }).then((result) => {
                                pushReadingCoinFx(result);
                            });
                        }
                    }
                }}
                onLocate={({ questionNumber, sourceParagraph, evidence }) => {
                    const paragraphNumber = parseParagraphNumber(sourceParagraph);
                    if (!paragraphNumber) return;
                    setQuizLocateRequest((prev) => {
                        const sameTarget = Boolean(
                            prev
                            && prev.questionNumber === questionNumber
                            && prev.paragraphNumber === paragraphNumber
                            && (prev.evidence || "") === (evidence || ""),
                        );
                        if (sameTarget) return null;
                        return {
                            requestId: Date.now(),
                            questionNumber,
                            paragraphNumber,
                            evidence,
                        };
                    });
                }}
                onClearLocate={() => setQuizLocateRequest(null)}
                activeLocateQuestionNumber={quizLocateRequest?.questionNumber ?? null}
                titleNode={renderQuizToggleButton(true)}
                dragHandleNode={
                    shouldEnableQuizPanelDrag ? (
                        <button
                            type="button"
                            onPointerDown={handleQuizPanelDragStart}
                            className={cn(
                                "flex h-7 w-12 items-center justify-center rounded-full bg-slate-400/10 text-slate-400 backdrop-blur-sm transition-colors",
                                isQuizPanelDragging ? "cursor-grabbing bg-slate-400/20 text-slate-600" : "cursor-grab hover:bg-slate-400/20 hover:text-slate-600",
                            )}
                            title="拖动答题框"
                            aria-label="拖动答题框"
                        >
                            <GripVertical className="h-4 w-4" />
                        </button>
                    ) : undefined
                }
            />
        );
    };

    const renderQuizToggleButton = (isEmbedded = false) => {
        if (!article?.isAIGenerated || !article?.difficulty) return null;
        return (
            <button
                onClick={(event) => {
                    event.currentTarget.blur();
                    if (!isQuizMode) {
                        const currentWindowScroll = window.scrollY || document.documentElement.scrollTop || 0;
                        scrollBeforeSplitRef.current = currentWindowScroll;
                        window.scrollTo({ top: 0, behavior: "auto" });
                        document.documentElement.scrollTop = 0;
                        document.body.scrollTop = 0;
                        const node = readingColumnRef.current;
                        if (node) {
                            node.scrollTo({ top: 0, left: 0, behavior: "auto" });
                        }
                    }
                    setQuizLocateRequest(null);
                    setIsQuizMode((prev) => !prev);
                }}
                aria-pressed={isQuizMode}
                className={cn(
                    "group flex items-center gap-2.5 rounded-full border text-sm font-bold backdrop-blur-xl transition-all duration-300",
                    isEmbedded
                        ? "border-emerald-200/50 bg-white/45 px-4 py-1.5 text-emerald-800 shadow-sm hover:-translate-y-0.5 hover:bg-white/60"
                        : "border-white/70 bg-white/78 px-5 py-2.5 text-slate-800 shadow-[0_20px_40px_-22px_rgba(15,23,42,0.65)] hover:-translate-y-0.5 hover:bg-white/92 hover:shadow-[0_28px_52px_-20px_rgba(15,23,42,0.75)]"
                )}
            >
                <ClipboardCheck className={cn("h-4 w-4 transition-transform group-hover:scale-110", isEmbedded ? "text-emerald-600" : "text-pink-500")} />
                <span>{isQuizMode ? "隐藏题目" : "开始答题"}</span>
                <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold",
                    article.difficulty === 'cet4' && "border-emerald-200 bg-emerald-50 text-emerald-700",
                    article.difficulty === 'cet6' && "border-blue-200 bg-blue-50 text-blue-700",
                    article.difficulty === 'ielts' && "border-violet-200 bg-violet-50 text-violet-700",
                    isEmbedded && article.difficulty === 'cet4' && "bg-transparent",
                    isEmbedded && article.difficulty === 'cet6' && "bg-transparent",
                    isEmbedded && article.difficulty === 'ielts' && "bg-transparent"
                )}>
                    {article.difficulty === 'cet4' ? '四级' : article.difficulty === 'cet6' ? '六级' : '雅思'}
                </span>
            </button>
        );
    };

    const quizPanelStyle = shouldEnableQuizPanelDrag
        ? { transform: `translate3d(${quizPanelOffset.x}px, ${quizPanelOffset.y}px, 0)` }
        : undefined;

    return (
        <main
            className={cn(
            "relative overflow-x-clip text-stone-800 transition-all duration-500 ease-in-out",
            showStandardSplitQuiz
                ? "min-h-screen px-6 pb-6 pt-24 md:px-12 md:pb-8 md:pt-28"
                : "min-h-screen p-6 md:p-12",
            article ? READING_THEMES.find(t => t.id === theme)?.class : undefined,
            fontClass // Apply Font Global
        )}
        >
            {shouldUseGlobalBackgroundLayers && (
                <>
                    <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.baseLayer}`} />
                    <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.glassLayer}`} />
                    <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.glowLayer}`} />
                    <div className={`pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[34%] ${backgroundSpec.bottomLayer}`} />
                    <div className={`pointer-events-none fixed inset-0 z-0 ${backgroundSpec.vignetteLayer}`} />
                </>
            )}
            {article && theme !== "welcome" && activeReadingFilm && (
                <motion.div
                    key={`reading-theme-${theme}`}
                    className={cn("pointer-events-none fixed inset-0 z-0", activeReadingFilm)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
            )}

            <div className="relative z-10">
            <AnimatePresence>
                {routeExitTarget && (
                    <motion.div
                        className="pointer-events-none fixed inset-0 z-[80]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            className={cn(
                                "absolute inset-0 backdrop-blur-[8px]",
                                shouldUseGlobalBackgroundLayers
                                    ? backgroundSpec.transitionFilm
                                    : (activeReadingFilm ?? "bg-[linear-gradient(180deg,rgba(241,245,249,0.5),rgba(203,213,225,0.42))]")
                            )}
                            initial={{ scale: 1.08, filter: "blur(22px)" }}
                            animate={{ scale: 1, filter: "blur(0px)" }}
                            transition={{ duration: 0.76, ease: [0.18, 1, 0.3, 1] }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {catSettlement && (
                    <motion.div
                        className="pointer-events-none fixed inset-0 z-[85]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            className={cn("absolute inset-0 backdrop-blur-[10px]", catSettlementFilm)}
                            initial={{ opacity: 0.6, scale: 1.05 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.02 }}
                            transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center px-4">
                            <motion.div
                                initial={{ opacity: 0, y: 28, scale: 0.96, filter: "blur(10px)" }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                exit={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(6px)" }}
                                transition={{ duration: 0.6, ease: [0.2, 1, 0.32, 1] }}
                                className="w-full max-w-2xl rounded-[30px] border border-white/65 bg-white/40 p-6 shadow-[0_40px_90px_-42px_rgba(15,23,42,0.9)] ring-1 ring-white/65 backdrop-blur-3xl md:p-7"
                            >
                                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">CAT Settlement</p>
                                <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                                    <div>
                                        <h3 className="font-newsreader text-[2.05rem] font-semibold leading-none text-slate-900 md:text-[2.35rem]">
                                            {catSettlement.isRankUp ? "升段成功" : catSettlement.isRankDown ? "段位回调" : "稳态结算"}
                                        </h3>
                                        <p className="mt-1 text-sm text-slate-600">
                                            {catSettlement.rankBefore.primaryLabel} → {catSettlement.rankAfter.primaryLabel}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-500">
                                            {formatCatStopReason(catSettlement)}
                                        </p>
                                    </div>
                                    <div className={cn(
                                        "rounded-full border px-4 py-1.5 text-base font-semibold",
                                        catSettlement.delta >= 0
                                            ? "border-emerald-200/80 bg-emerald-100/80 text-emerald-700"
                                            : "border-rose-200/80 bg-rose-100/85 text-rose-700"
                                    )}>
                                        {catSettlement.delta >= 0 ? `+${catSettlement.delta}` : catSettlement.delta} 分
                                    </div>
                                </div>

                                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                                    <div className="rounded-2xl border border-white/70 bg-white/58 px-4 py-3">
                                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Before</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-800">{catSettlement.rankBefore.name}</p>
                                        <p className="text-xs text-slate-500">{catSettlement.rankBefore.secondaryLabel}</p>
                                    </div>
                                    <div className="text-center text-sm font-semibold text-slate-500">→</div>
                                    <motion.div
                                        initial={{ scale: 0.94 }}
                                        animate={{ scale: catSettlement.isRankUp ? [1, 1.04, 1] : 1 }}
                                        transition={{ duration: 0.62, ease: [0.2, 1, 0.3, 1] }}
                                        className={cn(
                                            "rounded-2xl border px-4 py-3",
                                            catSettlement.isRankUp
                                                ? "border-violet-200/80 bg-violet-100/70 shadow-[0_20px_36px_-24px_rgba(124,58,237,0.55)]"
                                                : catSettlement.isRankDown
                                                    ? "border-amber-200/80 bg-amber-100/70"
                                                    : "border-white/70 bg-white/58"
                                        )}
                                    >
                                        <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">After</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">{catSettlement.rankAfter.name}</p>
                                        <p className="text-xs text-slate-600">{catSettlement.rankAfter.secondaryLabel}</p>
                                    </motion.div>
                                </div>

                                <div className="mt-5 rounded-2xl border border-white/70 bg-white/58 px-4 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Score</p>
                                    <div className="mt-1 flex items-end gap-2">
                                        <RollingNumber
                                            from={catSettlement.scoreBefore}
                                            to={catSettlement.scoreAfter}
                                            className="font-newsreader text-[2.1rem] font-semibold leading-none text-slate-900"
                                        />
                                        <span className="pb-1 text-xs font-semibold text-slate-500">CAT Score</span>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Navigation Dock */}
            <motion.nav
                className={cn(
                    "fixed top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-500",
                    article && !isDockVisible && "pointer-events-none"
                )}
                style={{ transformOrigin: "50% 0%" }}
                initial={navEntryInitial}
                animate={article
                    ? (isDockVisible
                        ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
                        : { opacity: 0, y: -38, scale: 0.96, filter: "blur(8px)" })
                    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={article
                    ? (isDockVisible
                        ? { type: "spring", stiffness: 320, damping: 32, mass: 0.72 }
                        : { duration: 0.34, ease: [0.4, 0, 1, 1] })
                    : { duration: hasRouteEntry ? 0.62 : 0.52, ease: pageIntroEase }}
                onMouseEnter={() => {
                    if (!article) return;
                    setIsDockVisible(true);
                    setIsDockHovered(true);
                    clearDockHideTimer();
                }}
                onMouseLeave={() => {
                    if (!article) return;
                    setIsDockHovered(false);
                    scheduleDockHide(700);
                }}
            >
                <div className="relative flex items-center gap-1 rounded-full border border-white/55 bg-white/42 px-2 py-1.5 shadow-[0_30px_56px_-38px_rgba(14,30,66,0.8)] ring-1 ring-white/65 backdrop-blur-2xl">
                    <div className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(115deg,rgba(255,255,255,0.56),rgba(255,255,255,0.18),rgba(255,255,255,0.4))]" />
                    <button
                        type="button"
                        onClick={() => handleRouteExit("home")}
                        className="group relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-white/65 hover:text-slate-900"
                        title="Back to Welcome"
                    >
                        <House className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
                    </button>

                    {/* Article List Back */}
                    {article && (
                        <button
                            onClick={() => {
                                setArticle(null);
                                setArticleStartedAt(null);
                                setIsWritingMode(false);
                                setIsEditMode(false);
                                setIsQuizMode(false);
                            }}
                            className="group relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-all hover:bg-white/65 hover:text-slate-900"
                            title="Back to Article Picker"
                        >
                            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    )}

                    {/* Brand Pill */}
                    {!article && (
                        <div className="relative z-10 px-4 py-2 font-newsreader text-xl font-bold italic text-slate-900">
                            DeepSeek IELTS
                        </div>
                    )}

                    {/* Progress Ring & Brand (When Article Active) */}
                    {article && (
                        <div className="relative z-10 flex items-center gap-3 px-2">
                            {/* Nano Progress Ring */}
                            <div className="relative w-5 h-5 flex items-center justify-center">
                                {/* Track */}
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                    <path
                                        className="text-stone-200"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    {/* Indicator */}
                                    <path
                                        className="text-amber-500 transition-all duration-100 ease-out"
                                        strokeDasharray={`${scrollProgress * 100}, 100`}
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>

                            <div className="font-newsreader italic font-bold text-lg text-stone-800 hidden md:block">
                                DeepSeek IELTS
                            </div>
                        </div>
                    )}

                    {/* Divider */}
                    {article && <div className="w-px h-4 bg-stone-300/50 mx-1" />}

                    {/* Tools Group */}
                    <div className="flex items-center gap-1">
                        {/* Focus Mode Toggle */}
                        {article && (
                            <button
                                onClick={toggleFocusMode}
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300",
                                    isFocusMode
                                        ? "bg-slate-900 text-yellow-300 shadow-[0_0_20px_rgba(250,204,21,0.45)] ring-1 ring-yellow-300/45"
                                        : "text-slate-500 hover:bg-white/65 hover:text-slate-800"
                                )}
                                title="Deep Focus Mode"
                            >
                                <Flashlight className={cn("w-4 h-4", isFocusMode && "fill-current")} />
                            </button>
                        )}

                        {/* Bionic Reading Toggle */}
                        {article && (
                            <button
                                onClick={toggleBionicMode}
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300",
                                    isBionicMode
                                        ? "bg-slate-900 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.45)] ring-1 ring-cyan-300/45"
                                        : "text-slate-500 hover:bg-white/65 hover:text-slate-800"
                                )}
                                title="Bionic Reading"
                            >
                                <Eye className={cn("w-4 h-4", isBionicMode && "fill-current")} />
                            </button>
                        )}

                        {/* Theme Switcher */}
                        <div className="relative">
                            <button
                                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                                className={cn(
                                    "w-10 h-10 flex items-center justify-center rounded-full transition-all",
                                    isThemeMenuOpen ? "bg-white/75 text-slate-900" : "text-slate-500 hover:bg-white/65 hover:text-slate-900"
                                )}
                                title="Appearance"
                            >
                                <Palette className="w-5 h-5" />
                            </button>

                            {isThemeMenuOpen && (
                                <AppearanceMenu onClose={() => setIsThemeMenuOpen(false)} />
                            )}
                        </div>

                        {article && (
                            <>
                                <button
                                    onClick={() => setIsEditMode(!isEditMode)}
                                    className={cn(
                                        "w-10 h-10 flex items-center justify-center rounded-full transition-all",
                                        isEditMode ? "bg-amber-100/90 text-amber-700" : "text-slate-500 hover:bg-white/65 hover:text-slate-900"
                                    )}
                                    title="Edit Text"
                                >
                                    <Edit3 className="w-4 h-4" />
                                </button>

                                <button
                                    onClick={() => setIsWritingMode(true)}
                                    className="ml-1 flex h-10 items-center gap-2 rounded-full border border-white/60 bg-white/70 px-4 text-sm font-bold text-slate-700 shadow-[0_8px_22px_-16px_rgba(15,23,42,0.65)] transition-all hover:bg-white hover:text-slate-900"
                                >
                                    <PenTool className="w-4 h-4" />
                                    <span>Drill</span>
                                </button>
                            </>
                        )}
                    </div>

                    <div className="relative z-10 ml-1 hidden items-center gap-1 rounded-full border border-white/70 bg-white/62 px-3 py-1 text-xs font-semibold text-slate-700 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.55)] md:flex">
                        <span>阅读币</span>
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">{profile?.reading_coins ?? 0}</span>
                    </div>
                </div>
            </motion.nav>

            <ReadingCoinIsland event={activeReadingCoinFx} />

                <div
                className={cn(
                    showStandardSplitQuiz ? "flex min-h-0 flex-col" : "mt-20",
                    isWritingMode && "h-[calc(100vh-120px)]"
                )}
            >
                {catNotice ? (
                    <div className="mx-auto mb-4 flex w-full max-w-4xl flex-col gap-2">
                        <div className="rounded-full border border-violet-200/80 bg-white/72 px-4 py-2 text-center text-sm font-semibold text-violet-700 shadow-[0_18px_36px_-26px_rgba(109,40,217,0.55)] backdrop-blur-xl">
                            {catNotice}
                        </div>
                    </div>
                ) : null}
                {!article ? (
                        <div
                            key="picker"
                            className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 overflow-hidden pb-10"
                        >
                        {error && (
                            <LiquidGlassPanel className="rounded-xl px-4 py-2 text-center text-sm text-red-700">
                                {error}
                            </LiquidGlassPanel>
                        )}

                        {isLoading && (
                            <LiquidGlassPanel className="rounded-xl px-4 py-2 text-center text-sm text-cyan-700">
                                Loading article...
                            </LiquidGlassPanel>
                        )}

                        <div>
                            <RecommendedArticles
                                onSelect={handleUrlSubmit}
                                onArticleLoaded={(data) => {
                                    const nextArticle = data as ArticleData;
                                    setArticle(nextArticle);
                                    setArticleStartedAt(Date.now());
                                    if (sessionUser?.id && nextArticle.url) {
                                        void markArticleAsRead(nextArticle.url);
                                        const dedupeKey = buildReadCompleteDedupeKey({ userId: sessionUser.id, articleUrl: nextArticle.url });
                                        void applyReadingEconomy({
                                            action: "read_complete",
                                            dedupeKey,
                                            articleUrl: nextArticle.url,
                                            meta: { source: nextArticle.isCatMode ? "cat_open" : "ai_gen_open" },
                                        }).then((result) => pushReadingCoinFx(result));
                                    }
                                }}
                            />
                        </div>
                        </div>
                    ) : (
                        <motion.div
                            key={article.url || article.title}
                            initial={{
                                opacity: 0,
                                y: 20,
                                scale: 0.992,
                                filter: "blur(10px)",
                            }}
                            animate={{
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                filter: "blur(0px)",
                            }}
                            transition={{
                                duration: 0.62,
                                ease: [0.16, 1, 0.3, 1],
                            }}
                            className={cn(
                                "relative mx-auto grid w-full",
                                showStandardSplitQuiz && "min-h-0",
                                "grid gap-6 2xl:gap-8",
                                showStandardSplitQuiz
                                    ? "grid-cols-1 min-h-0 xl:grid-cols-[minmax(0,1fr)_clamp(360px,36vw,620px)]"
                                    : "grid-cols-1",
                            )}
                        >
                        {/* Reading Column */}
                        <div
                            key={readingViewportKey}
                            ref={readingColumnRef}
                            data-reading-scroll-container="true"
                            className={cn(
                            "space-y-8 xl:space-y-10",
                            showStandardSplitQuiz
                                ? "min-h-0 overflow-visible xl:pr-2 xl:pb-2"
                                : "overflow-visible",
                            showStandardSplitQuiz ? "max-w-none" : "mx-auto max-w-3xl"
                        )}>
                            {/* Quiz Entry Button - only for AI generated articles */}
                            {!showStandardSplitQuiz && article.isAIGenerated && article.difficulty && (
                                <div className="sticky top-[94px] z-40 flex justify-end">
                                    {renderQuizToggleButton()}
                                </div>
                            )}

                            <ArticleDisplay
                                title={article.title}
                                content={article.content}
                                byline={article.byline}
                                blocks={article.blocks}
                                siteName={article.siteName}
                                videoUrl={article.videoUrl}
                                articleUrl={article.url}
                                isEditMode={isEditMode}
                                locateRequest={quizLocateRequest}
                                readingNotes={readingNotes}
                                onCreateReadingNote={handleCreateReadingNote}
                                onDeleteReadingMarks={handleDeleteReadingMarks}
                            />

                            <div className="hidden sticky bottom-8 z-40 animate-in slide-in-from-bottom-10 duration-700">
                                <AudioPlayer text={article.textContent || ""} />
                            </div>
                        </div>

                        {showStandardSplitQuiz && (
                            <div className="min-h-0">
                                <div
                                    ref={quizPanelWrapperRef}
                                    style={quizPanelStyle}
                                    className={cn(
                                        "min-h-0 xl:sticky xl:top-28 xl:flex xl:w-full xl:max-w-[620px] xl:flex-col xl:justify-self-end xl:self-start",
                                        shouldEnableQuizPanelDrag && "transition-transform duration-75",
                                    )}
                                >

                                    <LiquidGlassPanel
                                        ref={quizPanelGlassRef}
                                        className="quiz-green-glass flex flex-col h-full max-h-[85vh] overflow-hidden rounded-[24px] shadow-[0_32px_72px_-56px_rgba(6,95,70,0.7)] [&>.liquid-glass-content]:flex [&>.liquid-glass-content]:h-full [&>.liquid-glass-content]:min-h-0 [&>.liquid-glass-content]:flex-col"
                                    >
                                        {renderQuizPanel()}
                                    </LiquidGlassPanel>
                                </div>
                            </div>
                        )}

                        {/* Writing Overlay */}
                        {isWritingMode && (
                            <WritingEditor
                                articleTitle={article.title}
                                articleContent={article.textContent || article.content}
                                onClose={() => setIsWritingMode(false)}
                            />
                        )}
                        </motion.div>
                    )}
            </div>
            </div>
        </main >
    );
}

function RollingNumber({
    from,
    to,
    className,
    duration = 860,
}: {
    from: number;
    to: number;
    className?: string;
    duration?: number;
}) {
    const [value, setValue] = useState(from);

    useEffect(() => {
        let frameId = 0;
        let startAt = 0;
        const delta = to - from;

        const tick = (timestamp: number) => {
            if (!startAt) {
                startAt = timestamp;
            }
            const progress = Math.min((timestamp - startAt) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(from + delta * eased));
            if (progress < 1) {
                frameId = window.requestAnimationFrame(tick);
            }
        };

        frameId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frameId);
    }, [from, to, duration]);

    return <span className={className}>{value}</span>;
}

export default function ReadingPage() {
    return (
        <ReadingSettingsProvider>
            <Suspense fallback={<div className="min-h-screen bg-[#0b1220]" />}>
                <ReadingPageContent />
            </Suspense>
        </ReadingSettingsProvider>
    );
}
