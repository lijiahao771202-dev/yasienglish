"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArticleDisplay } from "@/components/reading/ArticleDisplay";
import { AudioPlayer } from "@/components/shadowing/AudioPlayer";
import { WritingEditor } from "@/components/writing/WritingEditor";
import { RecommendedArticles } from "@/components/reading/RecommendedArticles";
import { ReadingQuizPanel, QuizQuestion, type QuizSubmitPayload } from "@/components/reading/ReadingQuizPanel";
import { CatSelfAssessmentDialog } from "@/components/reading/CatSelfAssessmentDialog";
import { ReadPretestOverlay } from "@/components/reading/ReadPretestOverlay";
import { ArrowLeft, House, Palette, Edit3, Flashlight, Eye, ClipboardCheck, GripVertical, Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { SpotlightTour, type TourStep } from "@/components/ui/SpotlightTour";
import axios from "axios";
import { useUserStore } from "@/lib/store";
import { resolveDailyArticleCandidate } from "@/lib/dailyArticle";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { applyBackgroundThemeToDocument, BACKGROUND_CHANGED_EVENT, getBackgroundThemeSpec, getSavedBackgroundTheme } from "@/lib/background-preferences";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type ReadingMarkType, type ReadingNoteItem } from "@/lib/db";
import {
    buildDailyLoginDedupeKey,
    buildQuizCompleteDedupeKey,
    buildReadCompleteDedupeKey,
    type ReadingEconomyAction,
} from "@/lib/reading-economy";
import { applyServerProfilePatchToLocal, markArticleAsRead as markArticleAsReadCloud } from "@/lib/user-repository";
import {
    buildGrammarCacheKey,
    GRAMMAR_BASIC_MODEL,
    GRAMMAR_BASIC_PROMPT_VERSION,
    GRAMMAR_DEEP_MODEL,
    GRAMMAR_DEEP_PROMPT_VERSION,
} from "@/lib/grammar-analysis";
import { ReadingCoinIsland } from "@/components/reading/ReadingCoinIsland";
import {
    READING_COIN_FX_EVENT,
    createReadingCoinFxEvent,
    type ReadingCoinFxEvent,
} from "@/lib/reading-coin-fx";
import { getPressableStyle } from "@/lib/pressable";
import { buildReadArticleCloudPayload } from "@/lib/read-article-snapshot";
import {
    CAT_SELF_ASSESSMENT_LABELS,
    CAT_SYSTEM_ASSESSMENT_LABELS,
    getCatScoreCorrectionSummary,
    type CatSelfAssessment,
    type CatSystemAssessment,
} from "@/lib/cat-self-assessment";
import {
    buildPreparedCatSettlementPreview,
    type PreparedCatSettlementSnapshot,
} from "@/lib/cat-settlement-preview";

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
    quizQuestions?: QuizQuestion[];
    quizAnswers?: Record<number, string | string[]>;
    quizResponses?: QuizSubmitPayload["responses"];
    quizQualityTier?: "ok" | "low_confidence";
    catSelfAssessed?: boolean;
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
    alreadyCompleted?: boolean;
    isPendingFinalization?: boolean;
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
    objectiveDelta?: number;
    systemAssessment?: CatSystemAssessment | null;
    selfAssessment?: CatSelfAssessment | null;
    scoreCorrection?: number;
    difficultySignal?: number | null;
}

interface PendingCatSubmission {
    correct: number;
    total: number;
    readingMs?: number;
    responses?: QuizSubmitPayload["responses"];
    qualityTier?: QuizSubmitPayload["qualityTier"];
}

const buildReadingArticleKey = (article: Pick<ArticleData, "title" | "url">) => {
    const normalizedUrl = typeof article.url === "string" ? article.url.trim() : "";
    if (normalizedUrl) return normalizedUrl;
    return `title:${(article.title || "untitled").trim().toLowerCase()}`;
};

async function parseJsonResponseSafely(response: Response) {
    const raw = await response.text();
    if (!raw.trim()) return {} as Record<string, unknown>;
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        if (response.ok) {
            throw new Error("CAT 结算返回了无效响应");
        }
        throw new Error(`CAT 结算失败（${response.status}）`);
    }
}

function formatCatSubmitErrorMessage(error: unknown) {
    if (!(error instanceof Error)) {
        return "CAT 结算失败，请重试";
    }
    const message = error.message.trim();
    if (!message) {
        return "CAT 结算失败，请重试";
    }
    if (message === "fetch failed" || message.toLowerCase() === "failed to fetch") {
        return "CAT 结算请求失败，请重试";
    }
    return message;
}

const extractParagraphTextsForGrammar = (article: ArticleData): string[] => {
    if (Array.isArray(article.blocks) && article.blocks.length > 0) {
        const fromBlocks = article.blocks.flatMap((block) => {
            if (block.type === "paragraph" && typeof block.content === "string") {
                const text = block.content.trim();
                return text ? [text] : [];
            }
            if (block.type === "blockquote" && typeof block.content === "string") {
                const text = block.content.trim();
                return text ? [text] : [];
            }
            if (block.type === "list" && Array.isArray(block.items)) {
                return block.items
                    .map((item) => item.trim())
                    .filter(Boolean);
            }
            return [];
        });
        if (fromBlocks.length > 0) return fromBlocks;
    }

    const fallback = (article.textContent || article.content || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    return fallback;
};

const toCloudReadingNote = (note: ReadingNoteItem): Omit<ReadingNoteItem, "id"> => ({
    article_key: note.article_key,
    article_url: note.article_url,
    article_title: note.article_title,
    paragraph_order: note.paragraph_order,
    paragraph_block_index: note.paragraph_block_index,
    selected_text: note.selected_text,
    note_text: note.note_text,
    mark_type: note.mark_type,
    mark_color: note.mark_color,
    start_offset: note.start_offset,
    end_offset: note.end_offset,
    created_at: note.created_at,
    updated_at: note.updated_at,
});

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
    const [pendingCatSubmission, setPendingCatSubmission] = useState<PendingCatSubmission | null>(null);
    const [isSubmittingCatAssessment, setIsSubmittingCatAssessment] = useState(false);
    const [isPreparingCatAssessment, setIsPreparingCatAssessment] = useState(false);
    const preparedCatSessionIdRef = useRef<string | null>(null);
    const preparingCatSessionPromiseRef = useRef<Promise<void> | null>(null);
    const preparedCatSettlementRef = useRef<PreparedCatSettlementSnapshot | null>(null);
    const [isWritingMode, setIsWritingMode] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isQuizMode, setIsQuizMode] = useState<boolean>(false);
    const [isPretestOverlayOpen, setIsPretestOverlayOpen] = useState(false);
    const [isPretestCompletedForArticle, setIsPretestCompletedForArticle] = useState(false);
    const [quizLocateRequest, setQuizLocateRequest] = useState<QuizLocateRequest | null>(null);
    const [showReadTour, setShowReadTour] = useState(false);

    useEffect(() => {
        if (article && !isPretestOverlayOpen) {
            const hasCompleted = localStorage.getItem("read-v2-onboarded");
            if (!hasCompleted) {
                const timer = setTimeout(() => setShowReadTour(true), 1500);
                return () => clearTimeout(timer);
            }
        }
    }, [article, isPretestOverlayOpen]);

    const handleReadTourComplete = () => {
        localStorage.setItem("read-v2-onboarded", "true");
        setShowReadTour(false);
    };

    const readTourSteps: TourStep[] = [
        {
            targetId: "read-tools",
            title: "阅读工具箱",
            content: "页面上方提供了丰富的辅助工具：\n【专注模式】隐藏周边干扰\n【仿生阅读】加粗词首提升眼动速度\n【外观调色盘】随时调整主题配色\n【编辑模式】自由更改并保存长难句解析！",
            placement: "bottom"
        },
        {
            targetId: "paragraph-listen",
            title: "精读系统：多模式片段伴读",
            content: "我们为每一个段落都配备了独立的工作栏！\n点击 Speaking，立刻展开原音级跟读面板。不仅支持全文流畅连读，您还能随时切换到『逐句精听』模式，享受无缝听感。",
            placement: "bottom"
        },
        {
            targetId: "paragraph-translate",
            title: "精读系统：AI 语境双层翻译",
            content: "不再需要跳出文章查字典！我们利用大模型，一键为您生成最符合当前语境的精准翻译。",
            placement: "bottom"
        },
        {
            targetId: "paragraph-grammar",
            title: "精读系统：重型语法剖析机",
            content: "遇到长难句不要慌！\n点击 Grammar，AI 会瞬间扫描并高亮出段落内所有的多重嵌套从句。您可以一键将复杂的句子“抽丝剥茧”，生成可视化的『树状语法层级』，彻底打通阅读逻辑！",
            placement: "bottom"
        },
        {
            targetId: "paragraph-ask",
            title: "精读系统：情景式问答场",
            content: "在阅读期间，AI 私教将随时待命！\n通过 Ask AI，您可以对当前段落发出任何拷问：分析结构、总结大干、提取高级词汇等，AI都会瞬间为您作出解答。",
            placement: "bottom"
        },
        {
            targetId: "read-coin-balance",
            title: "阅读金币积累",
            content: "在这里随时查看您的财富！每当您完成一篇精读或通过单词测试，都会触发沉浸式的金币奖励特效。努力积攒，后续可解锁高级能力！",
            placement: "bottom"
        },
        {
            targetId: "read-quiz-toggle",
            title: "终极试炼：AI 题卡库",
            content: "我们为文章潜藏了专属的【题卡库 / AI Studio】！只要您觉得文章精读完毕，点击这里即可弹出隐藏的训练面板，接受四六级/雅思难度的灵魂拷问！",
            placement: "top"
        }
    ];

    useEffect(() => {
        if (showReadTour) {
            document.body.classList.add("read-tour-active");
            return () => document.body.classList.remove("read-tour-active");
        }
    }, [showReadTour]);

    const [routeExitTarget, setRouteExitTarget] = useState<"home" | "battle" | null>(null);
    const [articleStartedAt, setArticleStartedAt] = useState<number | null>(null);
    const [quizCache, setQuizCache] = useState<Record<string, QuizQuestion[]>>({});
    const [quizCacheHydrated, setQuizCacheHydrated] = useState<Record<string, boolean>>({});
    const [isWideViewport, setIsWideViewport] = useState(false);
    const [isQuizPanelDragging, setIsQuizPanelDragging] = useState(false);
    const [quizPanelOffset, setQuizPanelOffset] = useState({ x: 0, y: 0 });
    const [, forceBackgroundRefresh] = useState(0);
    const { loadUserData, markArticleAsRead: markReadArticleInStore } = useUserStore();
    const activeArticleKey = article ? buildReadingArticleKey(article) : null;
    const pretestCompletionCacheKey = activeArticleKey ? `read-pretest-complete::${activeArticleKey}` : "";
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
    const quizPrefetchRef = useRef<Record<string, boolean>>({});
    const deletedArticleUrlsRef = useRef<Set<string>>(new Set());
    const resumedArticleRef = useRef<string | null>(null);
    const snapshotPersistTimerRef = useRef<number | null>(null);
    const [articleSnapshotRevision, setArticleSnapshotRevision] = useState(0);

    // Scroll Progress
    const [scrollProgress, setScrollProgress] = useState(0);
    const routeFrom = searchParams.get("from");
    const resumeArticleUrl = searchParams.get("url");
    const hasRouteEntry = routeFrom === "battle" || routeFrom === "home";
    const prefersReducedMotion = useReducedMotion();
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
        mint: "bg-[linear-gradient(180deg,rgba(209,250,229,0.45),rgba(167,243,208,0.3))]",
        lavender: "bg-[linear-gradient(180deg,rgba(243,232,255,0.45),rgba(233,213,255,0.3))]",
        rose: "bg-[linear-gradient(180deg,rgba(255,228,230,0.45),rgba(254,205,211,0.3))]",
        sky: "bg-[linear-gradient(180deg,rgba(224,242,254,0.45),rgba(186,230,253,0.3))]",
        sand: "bg-[#fdf9e3]/45",
        latte: "bg-[linear-gradient(180deg,rgba(255,237,213,0.45),rgba(254,215,170,0.3))]",
        mocha: "bg-[linear-gradient(180deg,rgba(231,229,228,0.45),rgba(214,211,209,0.3))]",
        slate: "bg-[linear-gradient(180deg,rgba(226,232,240,0.45),rgba(203,213,225,0.3))]",
        dracula: "bg-[linear-gradient(180deg,rgba(24,24,27,0.6),rgba(39,39,42,0.46))]",
        hacker: "bg-[linear-gradient(180deg,rgba(0,0,0,0.65),rgba(10,25,15,0.55))]",
        midnight: "bg-[linear-gradient(180deg,rgba(30,27,75,0.6),rgba(49,46,129,0.46))]",
        crimson: "bg-[linear-gradient(180deg,rgba(76,5,25,0.6),rgba(136,19,55,0.46))]",
        forest: "bg-[linear-gradient(180deg,rgba(2,44,34,0.6),rgba(6,78,59,0.46))]",
        ocean: "bg-[linear-gradient(180deg,rgba(8,51,68,0.6),rgba(22,78,99,0.46))]",
        sepia: "bg-[#f4ecd8]/45",
        peach: "bg-[#fff0e6]/45",
        matcha: "bg-[#e8f4e6]/45",
        berry: "bg-fuchsia-50/45",
        cyberpunk: "bg-[#ffeb3b]/45",
        nord: "bg-[linear-gradient(180deg,rgba(46,52,64,0.6),rgba(59,66,82,0.46))]",
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
    const catSettlementCorrectionSummary = catSettlement
        ? getCatScoreCorrectionSummary({
            selfAssessment: catSettlement.selfAssessment,
            scoreCorrection: catSettlement.scoreCorrection,
        })
        : null;
    useEffect(() => {
        if (!article?.isCatMode || article.catSelfAssessed || !article.quizCompleted) return;
        if (pendingCatSubmission || isSubmittingCatAssessment) return;
        if (!Array.isArray(article.quizResponses) || article.quizResponses.length === 0) return;

        setPendingCatSubmission({
            correct: Math.max(0, Number(article.quizCorrect ?? 0)),
            total: Math.max(1, Number(article.quizTotal ?? article.quizResponses.length)),
            responses: article.quizResponses,
            qualityTier: article.quizQualityTier,
        });
    }, [article, isSubmittingCatAssessment, pendingCatSubmission]);
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
    const preparePendingCatSession = useCallback(async () => {
        if (!pendingCatSubmission || !article?.isCatMode || !article.catSessionId) {
            return;
        }
        if (preparedCatSessionIdRef.current === article.catSessionId) {
            return;
        }
        if (preparingCatSessionPromiseRef.current) {
            await preparingCatSessionPromiseRef.current;
            return;
        }

        const promise = (async () => {
            setIsPreparingCatAssessment(true);
            try {
                const response = await fetch("/api/ai/cat/session/submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        mode: "prepare",
                        sessionId: article.catSessionId,
                        quizCorrect: pendingCatSubmission.correct,
                        quizTotal: pendingCatSubmission.total,
                        readingMs: pendingCatSubmission.readingMs,
                        responses: pendingCatSubmission.responses,
                        qualityTier: pendingCatSubmission.qualityTier,
                    }),
                });
                const payload = await parseJsonResponseSafely(response);
                if (!response.ok) {
                    throw new Error(typeof payload.error === "string" ? payload.error : "CAT prepare failed");
                }
                preparedCatSessionIdRef.current = article.catSessionId;
                if (payload?.animationPayload && payload?.session) {
                    const animation = payload.animationPayload as Record<string, unknown>;
                    preparedCatSettlementRef.current = {
                        sessionId: article.catSessionId,
                        objectiveDelta: Number(payload.session.objectiveDelta ?? animation.delta ?? 0),
                        systemAssessment: (payload.session.systemAssessment ?? null) as CatSystemAssessment | null,
                        stopReason: (payload.session.stopReason ?? null) as string | null,
                        itemCount: Number(payload.session.itemCount ?? 0) || null,
                        minItems: Number(payload.session.policyUsed?.minItems ?? 0) || null,
                        maxItems: Number(payload.session.policyUsed?.maxItems ?? 0) || null,
                        scoreBefore: Number(animation.scoreBefore ?? 0),
                        scoreAfter: Number(animation.scoreAfter ?? 0),
                        delta: Number(animation.delta ?? 0),
                        rankBefore: animation.rankBefore as CatSettlementPayload["rankBefore"],
                        rankAfter: animation.rankAfter as CatSettlementPayload["rankAfter"],
                        isRankUp: Boolean(animation.isRankUp),
                        isRankDown: Boolean(animation.isRankDown),
                    };
                }
            } catch (prepareError) {
                preparedCatSessionIdRef.current = null;
                preparedCatSettlementRef.current = null;
                console.error("Failed to prepare CAT settlement:", prepareError);
            } finally {
                setIsPreparingCatAssessment(false);
                preparingCatSessionPromiseRef.current = null;
            }
        })();

        preparingCatSessionPromiseRef.current = promise;
        await promise;
    }, [article, pendingCatSubmission]);
    const submitPendingCatSession = useCallback(async (selfAssessment: CatSelfAssessment | null) => {
        if (!pendingCatSubmission || !article?.isCatMode || !article.catSessionId) {
            setPendingCatSubmission(null);
            return;
        }

        setIsSubmittingCatAssessment(true);
        const submissionSnapshot = pendingCatSubmission;
        const preparedSnapshot = preparedCatSessionIdRef.current === article.catSessionId
            ? preparedCatSettlementRef.current
            : null;
        const optimisticSettlement = preparedSnapshot
            ? buildPreparedCatSettlementPreview({
                prepared: preparedSnapshot,
                selfAssessment,
            })
            : null;
        try {
            const currentArticleUrl = typeof article.url === "string" ? article.url.trim() : "";
            const canUsePreparedSettlement = Boolean(preparedSnapshot);
            if (optimisticSettlement) {
                setCatSettlement(optimisticSettlement);
                setPendingCatSubmission(null);
            }
            const response = await fetch("/api/ai/cat/session/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "finalize",
                    sessionId: article.catSessionId,
                    quizCorrect: pendingCatSubmission.correct,
                    quizTotal: pendingCatSubmission.total,
                    readingMs: pendingCatSubmission.readingMs,
                    responses: canUsePreparedSettlement ? undefined : pendingCatSubmission.responses,
                    qualityTier: pendingCatSubmission.qualityTier,
                    selfAssessment: selfAssessment ?? undefined,
                }),
            });
            const payload = await parseJsonResponseSafely(response);
            if (!response.ok) {
                throw new Error(typeof payload.error === "string" ? payload.error : "CAT submit failed");
            }

            const policyUsed = payload?.session?.policyUsed;
            const correction = Number(payload?.session?.scoreCorrection ?? 0);
            const correctionSummary = getCatScoreCorrectionSummary({
                selfAssessment: (payload?.session?.selfAssessment ?? selfAssessment ?? null) as CatSelfAssessment | null,
                scoreCorrection: correction,
            });
            if (payload?.session?.delta !== undefined) {
                const signedDelta = Number(payload.session.delta);
                const deltaText = signedDelta >= 0 ? `+${signedDelta}` : `${signedDelta}`;
                const stopHint = formatCatStopReason({
                    stopReason: payload?.session?.stopReason,
                    itemCount: payload?.session?.itemCount,
                    minItems: policyUsed?.minItems,
                    maxItems: policyUsed?.maxItems,
                });
                const correctionText = selfAssessment
                    ? ` · ${correctionSummary.label}`
                    : "";
                setCatNotice(`CAT 本局结算 ${deltaText} 分${correctionText} · ${stopHint}`);
                window.setTimeout(() => setCatNotice(null), 4200);
            }

            if (payload?.animationPayload) {
                const animationPayload = {
                    ...(payload.animationPayload as CatSettlementPayload),
                    stopReason: payload?.session?.stopReason,
                    itemCount: payload?.session?.itemCount,
                    minItems: policyUsed?.minItems,
                    maxItems: policyUsed?.maxItems,
                    alreadyCompleted: Boolean(payload?.alreadyCompleted),
                    systemAssessment: payload?.session?.systemAssessment ?? null,
                    selfAssessment: payload?.session?.selfAssessment ?? selfAssessment ?? null,
                    objectiveDelta: Number(payload?.session?.objectiveDelta ?? payload?.session?.delta ?? 0),
                    scoreCorrection: Number(payload?.session?.scoreCorrection ?? 0),
                    difficultySignal: Number(payload?.session?.difficultySignal ?? 0),
                    isPendingFinalization: false,
                } as CatSettlementPayload;
                setCatSettlement(animationPayload);
            }

            if (payload?.readingCoins?.delta > 0) {
                pushReadingCoinFx({
                    action: "quiz_complete",
                    delta: payload.readingCoins.delta,
                    applied: payload?.readingCoins?.applied !== false,
                });
            }

            setArticle((prev) => prev ? { ...prev, catSelfAssessed: true } : prev);
            setPendingCatSubmission(null);
            preparedCatSessionIdRef.current = null;
            preparedCatSettlementRef.current = null;

            void (async () => {
                try {
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

                    const profileRow = await db.user_profile.orderBy("id").first();
                    if (profileRow?.id !== undefined) {
                        await db.user_profile.update(profileRow.id, {
                            cat_pending_difficulty_signal: Number(payload?.session?.difficultySignal ?? 0),
                        });
                    }
                    if (currentArticleUrl) {
                        await db.articles.update(currentArticleUrl, {
                            catSelfAssessed: true,
                            timestamp: Date.now(),
                        });
                    }
                } catch (profilePatchError) {
                    console.error("Failed to persist CAT difficulty signal locally:", profilePatchError);
                }
            })();
        } catch (submitError) {
            console.error(submitError);
            if (optimisticSettlement) {
                setCatSettlement(null);
                setPendingCatSubmission(submissionSnapshot);
                preparedCatSessionIdRef.current = article.catSessionId;
                preparedCatSettlementRef.current = preparedSnapshot;
            }
            setCatNotice(formatCatSubmitErrorMessage(submitError));
            window.setTimeout(() => setCatNotice(null), 4200);
        } finally {
            setIsSubmittingCatAssessment(false);
        }
    }, [article, formatCatStopReason, pendingCatSubmission, pushReadingCoinFx]);
    useEffect(() => {
        if (!pendingCatSubmission || !article?.isCatMode || !article.catSessionId) {
            preparedCatSessionIdRef.current = null;
            return;
        }
        void preparePendingCatSession();
    }, [article, pendingCatSubmission, preparePendingCatSession]);
    const navEntryInitial = hasRouteEntry
        ? { opacity: 0, y: 16, scale: 0.992, filter: "blur(8px)" }
        : { opacity: 0, y: 10 };

    const clearDockHideTimer = useCallback(() => {
        if (dockHideTimerRef.current) {
            window.clearTimeout(dockHideTimerRef.current);
            dockHideTimerRef.current = null;
        }
    }, []);

    const markArticleSnapshotDirty = useCallback(() => {
        setArticleSnapshotRevision((prev) => prev + 1);
    }, []);

    const persistArticleLocally = useCallback(async (targetArticle: ArticleData | null | undefined) => {
        if (!targetArticle?.url) return;
        const articleUrl = targetArticle.url.trim();
        if (!articleUrl) return;
        if (deletedArticleUrlsRef.current.has(articleUrl)) return;

        await db.articles.put({
            url: articleUrl,
            title: targetArticle.title || "Untitled",
            content: targetArticle.content || "",
            textContent: targetArticle.textContent || targetArticle.content || "",
            byline: targetArticle.byline,
            siteName: targetArticle.siteName,
            blocks: targetArticle.blocks,
            image: targetArticle.image ?? null,
            timestamp: Date.now(),
            difficulty: targetArticle.difficulty,
            isAIGenerated: targetArticle.isAIGenerated,
            isCatMode: targetArticle.isCatMode,
            catSessionId: targetArticle.catSessionId,
            catBand: targetArticle.catBand,
            catScoreSnapshot: targetArticle.catScoreSnapshot,
            catThetaSnapshot: targetArticle.catThetaSnapshot,
            catSeSnapshot: targetArticle.catSeSnapshot,
            catSessionBlueprint: targetArticle.catSessionBlueprint,
            catQuizBlueprint: targetArticle.catQuizBlueprint,
            quizCompleted: targetArticle.quizCompleted,
            quizCorrect: targetArticle.quizCorrect,
            quizTotal: targetArticle.quizTotal,
            quizScorePercent: targetArticle.quizScorePercent,
            quizQuestions: targetArticle.quizQuestions,
            quizAnswers: targetArticle.quizAnswers,
            quizResponses: targetArticle.quizResponses,
            quizQualityTier: targetArticle.quizQualityTier,
            catSelfAssessed: targetArticle.catSelfAssessed,
        });
    }, []);

    const persistArticleCloudSnapshot = useCallback(async (targetArticle: ArticleData | null | undefined) => {
        if (!targetArticle?.url) return;
        const articleUrl = targetArticle.url.trim();
        if (!articleUrl) return;
        if (deletedArticleUrlsRef.current.has(articleUrl)) return;

        const articleKey = buildReadingArticleKey(targetArticle);
        const paragraphTexts = extractParagraphTextsForGrammar(targetArticle);
        const grammarKeys = Array.from(new Set(paragraphTexts.flatMap((paragraphText) => {
            const trimmed = paragraphText.trim();
            if (!trimmed) return [];
            const basicKey = buildGrammarCacheKey({
                text: trimmed,
                mode: "basic",
                promptVersion: GRAMMAR_BASIC_PROMPT_VERSION,
                model: GRAMMAR_BASIC_MODEL,
            });
            const deepKey = buildGrammarCacheKey({
                text: trimmed,
                mode: "deep",
                promptVersion: GRAMMAR_DEEP_PROMPT_VERSION,
                model: GRAMMAR_DEEP_MODEL,
            });
            return [basicKey, deepKey];
        })));

        const [cachedArticle, noteRows, grammarRows, askRows] = await Promise.all([
            db.articles.get(articleUrl),
            db.reading_notes.where("article_key").equals(articleKey).sortBy("updated_at"),
            grammarKeys.length > 0
                ? db.ai_cache.where("[key+type]").anyOf(
                    grammarKeys.map((key) => [key, "grammar"] as [string, "grammar"]),
                ).toArray()
                : Promise.resolve([]),
            db.ai_cache.where("type").equals("ask_ai").filter((row) => row.key.startsWith(`ask:${articleKey}:`)).toArray(),
        ]);
        const stableTimestamp = typeof cachedArticle?.timestamp === "number"
            ? cachedArticle.timestamp
            : Date.now();

        await markArticleAsReadCloud(articleUrl, {
            articleKey,
            articleTitle: targetArticle.title,
            articlePayload: buildReadArticleCloudPayload(targetArticle, stableTimestamp),
            readingNotesPayload: noteRows.map(toCloudReadingNote),
            grammarPayload: grammarRows.map((row) => ({
                key: row.key,
                data: row.data,
                timestamp: row.timestamp,
            })),
            askPayload: askRows.map((row) => ({
                key: row.key,
                data: row.data,
                timestamp: row.timestamp,
            })),
        });
    }, []);

    const scheduleDockHide = useCallback((delay = 1100) => {
        if (showReadTour) return;
        clearDockHideTimer();
        dockHideTimerRef.current = window.setTimeout(() => {
            setIsDockVisible(false);
            setIsThemeMenuOpen(false);
        }, delay);
    }, [clearDockHideTimer, showReadTour]);

    const handleRouteExit = (target: "home" | "battle") => {
        if (routeExitTarget) return;
        setRouteExitTarget(target);
        window.setTimeout(() => {
            if (target === "home") {
                router.push("/?from=read");
                return;
            }
            router.push("/battle?from=read");
        }, prefersReducedMotion ? 140 : 560);
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

    useEffect(() => {
        if (!pretestCompletionCacheKey) {
            setIsPretestCompletedForArticle(false);
            return;
        }
        let cancelled = false;
        void (async () => {
            try {
                const cached = await db.ai_cache.where("[key+type]").equals([pretestCompletionCacheKey, "quiz"]).first();
                if (cancelled) return;
                setIsPretestCompletedForArticle(Boolean(cached?.data?.completed));
            } catch (error) {
                console.error("Failed to load pretest completion cache:", error);
                if (!cancelled) {
                    setIsPretestCompletedForArticle(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [pretestCompletionCacheKey]);

    useEffect(() => {
        if (article?.isAIGenerated && article?.difficulty) return;
        setIsPretestOverlayOpen(false);
    }, [article?.difficulty, article?.isAIGenerated]);

    const persistPretestCompletion = useCallback(async () => {
        if (!pretestCompletionCacheKey) return;
        const existing = await db.ai_cache.where("[key+type]").equals([pretestCompletionCacheKey, "quiz"]).first();
        await db.ai_cache.put({
            id: existing?.id,
            key: pretestCompletionCacheKey,
            type: "quiz",
            data: {
                completed: true,
                completed_at: Date.now(),
            },
            timestamp: Date.now(),
        });
        setIsPretestCompletedForArticle(true);
    }, [pretestCompletionCacheKey]);

    const enterQuizMode = useCallback(() => {
        const currentWindowScroll = window.scrollY || document.documentElement.scrollTop || 0;
        scrollBeforeSplitRef.current = currentWindowScroll;
        window.scrollTo({ top: 0, behavior: "auto" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const node = readingColumnRef.current;
        if (node) {
            node.scrollTo({ top: 0, left: 0, behavior: "auto" });
        }
        setQuizLocateRequest(null);
        setIsPretestOverlayOpen(false);
        setIsQuizMode(true);
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
        markArticleSnapshotDirty();

    }, [article, markArticleSnapshotDirty]);

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
        markArticleSnapshotDirty();
    }, [article, markArticleSnapshotDirty]);

    useEffect(() => {
        if (!article?.url) return;
        if (snapshotPersistTimerRef.current) {
            window.clearTimeout(snapshotPersistTimerRef.current);
            snapshotPersistTimerRef.current = null;
        }
        snapshotPersistTimerRef.current = window.setTimeout(() => {
            void persistArticleCloudSnapshot(article).catch((error) => {
                console.error("Failed to persist read article cloud snapshot:", error);
            });
        }, 260);

        return () => {
            if (snapshotPersistTimerRef.current) {
                window.clearTimeout(snapshotPersistTimerRef.current);
                snapshotPersistTimerRef.current = null;
            }
        };
    }, [article, articleSnapshotRevision, persistArticleCloudSnapshot]);

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
                    isCatMode: cached.isCatMode,
                    catSessionId: cached.catSessionId,
                    catBand: cached.catBand,
                    catScoreSnapshot: cached.catScoreSnapshot,
                    catThetaSnapshot: cached.catThetaSnapshot,
                    catSeSnapshot: cached.catSeSnapshot,
                    catSessionBlueprint: cached.catSessionBlueprint,
                    catQuizBlueprint: cached.catQuizBlueprint,
                    quizCompleted: cached.quizCompleted,
                    quizCorrect: cached.quizCorrect,
                    quizTotal: cached.quizTotal,
                    quizScorePercent: cached.quizScorePercent,
                    quizQuestions: Array.isArray(cached.quizQuestions) ? cached.quizQuestions as QuizQuestion[] : undefined,
                    quizAnswers: cached.quizAnswers,
                    quizResponses: cached.quizResponses,
                    quizQualityTier: cached.quizQualityTier,
                    catSelfAssessed: cached.catSelfAssessed,
                });

                // Update timestamp
                db.articles.update([cached.url, cached.title, cached.timestamp], { timestamp: Date.now() });
                markReadArticleInStore(cached.url);
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
            markReadArticleInStore(finalUrl);
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
    }, [applyReadingEconomy, markReadArticleInStore, pushReadingCoinFx, sessionUser?.id]);

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
                    article.quizQuestions && article.quizQuestions.length > 0
                        ? article.quizQuestions
                        : article.isCatMode && Array.isArray(article.catSessionBlueprint?.items) && article.catSessionBlueprint.items.length > 0
                            ? article.catSessionBlueprint.items
                            : (quizCacheKey ? quizCache[quizCacheKey] : undefined)
                }
                initialSubmitted={Boolean(article.quizCompleted)}
                initialScore={
                    typeof article.quizCorrect === "number" && typeof article.quizTotal === "number"
                        ? { correct: article.quizCorrect, total: article.quizTotal }
                        : null
                }
                initialAnswers={article.quizAnswers}
                initialResponses={article.quizResponses}
                lockAfterCompletion={Boolean(article.quizCompleted)}
                onQuestionsReady={(questions) => {
                    if (!quizCacheKey || !quizDbKey) return;
                    setQuizCache((prev) => ({ ...prev, [quizCacheKey]: questions }));
                    setArticle((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            quizQuestions: questions,
                        };
                    });
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
                            if (article?.url) {
                                await db.articles.update(article.url, {
                                    quizQuestions: questions,
                                    timestamp: Date.now(),
                                });
                            }
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
                            quizQuestions: submission.questions ?? prev.quizQuestions,
                            quizAnswers: submission.answers as Record<number, string | string[]> | undefined ?? prev.quizAnswers,
                            quizResponses: submission.responses ?? prev.quizResponses,
                            quizQualityTier: submission.qualityTier ?? prev.quizQualityTier,
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
                                    quizQuestions: submission.questions,
                                    quizAnswers: submission.answers,
                                    quizResponses: submission.responses,
                                    quizQualityTier: submission.qualityTier,
                                    timestamp: Date.now(),
                                });
                                // Notify daily plan tracker that a reading quiz was completed
                                window.dispatchEvent(new CustomEvent('yasi:sync_smart_goals'));
                            } catch (error) {
                                console.error("Failed to persist quiz score:", error);
                            }
                        })();
                    }

                    if (sessionUser?.id && article?.url) {
                        const dedupeKey = buildQuizCompleteDedupeKey({ userId: sessionUser.id, articleUrl: article.url });
                        if (article.isCatMode && article.catSessionId) {
                            setPendingCatSubmission({
                                correct,
                                total,
                                readingMs,
                                responses: submission.responses,
                                qualityTier: submission.qualityTier,
                            });
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
                dragHandleNode={
                    shouldEnableQuizPanelDrag ? (
                        <button
                            type="button"
                            onPointerDown={handleQuizPanelDragStart}
                            className={cn(
                                "ui-pressable flex h-8 w-12 items-center justify-center rounded-full border-[3px] border-[#17120d] bg-white text-[#5f5448] transition-colors",
                                isQuizPanelDragging ? "cursor-grabbing bg-[#fff7d8] text-[#17120d]" : "cursor-grab hover:text-[#17120d]",
                            )}
                            style={getPressableStyle("rgba(23,18,13,0.08)", 3)}
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

    const renderQuizToggleButton = () => {
        if (!article?.isAIGenerated || !article?.difficulty) return null;
        return (
            <button
                data-tour-target="read-quiz-toggle"
                onClick={(event) => {
                    event.currentTarget.blur();
                    if (isQuizMode) {
                        setQuizLocateRequest(null);
                        setIsQuizMode(false);
                        return;
                    }
                    if (!isPretestCompletedForArticle) {
                        setIsPretestOverlayOpen(true);
                        return;
                    }
                    enterQuizMode();
                }}
                aria-pressed={isQuizMode}
                className="group flex flex-wrap items-center gap-2.5 rounded-md border-[2.5px] border-theme-border bg-indigo-500 px-4 py-2 text-sm font-black text-white shadow-[2px_3px_0_var(--theme-shadow)] transition-all hover:-translate-y-0.5 hover:bg-indigo-400 active:translate-y-[2px] active:shadow-none dark:border-theme-border/50 dark:bg-indigo-600/90"
            >
                <ClipboardCheck className="h-4 w-4 transition-transform group-hover:-rotate-6 group-hover:scale-110" />
                <span className="tracking-wide">{isQuizMode ? "隐藏题卡" : "开始答题"}</span>
                <span className={cn(
                    "flex items-center rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                )}>
                    {article.difficulty === 'cet4' ? '四级' : article.difficulty === 'cet6' ? '六级' : '雅思'}
                </span>
                {!isQuizMode && !isPretestCompletedForArticle ? (
                    <span className="flex items-center border-l-2 border-white/20 pl-2.5">
                        <span className="rounded bg-rose-400/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            前测
                        </span>
                    </span>
                ) : null}
            </button>
        );
    };

    const quizPanelStyle = (shouldEnableQuizPanelDrag && (isQuizPanelDragging || quizPanelOffset.x !== 0 || quizPanelOffset.y !== 0))
        ? { transform: `translate3d(${quizPanelOffset.x}px, ${quizPanelOffset.y}px, 0)`, zIndex: 50 }
        : undefined;

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!article) return;

        const url = new URL(window.location.href);

        if (article?.isCatMode) {
            url.searchParams.set("smart_task", "cat");
            if (article.difficulty) {
                url.searchParams.set("exam_track", article.difficulty);
            } else {
                url.searchParams.delete("exam_track");
            }
        } else if (article?.isAIGenerated && article?.difficulty) {
            url.searchParams.set("smart_task", "reading_ai");
            url.searchParams.set("exam_track", article.difficulty);
        } else {
            url.searchParams.delete("smart_task");
            url.searchParams.delete("exam_track");
        }

        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }, [article, article?.difficulty, article?.isAIGenerated, article?.isCatMode]);

    return (
        <main
            className={cn(
                "relative overflow-x-hidden text-stone-800 transition-all duration-500 ease-in-out [WebkitTapHighlightColor:transparent]",
                article
                    ? "min-h-screen bg-theme-base-bg px-4 pb-8 pt-24 md:px-8 md:pb-10 md:pt-28 xl:px-10"
                    : showStandardSplitQuiz
                        ? "min-h-screen px-6 pb-6 pt-24 md:px-12 md:pb-8 md:pt-28"
                        : "min-h-screen p-6 md:p-12",
                !article && "bg-theme-base-bg",
                !article ? READING_THEMES.find(t => t.id === theme)?.class : undefined,
                fontClass
            )}
        >
            {shouldUseGlobalBackgroundLayers && (
                <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                    <div className={`absolute inset-0 ${backgroundSpec.baseLayer}`} />
                    {backgroundSpec.coverGradient && <div className="absolute inset-0 opacity-[0.25]" style={{ backgroundImage: backgroundSpec.coverGradient, mixBlendMode: 'overlay' }} />}
                    {backgroundSpec.glassLayer && <div className={`absolute inset-0 ${backgroundSpec.glassLayer}`} />}
                    {backgroundSpec.glowLayer && <div className={`absolute inset-0 ${backgroundSpec.glowLayer}`} />}
                    {backgroundSpec.bottomLayer && <div className={`absolute inset-x-0 bottom-0 h-1/2 ${backgroundSpec.bottomLayer}`} />}
                    {backgroundSpec.vignetteLayer && <div className={`absolute inset-0 ${backgroundSpec.vignetteLayer}`} />}
                </div>
            )}
            {article && activeReadingFilm && theme !== "welcome" && (
                <motion.div
                    key={`reading-theme-${theme}`}
                    className={cn("pointer-events-none fixed inset-0 z-[1]", activeReadingFilm)}
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
                                "absolute inset-0 backdrop-blur-[6px]",
                                shouldUseGlobalBackgroundLayers
                                    ? backgroundSpec.transitionFilm
                                    : (activeReadingFilm ?? "bg-[linear-gradient(180deg,rgba(241,245,249,0.35),rgba(250,245,230,0.32))]")
                            )}
                            initial={{ scale: 1.05, filter: "blur(12px)", opacity: 0.8 }}
                            animate={{ scale: 1, filter: "blur(0px)", opacity: 1 }}
                            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {pendingCatSubmission && (
                    <CatSelfAssessmentDialog
                        open
                        isSubmitting={isSubmittingCatAssessment}
                        isPreparing={isPreparingCatAssessment}
                        onSelect={(value) => {
                            void submitPendingCatSession(value);
                        }}
                        onClose={() => {
                            void submitPendingCatSession(null);
                        }}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {catSettlement && (
                    <motion.div
                        className="fixed inset-0 z-[85]"
                        onClick={() => setCatSettlement(null)}
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
                        <div
                            className="absolute inset-0 flex items-center justify-center px-4"
                            onClick={(event) => event.stopPropagation()}
                        >
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
                                            {catSettlement.alreadyCompleted
                                                ? "本局此前已完成结算，本次仅回放结果，不重复计分"
                                                : formatCatStopReason(catSettlement)}
                                        </p>
                                        {catSettlement.isPendingFinalization && (
                                            <p className="mt-1 text-[11px] font-medium text-slate-500">
                                                正在同步最终结算...
                                            </p>
                                        )}
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
                                {(catSettlement.systemAssessment || catSettlement.selfAssessment || typeof catSettlement.objectiveDelta === "number") && (
                                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                                        <div className="rounded-2xl border border-white/70 bg-white/58 px-4 py-3">
                                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">System Delta</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-900">
                                                {typeof catSettlement.objectiveDelta === "number"
                                                    ? `系统原判 ${catSettlement.objectiveDelta > 0 ? "+" : ""}${catSettlement.objectiveDelta} 分`
                                                    : "系统未标注"}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-white/70 bg-white/58 px-4 py-3">
                                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">System</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-900">
                                                {catSettlement.systemAssessment
                                                    ? CAT_SYSTEM_ASSESSMENT_LABELS[catSettlement.systemAssessment]
                                                    : "系统未标注"}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-white/70 bg-white/58 px-4 py-3">
                                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Self</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-900">
                                                {catSettlement.selfAssessment
                                                    ? CAT_SELF_ASSESSMENT_LABELS[catSettlement.selfAssessment]
                                                    : "未填写自评"}
                                            </p>
                                            {catSettlement.selfAssessment && catSettlementCorrectionSummary && (
                                                <p className="mt-1 text-xs text-slate-600">
                                                    自评倾向 {catSettlementCorrectionSummary.selfSuggestedCorrection > 0 ? "+" : ""}{catSettlementCorrectionSummary.selfSuggestedCorrection} 分
                                                </p>
                                            )}
                                        </div>
                                        <div className="rounded-2xl border border-white/70 bg-white/58 px-4 py-3">
                                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Correction</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-900">
                                                {catSettlementCorrectionSummary?.label ?? "本局无修正"}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-white/70 bg-white/58 px-4 py-3">
                                            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Final Delta</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-900">
                                                最终结算 {catSettlement.delta > 0 ? "+" : ""}{catSettlement.delta} 分
                                            </p>
                                        </div>
                                    </div>
                                )}
                                <div className="mt-5 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setCatSettlement(null)}
                                        className="ui-pressable rounded-full border border-white/75 bg-white/78 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-white/92"
                                        style={getPressableStyle("rgba(15,23,42,0.18)", 4)}
                                    >
                                        关闭，继续阅读
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Navigation Dock */}
            {!routeExitTarget && (
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
                exit={{ opacity: 0 }}
                transition={article
                    ? (isDockVisible
                        ? { type: "spring", stiffness: 320, damping: 32, mass: 0.72 }
                        : { duration: 0.34, ease: [0.4, 0, 1, 1] })
                    : { duration: 0 }}
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
                {article ? (
                    <div className="relative flex w-full max-w-[1400px] flex-nowrap items-center gap-2 rounded-[1.5rem] border-[3px] border-[color:var(--mist-read-bd)] bg-[color:var(--mist-read-bg)] px-3 py-3 shadow-[0_8px_0_var(--mist-read-sd)]">
                        <button
                            onClick={() => {
                                setArticle(null);
                                setArticleStartedAt(null);
                                setIsWritingMode(false);
                                setIsEditMode(false);
                                setIsQuizMode(false);
                                setIsPretestOverlayOpen(false);
                            }}
                            className="ui-pressable group inline-flex h-10 items-center justify-center gap-2 rounded-full border-[3px] border-theme-border bg-theme-primary-bg px-4 text-sm font-black text-theme-primary-text"
                            style={getPressableStyle("var(--theme-shadow)", 4)}
                            title="返回文章列表"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                            <span>返回</span>
                        </button>

                        <div data-tour-target="read-tools" className="ml-auto flex flex-nowrap items-center gap-2">
                            <button
                                onClick={toggleFocusMode}
                                className={cn(
                                    "ui-pressable flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-theme-border transition-all duration-300",
                                    isFocusMode
                                        ? "bg-theme-active-text text-theme-base-bg"
                                        : "bg-theme-card-bg text-theme-text-muted hover:text-theme-text"
                                )}
                                style={getPressableStyle("var(--theme-shadow)", 4)}
                                title="专注模式"
                            >
                                <Flashlight className={cn("h-4 w-4", isFocusMode && "fill-current")} />
                            </button>

                            <button
                                onClick={toggleBionicMode}
                                className={cn(
                                    "ui-pressable flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-theme-border transition-all duration-300",
                                    isBionicMode
                                        ? "bg-theme-active-text text-theme-base-bg"
                                        : "bg-theme-card-bg text-theme-text-muted hover:text-theme-text"
                                )}
                                style={getPressableStyle("var(--theme-shadow)", 4)}
                                title="仿生阅读"
                            >
                                <Eye className={cn("h-4 w-4", isBionicMode && "fill-current")} />
                            </button>

                            <div className="relative">
                                <button
                                    onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                                    className={cn(
                                        "ui-pressable flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-theme-border transition-all",
                                        isThemeMenuOpen ? "bg-theme-primary-bg text-theme-primary-text" : "bg-theme-card-bg text-theme-text-muted hover:text-theme-text"
                                    )}
                                    style={getPressableStyle("var(--theme-shadow)", 4)}
                                    title="外观"
                                >
                                    <Palette className="h-5 w-5" />
                                </button>

                                {isThemeMenuOpen && (
                                    <AppearanceMenu onClose={() => setIsThemeMenuOpen(false)} />
                                )}
                            </div>

                            <button
                                onClick={() => setIsEditMode(!isEditMode)}
                                className={cn(
                                    "ui-pressable flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-theme-border transition-all",
                                    isEditMode ? "bg-theme-active-bg text-theme-active-text" : "bg-theme-card-bg text-theme-text-muted hover:text-theme-text"
                                )}
                                style={getPressableStyle("var(--theme-shadow)", 4)}
                                title="编辑文本"
                            >
                                <Edit3 className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="hidden items-center gap-2 rounded-full border-[3px] border-theme-border bg-theme-primary-bg px-3 py-2 text-sm font-black text-theme-primary-text shadow-[0_4px_0_var(--theme-shadow)] md:flex">
                            已读 {Math.round(scrollProgress * 100)}%
                        </div>

                        <div data-tour-target="read-coin-balance" className="hidden items-center gap-2 rounded-full border-[3px] border-theme-border bg-theme-active-bg px-3 py-2 text-sm font-black text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] md:flex">
                            <span>阅读币</span>
                            <span className="rounded-full border-2 border-theme-border bg-theme-card-bg px-2 py-0.5 text-theme-text">{profile?.reading_coins ?? 0}</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 rounded-full border-4 border-[color:var(--mist-read-bd)] bg-[color:var(--mist-read-bg)] px-3 py-2 shadow-[0_8px_0_0_var(--mist-read-sd)]">
                        <button
                            type="button"
                            onClick={() => handleRouteExit("home")}
                            className="ui-pressable flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-primary-bg text-theme-primary-text"
                            style={getPressableStyle("var(--theme-shadow)", 4)}
                            title="Back to Welcome"
                        >
                            <House className="h-5 w-5" />
                        </button>
                        <div className="px-3">
                            <p className="font-welcome-display text-lg font-black tracking-[-0.03em] text-theme-text">
                                DeepSeek IELTS
                            </p>
                        </div>
                        <div data-tour-target="read-tools" className="relative">
                            <button
                                onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                                className={cn(
                                    "ui-pressable flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-card-bg text-theme-text-muted hover:text-theme-text",
                                    isThemeMenuOpen && "bg-theme-active-bg text-theme-active-text"
                                )}
                                style={getPressableStyle("var(--theme-shadow)", 4)}
                                title="Appearance"
                            >
                                <Palette className="h-5 w-5" />
                            </button>
                            {isThemeMenuOpen && (
                                <AppearanceMenu onClose={() => setIsThemeMenuOpen(false)} />
                            )}
                        </div>
                        <div data-tour-target="read-coin-balance" className="ml-1 hidden items-center gap-2 rounded-full border-[3px] border-theme-border bg-theme-active-bg px-3 py-2 text-sm font-black text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)] md:flex">
                            <span>阅读币</span>
                            <span className="rounded-full bg-theme-card-bg border-2 border-theme-border px-2 py-0.5 text-theme-text">{profile?.reading_coins ?? 0}</span>
                        </div>
                    </div>
                )}
            </motion.nav>
            )}

            <ReadingCoinIsland event={activeReadingCoinFx} />

            {article?.isAIGenerated && article?.difficulty && activeArticleKey ? (
                <ReadPretestOverlay
                    visible={isPretestOverlayOpen}
                    articleTitle={article.title}
                    articleText={article.textContent || article.content}
                    articleKey={activeArticleKey}
                    currentElo={profile?.elo_rating}
                    onClose={() => setIsPretestOverlayOpen(false)}
                    onDirectQuiz={enterQuizMode}
                    onEnterQuiz={enterQuizMode}
                    onMarkCompleted={persistPretestCompletion}
                />
            ) : null}

                <motion.div
                className={cn(
                    showStandardSplitQuiz ? "flex min-h-0 flex-col" : "mt-20",
                    isWritingMode && "h-[calc(100vh-120px)]"
                )}
                initial={{ opacity: 0 }}
                animate={routeExitTarget ? { opacity: 0 } : { opacity: 1 }}
                transition={{ duration: prefersReducedMotion ? 0.18 : (routeExitTarget ? 0.3 : 0.01), ease: pageIntroEase }}
            >
                {catNotice ? (
                    <div className="mx-auto mb-4 flex w-full max-w-4xl flex-col gap-2">
                        <div className="rounded-full border-[3px] border-[#17120d] bg-[#f3e8ff] px-4 py-2 text-center text-sm font-black text-[#7b45e7] shadow-[0_4px_0_rgba(23,18,13,0.08)]">
                            {catNotice}
                        </div>
                    </div>
                ) : null}
                <AnimatePresence mode="wait">
                    {!article ? (
                            <motion.div
                                key="picker"
                                initial="hidden"
                                animate="show"
                                exit="exit"
                                variants={{
                                    hidden: { opacity: 0 },
                                    show: { opacity: 1, transition: { duration: 0.01, staggerChildren: 0.1 } },
                                    exit: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, transition: { duration: 0.15, ease: "easeOut" } }
                                }}
                            className="relative mx-auto flex w-full max-w-[1180px] flex-col gap-6 overflow-hidden pb-16"
                        >
                            {error && (
                                <div className="rounded-[24px] border-4 border-[#fecaca] bg-[#fff1f2] px-5 py-3 text-center text-sm font-semibold text-rose-700 shadow-[0_8px_0_0_#fecaca]">
                                    {error}
                                </div>
                            )}

                            {isLoading && (
                                <div className="rounded-[24px] border-4 border-[#bfdbfe] bg-[#eff6ff] px-5 py-3 text-center text-sm font-semibold text-sky-700 shadow-[0_8px_0_0_#bfdbfe]">
                                    Loading article...
                                </div>
                            )}

                            <div>
                                <RecommendedArticles
                                    onSelect={handleUrlSubmit}
                                    onArticleDeleted={(url) => {
                                        deletedArticleUrlsRef.current.add(url);
                                        setArticle((prev) => prev?.url === url ? null : prev);
                                    }}
                                    onArticleLoaded={(data) => {
                                        const nextArticle = data as ArticleData;
                                        if (nextArticle.url) {
                                            deletedArticleUrlsRef.current.delete(nextArticle.url);
                                        }
                                        setArticle(nextArticle);
                                        setArticleStartedAt(Date.now());
                                        void persistArticleLocally(nextArticle)
                                            .then(() => {
                                                markArticleSnapshotDirty();
                                            })
                                            .catch((persistError) => {
                                                console.error("Failed to persist loaded article:", persistError);
                                            });
                                        if (sessionUser?.id && nextArticle.url) {
                                            void markReadArticleInStore(nextArticle.url);
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
                        </motion.div>
                    ) : (
                        <motion.div
                            key={article.url || article.title}
                            initial="hidden"
                            animate="show"
                            exit="exit"
                            variants={{
                                hidden: { opacity: 0 },
                                show: { opacity: 1, transition: { duration: 0.3, ease: "easeOut" } },
                                exit: { opacity: 0, transition: { duration: 0.15 } }
                            }}
                            className={cn(
                                "relative mx-auto grid w-full max-w-[1440px]",
                                "grid grid-cols-1 gap-6 xl:gap-8 2xl:gap-10",
                            )}
                        >
                        {/* Reading Column */}
                        <motion.div
                            layout
                            transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
                            key={readingViewportKey}
                            ref={readingColumnRef}
                            data-reading-scroll-container="true"
                            className={cn(
                                "space-y-8 xl:space-y-10 overflow-visible mx-auto max-w-4xl",
                                showStandardSplitQuiz && "xl:mr-[440px] xl:max-w-none",
                            )}
                        >
                            <ArticleDisplay
                                title={article.title}
                                content={article.content}
                                byline={article.byline}
                                blocks={article.blocks}
                                siteName={article.siteName}
                                videoUrl={article.videoUrl}
                                articleUrl={article.url}
                                difficulty={article.difficulty}
                                isEditMode={isEditMode}
                                locateRequest={quizLocateRequest}
                                readingNotes={readingNotes}
                                onCreateReadingNote={handleCreateReadingNote}
                                onDeleteReadingMarks={handleDeleteReadingMarks}
                                onArticleSnapshotDirty={markArticleSnapshotDirty}
                                topActionNode={article.isAIGenerated && article.difficulty ? renderQuizToggleButton() : undefined}
                            />

                            <div className="hidden sticky bottom-8 z-40 animate-in slide-in-from-bottom-10 duration-700">
                                <AudioPlayer text={article.textContent || ""} />
                            </div>
                        </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Fixed Quiz Panel — outside grid/motion tree to avoid transform/overflow breaking sticky */}
                <AnimatePresence>
                    {showStandardSplitQuiz && article && (
                        <motion.div
                            initial={{ opacity: 0, x: 36, y: 16, rotate: 3, scale: 0.94 }}
                            animate={{ opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 36, y: 16, rotate: 3, scale: 0.94 }}
                            transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
                            className="fixed top-28 right-10 z-40 origin-bottom-right pointer-events-none"
                        >
                            <div
                                ref={quizPanelWrapperRef}
                                style={quizPanelStyle}
                                className={cn(
                                    "w-[400px] flex flex-col pointer-events-auto",
                                    shouldEnableQuizPanelDrag && "transition-transform duration-75",
                                )}
                            >
                                <div
                                    ref={quizPanelGlassRef}
                                    className="flex max-h-[calc(100vh-120px)] flex-col overflow-hidden rounded-[2rem] border-[3px] border-[#17120d] bg-[#fffaf0] shadow-[0_10px_0_rgba(23,18,13,0.14)]"
                                >
                                    {renderQuizPanel()}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Writing Overlay */}
                {isWritingMode && article && (
                    <WritingEditor
                        articleTitle={article.title}
                        articleContent={article.textContent || article.content}
                        onClose={() => setIsWritingMode(false)}
                    />
                )}

                {/* 阅读页全局聚光灯引导 */}
                {article && !isPretestOverlayOpen && (
                    <SpotlightTour 
                        isOpen={showReadTour} 
                        onClose={handleReadTourComplete} 
                        onComplete={handleReadTourComplete}
                        steps={readTourSteps} 
                    />
                )}

                {/* 阅读页手动唤起引导触发器 */}
                {article && !isPretestOverlayOpen && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        transition={{ delay: 1, type: "spring", stiffness: 300, damping: 20 }}
                        whileHover={{ scale: 1.1, rotate: 15 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowReadTour(true)}
                        className="fixed bottom-6 right-6 z-[2800] flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_6px_0_0_var(--theme-shadow)] active:translate-y-1 active:shadow-[0_2px_0_0_var(--theme-shadow)]"
                        title="开启阅读向导"
                    >
                        <Compass className="h-6 w-6 stroke-[2.5]" />
                    </motion.button>
                )}
            </motion.div>
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
