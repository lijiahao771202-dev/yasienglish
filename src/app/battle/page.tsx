"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DrillCore } from "@/components/drill/DrillCore";
import { Zap, Flame, ChevronRight, Lock, House, Sword, CircleHelp, X, Headphones, BookOpen, Feather, Gauge, Coins, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRank } from "@/lib/rankUtils";
import { db } from "@/lib/db";
import { EloChart } from "@/components/battle/EloChart";
import { BattleDrillSelection, shouldRefreshBattleChart } from "@/lib/battleUiState";
import { TOPICS } from "@/lib/battle-topics";
import { useAuthSessionUser } from "@/components/auth/AuthSessionContext";
import { applyBackgroundThemeToDocument, BACKGROUND_CHANGED_EVENT, getBackgroundThemeSpec, getSavedBackgroundTheme } from "@/lib/background-preferences";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

type GuideSectionId = "overview" | "elo" | "listening" | "dictation" | "translation" | "items" | "drops";

const GUIDE_SECTIONS: Array<{
    id: GuideSectionId;
    title: string;
    subtitle: string;
    icon: ComponentType<{ className?: string }>;
    tone: string;
}> = [
    { id: "overview", title: "总览", subtitle: "Battle 怎么玩", icon: Zap, tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
    { id: "elo", title: "Elo 规则", subtitle: "分数如何涨跌", icon: Gauge, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    { id: "listening", title: "Listening", subtitle: "听力复述", icon: Headphones, tone: "text-sky-700 bg-sky-50 border-sky-200" },
    { id: "dictation", title: "Dictation", subtitle: "听写中文", icon: BookOpen, tone: "text-purple-700 bg-purple-50 border-purple-200" },
    { id: "translation", title: "Translation", subtitle: "中译英", icon: Feather, tone: "text-amber-700 bg-amber-50 border-amber-200" },
    { id: "items", title: "道具图鉴", subtitle: "道具作用与用法", icon: Gift, tone: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200" },
    { id: "drops", title: "掉落机制", subtitle: "奖励来源与概率", icon: Coins, tone: "text-rose-700 bg-rose-50 border-rose-200" },
];

const GUIDE_MARKDOWN: Record<GuideSectionId, string> = {
    overview: `
## Battle 三模式总览

Battle 是一个 **输入 -> 理解 -> 输出** 的闭环训练系统：

1. **Listening**：先把英语声音吃进去  
2. **Dictation**：把听到的意思重建成中文  
3. **Translation**：再把中文转回自然英文

### 推荐节奏

- 先做 3-5 题 Listening 热身
- 切 Dictation 校验“你是否真的听懂”
- 最后用 Translation 把表达打磨成输出能力

这样练，进步速度通常比单模式刷题更稳定。
`,
    elo: `
## Elo 分是什么？

Elo 是 **每个模式的实力分**，不是总分。

- Listening / Dictation / Translation 各有独立 Elo
- 某一模式涨分，不会直接带动另外两个模式

## Elo 怎么涨跌（当前版本）

| 项目 | 当前规则 |
| --- | --- |
| 模式隔离 | 三模式独立结算 Elo |
| 基础 K | 默认使用 K=40 |
| 连胜加成 | 连胜会提高有效 K（涨跌幅更明显） |
| 难度参与 | 会结合题目难度 Elo 和你当前 Elo 计算期望值 |
| 高分保底 | 高分会触发最低涨分保护（如 9.0+/9.5+） |
| 学习态 | 学习态不结算 Elo / 连胜 / 金币 |

> 直观理解：高质量发挥会稳定涨分；低于预期会掉分；越接近高水平，涨分越看重稳定性。
`,
    listening: `
## Listening（听力复述）

### 目标

听英文后，用麦克风复述，训练“听到就说”的能力。

### 玩法步骤

1. 点击播放原音
2. 点击录音并复述
3. 提交获得评分与 Elo 变化

### 评分重点

- 发音清晰度
- 语流流畅性
- 语义贴合度

### 适合人群

想优先提升口语反应速度、语音稳定度的人。

### 奖励与掉落

- Listening 有正常金币结算
- 存在随机掉落/暴击奖励/隐藏赏金事件
`,
    dictation: `
## Dictation（听写中文）

### 目标

听英文后写中文，训练“听懂并重建信息”的能力。

### 玩法步骤

1. 播放英文音频
2. 在输入区写中文（可意译，但核心信息不能丢）
3. 提交拿 Dictation 专属评分与 Elo

### 评分重点

- 语义准确
- 关键信息覆盖
- 中文表达完整性

### 特殊规则

- Dictation Elo 与 Listening Elo **完全独立**
- \`VISIBLE\` 每题首次开启消耗 \`1\` 个 \`hint_ticket\`
- 同题内重复开关不重复扣费；新题会重新计算首次开启

### 奖励与掉落

- Dictation 也有金币结算与掉落事件
- 结算逻辑独立记入 Dictation Elo，不混入 Listening
`,
    translation: `
## Translation（中译英）

### 目标

把中文题干写成自然英文，训练输出表达精度。

### 玩法步骤

1. 阅读中文题目
2. 输入英文答案
3. 提交查看评分与反馈

### 评分重点

- 语义是否准确
- 语法是否稳定
- 表达是否自然地道

### 适合人群

想从“能表达”进阶到“表达自然、表达高级”的用户。
`,
    items: `
## 道具图鉴说明

下方图鉴已经列出每个道具的：

- 价格
- 作用
- 具体消耗时机
- 失败是否返还
- 可用模式

建议优先把资源投入你当前主练模式，收益最高。
`,
    drops: `
## 掉落与奖励机制总览

### 先回答你的核心问题

- **Listening：有掉落和奖励**
- **Dictation：有掉落和奖励**
- Translation 也有，并且额外有抽卡事件

### 奖励逻辑

奖励不是固定值，而是由“分数表现 + 连胜状态 + 事件触发”叠加计算。  
下方表格给的是当前版本可见规则。
`,
};

const GUIDE_MARKDOWN_COMPONENTS: Components = {
    h1: ({ children }) => <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-6 border-l-4 border-purple-300 pl-3 text-xl font-bold text-stone-900">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-5 text-base font-bold text-purple-700">{children}</h3>,
    p: ({ children }) => <p className="my-3 text-[15px] leading-7 text-stone-700">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 text-stone-700">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 text-stone-700">{children}</ol>,
    li: ({ children }) => <li className="text-[15px] leading-7 marker:text-purple-500">{children}</li>,
    table: ({ children }) => <div className="my-4 overflow-x-auto rounded-xl border border-stone-200 bg-white/70"><table className="min-w-full text-sm">{children}</table></div>,
    thead: ({ children }) => <thead className="bg-stone-100/90 text-stone-700">{children}</thead>,
    th: ({ children }) => <th className="border-b border-stone-200 px-3 py-2 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-stone-200 px-3 py-2 align-top text-stone-700">{children}</td>,
    blockquote: ({ children }) => <blockquote className="my-4 rounded-xl border-l-4 border-purple-300 bg-purple-50/80 px-4 py-3 text-sm text-purple-900">{children}</blockquote>,
    strong: ({ children }) => <strong className="font-bold text-stone-900">{children}</strong>,
    code: ({ children, className }) => (
        <code className={cn("rounded-md bg-purple-100/90 px-1.5 py-0.5 font-mono text-[13px] text-purple-800", className)}>
            {children}
        </code>
    ),
};

const ELO_DIFFICULTY_TABLE = [
    { elo: "0-399", level: "Level 1", cefr: "A1", tier: "新手", desc: "简单 SVO 句子" },
    { elo: "400-799", level: "Level 2", cefr: "A2-", tier: "青铜", desc: "日常复合句" },
    { elo: "800-1199", level: "Level 3", cefr: "A2+", tier: "白银", desc: "简单从句" },
    { elo: "1200-1599", level: "Level 4", cefr: "B1", tier: "黄金", desc: "被动 + 关系从句" },
    { elo: "1600-1999", level: "Level 5", cefr: "B2", tier: "铂金", desc: "条件句 + 分词" },
    { elo: "2000-2399", level: "Level 6", cefr: "C1", tier: "钻石", desc: "倒装 + 虚拟语气" },
    { elo: "2400-2799", level: "Level 7", cefr: "C2", tier: "大师", desc: "母语级表达" },
    { elo: "2800-3199", level: "Level 8", cefr: "C2+", tier: "王者", desc: "极限挑战" },
    { elo: "3200+", level: "Level 9", cefr: "∞", tier: "处决", desc: "惩罚级难度" },
] as const;

const LISTENING_DIFFICULTY_DETAIL = [
    { elo: "0-399", tier: "A1 新手", vocab: "~500", promptRange: "5-7", validateRange: "5-8", audio: "极慢速，孤立词组" },
    { elo: "400-799", tier: "A2- 青铜", vocab: "~1000", promptRange: "8-10", validateRange: "8-12", audio: "短日常句，发音清晰" },
    { elo: "800-1199", tier: "A2+ 白银", vocab: "~1500", promptRange: "8-12", validateRange: "8-14", audio: "中速，基础连读" },
    { elo: "1200-1599", tier: "B1 黄金", vocab: "~3000", promptRange: "12-16", validateRange: "12-18", audio: "自然会话速度" },
    { elo: "1600-1999", tier: "B2 铂金", vocab: "~5000", promptRange: "14-20", validateRange: "14-22", audio: "新闻播报偏快" },
    { elo: "2000-2399", tier: "C1 钻石", vocab: "~7000", promptRange: "18-24", validateRange: "16-26", audio: "辩论语速，习语增多" },
    { elo: "2400-2799", tier: "C2 大师", vocab: "~10000", promptRange: "24-30", validateRange: "20-32", audio: "多说话人风格" },
    { elo: "2800-3199", tier: "C2+ 王者", vocab: "~12000", promptRange: "30-38", validateRange: "24-40", audio: "高密度学术表达" },
    { elo: "3200+", tier: "∞ 处决", vocab: "极高", promptRange: "50+", validateRange: "35+", audio: "极限惩罚级听力" },
] as const;

const TRANSLATION_DIFFICULTY_DETAIL = [
    { elo: "0-399", tier: "A1 新手", wordRange: "5-6 → 6-7", syntax: "简单 SVO，禁止从句", vocab: "Top 200 日常词" },
    { elo: "400-799", tier: "A2- 青铜", wordRange: "6-7 → 8-10", syntax: "单句为主，允许 and/but/so", vocab: "基础生活词" },
    { elo: "800-1199", tier: "A2+ 白银", wordRange: "8-10 → 11-13", syntax: "单主句，尾段可一个 because/when/if", vocab: "常用学习/生活词" },
    { elo: "1200-1599", tier: "B1 黄金", wordRange: "11-13 → 15-18", syntax: "可一个被动或关系从句", vocab: "更丰富表达词" },
    { elo: "1600-1999", tier: "B2 铂金", wordRange: "15-18 → 20-24", syntax: "一个条件句或分词结构", vocab: "中高频抽象词" },
    { elo: "2000-2399", tier: "C1 钻石", wordRange: "20-24 → 27-32", syntax: "一个倒装或虚拟语气", vocab: "高阶逻辑词" },
    { elo: "2400-2799", tier: "C2 大师", wordRange: "28-34 → 38-45", syntax: "复杂复句但强调可读", vocab: "母语级细分表达" },
    { elo: "2800-3199", tier: "C2+ 王者", wordRange: "40-48 → 52-60", syntax: "高复杂度且控制冗长", vocab: "文学/抽象词可出现" },
    { elo: "3200+", tier: "∞ 处决", wordRange: "55-68 → 72-85", syntax: "惩罚级高密度结构", vocab: "稀有词/专业词" },
] as const;

const ITEM_ATLAS = [
    {
        id: "capsule",
        icon: "💊",
        name: "灵感胶囊",
        price: 30,
        effect: "Tab 智能续写提示",
        consume: "触发预测提示时消耗 1 个",
        refund: "无自动返还",
        modes: "Translation",
    },
    {
        id: "hint_ticket",
        icon: "🪄",
        name: "Hint 道具",
        price: 50,
        effect: "显示完整参考句 / Dictation 可开启 VISIBLE",
        consume: "Translation 点 Hint 消耗；Dictation 每题首次开 VISIBLE 消耗",
        refund: "无自动返还",
        modes: "Translation + Dictation",
    },
    {
        id: "vocab_ticket",
        icon: "🧩",
        name: "关键词提示券",
        price: 20,
        effect: "解锁本题关键词提示",
        consume: "首次展开关键词提示时消耗 1 个",
        refund: "无自动返还",
        modes: "Translation",
    },
    {
        id: "audio_ticket",
        icon: "🔊",
        name: "朗读券",
        price: 30,
        effect: "解锁本题参考句播放（可重播/倍速）",
        consume: "Translation 首次解锁参考句音频时消耗 1 个",
        refund: "若播放失败会自动返还 1 张",
        modes: "Translation",
    },
    {
        id: "refresh_ticket",
        icon: "🔄",
        name: "刷新卡",
        price: 40,
        effect: "刷新当前题，不结算该题",
        consume: "点击刷新按钮时消耗 1 张",
        refund: "无自动返还",
        modes: "Listening + Dictation",
    },
] as const;

const REWARD_RULES = [
    { source: "基础金币", trigger: "每次提交评分后", detail: "<6: +2；6-8: +5；>8: +10", mode: "三模式" },
    { source: "连胜加成", trigger: "连胜累计", detail: "3连 +5；5连 +10；10连 +20", mode: "三模式" },
    { source: "暴击奖励", trigger: "10% 概率触发", detail: "当题金币奖励 x5", mode: "三模式" },
    { source: "隐藏赏金-破壁者", trigger: "expected<=0.3 且 score>=9", detail: "+88 金币", mode: "三模式" },
    { source: "隐藏赏金-涅槃重生", trigger: "前两题都<6 且本题>=9", detail: "+100 金币", mode: "三模式" },
    { source: "隐藏赏金-词汇刺客", trigger: "score=10 且 20% 概率", detail: "+50 金币", mode: "三模式" },
] as const;

const DROP_RULES = [
    { source: "开题惊喜掉落", trigger: "生成新题时；连胜>0；5% 概率", reward: "20% 掉 1 胶囊；80% 掉 5-24 金币", mode: "三模式" },
    { source: "抽卡事件（Gacha）", trigger: "Translation 模式；score>8；30% 概率", reward: "5 张卡中抽 1 张（金币或道具）", mode: "仅 Translation" },
] as const;

const GACHA_POOL_TABLE = [
    { pool: "高价值卡（必含1张）", reward: "Hint/刷新卡/2朗读券/50币/100币", weight: "25/20/20/30/5" },
    { pool: "普通卡（其余4张）", reward: "胶囊/关键词券/朗读券/10币/20币", weight: "25/25/20/20/10" },
] as const;

export default function BattlePage() {
    type BattleMode = "listening" | "dictation" | "translation";
    const router = useRouter();
    const sessionUser = useAuthSessionUser();
    const [activeDrill, setActiveDrill] = useState<BattleDrillSelection | null>(null);
    const [eloRating, setEloRating] = useState(600); // Translation
    const [listeningElo, setListeningElo] = useState(600); // Listening
    const [dictationElo, setDictationElo] = useState(600); // Dictation
    const [streak, setStreak] = useState(0);
    const [battleMode, setBattleMode] = useState<BattleMode>('listening');
    const [showGuide, setShowGuide] = useState(false);
    const [activeGuideSection, setActiveGuideSection] = useState<GuideSectionId>("overview");
    const [refreshCount, setRefreshCount] = useState(0);
    const [navTransition, setNavTransition] = useState<"home" | "read" | null>(null);
    const [, forceBackgroundRefresh] = useState(0);

    const loadProfile = useCallback(() => {
        db.user_profile.orderBy('id').first().then(profile => {
            if (profile) {
                setEloRating(profile.elo_rating || 600);
                setListeningElo(profile.listening_elo || 600);
                setDictationElo(profile.dictation_elo ?? profile.listening_elo ?? 600);
                setStreak(profile.streak_count);
            }
        });
    }, []);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const handleCloseDrill = () => {
        if (shouldRefreshBattleChart(activeDrill, null)) {
            setRefreshCount(prev => prev + 1);
        }

        setActiveDrill(null);
        loadProfile();
    };
    const handleNavigateWithCard = (target: "home" | "read") => {
        if (navTransition) return;
        setNavTransition(target);
        setTimeout(() => {
            router.push(target === "home" ? "/?from=battle" : "/read?from=battle");
        }, target === "home" ? 760 : 560);
    };

    const transRank = getRank(eloRating);
    const listenRank = getRank(listeningElo);
    const dictationRank = getRank(dictationElo);
    const sectionByMode: Record<BattleMode, GuideSectionId> = {
        listening: "listening",
        dictation: "dictation",
        translation: "translation",
    };
    const activeGuideMeta = GUIDE_SECTIONS.find((item) => item.id === activeGuideSection) ?? GUIDE_SECTIONS[0];
    const battleModeTabs: Array<{ key: BattleMode; label: string; dotClass: string; }> = [
        { key: "listening", label: "Listening", dotClass: "bg-emerald-500" },
        { key: "dictation", label: "Dictation", dotClass: "bg-purple-500" },
        { key: "translation", label: "Translation", dotClass: "bg-indigo-500" },
    ];
    const activeBattleModeIndex = battleModeTabs.findIndex((item) => item.key === battleMode);
    const backgroundTheme = getSavedBackgroundTheme(sessionUser?.id);
    const backgroundSpec = getBackgroundThemeSpec(backgroundTheme);
    const glassBlendTransition = { duration: 1.85, ease: [0.22, 1, 0.36, 1] as const };
    const glassListeningLayer = "bg-[linear-gradient(140deg,rgba(228,242,255,0.56),rgba(172,210,255,0.26))]";
    const glassDictationLayer = "bg-[linear-gradient(140deg,rgba(248,239,255,0.58),rgba(216,180,254,0.3))]";
    const glassTranslationLayer = "bg-[linear-gradient(140deg,rgba(255,239,217,0.58),rgba(255,192,120,0.28))]";
    const glassListeningHeroLayer = "bg-[linear-gradient(138deg,rgba(226,241,255,0.58),rgba(167,205,255,0.24))]";
    const glassDictationHeroLayer = "bg-[linear-gradient(138deg,rgba(247,238,255,0.6),rgba(206,162,247,0.26))]";
    const glassTranslationHeroLayer = "bg-[linear-gradient(138deg,rgba(255,240,220,0.58),rgba(255,194,132,0.24))]";
    const modeOpacity = (targetMode: BattleMode) => (battleMode === targetMode ? 1 : 0);
    const glassToneByMode: Record<BattleMode, {
        soft: string;
        pill: string;
        active: string;
        hero: string;
        badge: string;
        icon: string;
        marker: string;
        chevron: string;
        textTag: string;
    }> = {
        listening: {
            soft: "border-white/45 shadow-[0_20px_42px_-28px_rgba(32,103,229,0.8),inset_0_1px_0_rgba(255,255,255,0.72)] hover:shadow-[0_24px_48px_-26px_rgba(37,99,235,0.95),inset_0_1px_0_rgba(255,255,255,0.78)]",
            pill: "border-white/45 shadow-[0_16px_38px_-24px_rgba(30,108,235,0.72),inset_0_1px_0_rgba(255,255,255,0.74)]",
            active: "bg-[linear-gradient(135deg,rgba(240,248,255,0.8),rgba(190,221,255,0.46))] shadow-[0_14px_28px_-20px_rgba(37,99,235,0.9),inset_0_1px_0_rgba(255,255,255,0.75)]",
            hero: "shadow-[0_28px_55px_-32px_rgba(37,99,235,0.85),inset_0_1px_0_rgba(255,255,255,0.78)] hover:shadow-[0_34px_70px_-30px_rgba(37,99,235,0.98),inset_0_1px_0_rgba(255,255,255,0.85)]",
            badge: "bg-blue-100/65 text-blue-700",
            icon: "bg-[linear-gradient(140deg,rgba(248,252,255,0.9),rgba(197,225,255,0.55))] text-blue-700 shadow-[0_12px_26px_-16px_rgba(37,99,235,0.9)]",
            marker: "bg-blue-500",
            chevron: "text-blue-600",
            textTag: "text-blue-700 bg-blue-50/80 border-blue-200/70",
        },
        dictation: {
            soft: "border-white/45 shadow-[0_20px_42px_-28px_rgba(147,51,234,0.78),inset_0_1px_0_rgba(255,255,255,0.72)] hover:shadow-[0_24px_48px_-26px_rgba(126,34,206,0.92),inset_0_1px_0_rgba(255,255,255,0.8)]",
            pill: "border-white/45 shadow-[0_16px_38px_-24px_rgba(147,51,234,0.72),inset_0_1px_0_rgba(255,255,255,0.74)]",
            active: "bg-[linear-gradient(135deg,rgba(250,245,255,0.88),rgba(233,213,255,0.52))] shadow-[0_14px_28px_-20px_rgba(147,51,234,0.86),inset_0_1px_0_rgba(255,255,255,0.78)]",
            hero: "shadow-[0_28px_55px_-32px_rgba(147,51,234,0.82),inset_0_1px_0_rgba(255,255,255,0.78)] hover:shadow-[0_34px_70px_-30px_rgba(126,34,206,0.96),inset_0_1px_0_rgba(255,255,255,0.86)]",
            badge: "bg-purple-100/65 text-purple-700",
            icon: "bg-[linear-gradient(140deg,rgba(252,247,255,0.92),rgba(221,214,254,0.58))] text-purple-700 shadow-[0_12px_26px_-16px_rgba(147,51,234,0.85)]",
            marker: "bg-purple-500",
            chevron: "text-purple-600",
            textTag: "text-purple-700 bg-purple-50/80 border-purple-200/70",
        },
        translation: {
            soft: "border-white/45 shadow-[0_20px_42px_-28px_rgba(234,120,24,0.78),inset_0_1px_0_rgba(255,255,255,0.72)] hover:shadow-[0_24px_48px_-26px_rgba(234,120,24,0.95),inset_0_1px_0_rgba(255,255,255,0.8)]",
            pill: "border-white/45 shadow-[0_16px_38px_-24px_rgba(234,120,24,0.72),inset_0_1px_0_rgba(255,255,255,0.74)]",
            active: "bg-[linear-gradient(135deg,rgba(255,249,240,0.84),rgba(255,213,163,0.5))] shadow-[0_14px_28px_-20px_rgba(234,120,24,0.88),inset_0_1px_0_rgba(255,255,255,0.78)]",
            hero: "shadow-[0_28px_55px_-32px_rgba(234,120,24,0.86),inset_0_1px_0_rgba(255,255,255,0.78)] hover:shadow-[0_34px_70px_-30px_rgba(234,120,24,0.98),inset_0_1px_0_rgba(255,255,255,0.86)]",
            badge: "bg-amber-100/65 text-amber-700",
            icon: "bg-[linear-gradient(140deg,rgba(255,252,247,0.9),rgba(255,219,175,0.55))] text-amber-700 shadow-[0_12px_26px_-16px_rgba(234,120,24,0.9)]",
            marker: "bg-amber-500",
            chevron: "text-amber-600",
            textTag: "text-amber-700 bg-amber-50/80 border-amber-200/70",
        },
    };
    const glassTone = glassToneByMode[battleMode];

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

    return (
        <div className="min-h-screen bg-stone-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-20">
            <div className={`fixed inset-0 z-0 pointer-events-none ${backgroundSpec.baseLayer}`} />
            {/* Background Decoration */}
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className={`absolute inset-0 ${backgroundSpec.glassLayer}`} />
                <div className={`absolute inset-0 ${backgroundSpec.glowLayer}`} />
                <div className={`absolute inset-x-0 bottom-0 h-[34%] ${backgroundSpec.bottomLayer}`} />
                <div className={`absolute inset-0 ${backgroundSpec.vignetteLayer}`} />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_0%,rgba(126,181,255,0.22),rgba(64,139,255,0.08)_42%,transparent_72%)]"
                    animate={{ opacity: modeOpacity("listening") }}
                    transition={{ duration: 1.25, ease: [0.19, 1, 0.22, 1] }}
                />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(85%_66%_at_50%_0%,rgba(196,181,253,0.24),rgba(168,85,247,0.1)_44%,transparent_74%)]"
                    animate={{ opacity: modeOpacity("dictation") }}
                    transition={{ duration: 1.25, ease: [0.19, 1, 0.22, 1] }}
                />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,rgba(255,190,116,0.22),rgba(255,138,37,0.08)_42%,transparent_72%)]"
                    animate={{ opacity: modeOpacity("translation") }}
                    transition={{ duration: 1.25, ease: [0.19, 1, 0.22, 1] }}
                />
            </div>

            <AnimatePresence>
                {navTransition && (
                    <motion.div
                        className="fixed inset-0 z-[70] pointer-events-none"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <motion.div
                            className={cn("absolute inset-0 backdrop-blur-[8px]", backgroundSpec.transitionFilm)}
                            initial={{ scale: 1.08, filter: "blur(22px)" }}
                            animate={{ scale: 1, filter: "blur(0px)" }}
                            transition={{ duration: 0.76, ease: [0.18, 1, 0.3, 1] }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className="relative z-10 max-w-6xl mx-auto px-6 py-12 md:py-20"
                animate={navTransition
                    ? { opacity: 0, y: 16, scale: 0.985, filter: "blur(8px)" }
                    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}
            >
                {/* Header Section */}
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-8 mb-16">
                    <div>
                        <div className="mb-6 flex flex-wrap gap-3">
                            <motion.button
                                initial={{ opacity: 0, y: 22, scale: 0.92, filter: "blur(6px)" }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                transition={{ delay: 0.02, duration: 0.86, ease: [0.16, 1, 0.3, 1] }}
                                onClick={() => handleNavigateWithCard("home")}
                                className="group inline-flex items-center gap-2 rounded-2xl border border-white/45 bg-[linear-gradient(135deg,rgba(232,244,255,0.64),rgba(188,220,255,0.34))] px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_14px_32px_-24px_rgba(18,88,203,0.8),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl saturate-[1.45] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:text-slate-900 hover:shadow-[0_22px_42px_-24px_rgba(37,99,235,0.95),inset_0_1px_0_rgba(255,255,255,0.82)]"
                                whileTap={{ scale: 0.965 }}
                            >
                                <motion.span animate={{ x: navTransition === "home" ? -4 : 0 }} transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1] }}>
                                    <House className="h-4 w-4" />
                                </motion.span>
                                返回欢迎页
                            </motion.button>
                            <motion.button
                                initial={{ opacity: 0, y: 22, scale: 0.92, filter: "blur(6px)" }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                transition={{ delay: 0.1, duration: 0.88, ease: [0.16, 1, 0.3, 1] }}
                                onClick={() => handleNavigateWithCard("read")}
                                className="group inline-flex items-center gap-2 rounded-2xl border border-white/45 bg-[linear-gradient(135deg,rgba(239,247,255,0.62),rgba(203,226,255,0.34))] px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-[0_14px_32px_-24px_rgba(18,88,203,0.8),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl saturate-[1.45] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:text-slate-900 hover:shadow-[0_22px_42px_-24px_rgba(37,99,235,0.95),inset_0_1px_0_rgba(255,255,255,0.82)]"
                                whileTap={{ scale: 0.965 }}
                            >
                                <motion.span animate={{ x: navTransition === "read" ? 4 : 0 }} transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1] }}>
                                    <ChevronRight className="h-4 w-4" />
                                </motion.span>
                                打开阅读页面
                            </motion.button>
                            <motion.button
                                initial={{ opacity: 0, y: 22, scale: 0.92, filter: "blur(6px)" }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                                transition={{ delay: 0.18, duration: 0.88, ease: [0.16, 1, 0.3, 1] }}
                                onClick={() => {
                                    setActiveGuideSection(sectionByMode[battleMode]);
                                    setShowGuide(true);
                                }}
                                className="group inline-flex items-center gap-2 rounded-2xl border border-white/45 bg-[linear-gradient(135deg,rgba(252,247,255,0.66),rgba(221,214,254,0.4))] px-4 py-2.5 text-sm font-semibold text-purple-800 shadow-[0_14px_32px_-24px_rgba(124,58,237,0.8),inset_0_1px_0_rgba(255,255,255,0.76)] backdrop-blur-2xl saturate-[1.45] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:text-purple-950 hover:shadow-[0_22px_42px_-24px_rgba(109,40,217,0.95),inset_0_1px_0_rgba(255,255,255,0.84)]"
                                whileTap={{ scale: 0.965 }}
                            >
                                <CircleHelp className="h-4 w-4" />
                                玩法说明
                            </motion.button>
                        </div>
                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-5xl md:text-7xl font-bold text-stone-900 mb-4 tracking-tight"
                        >
                            Battle Arena
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-xl text-stone-500 max-w-lg leading-relaxed font-newsreader italic"
                        >
                            &quot;The only way to learn a language is to fight with it.&quot;
                        </motion.p>
                    </div>

                    {/* Stats Cards Row */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        {/* 1. Listening Stats */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                            className={cn("relative overflow-hidden flex items-center gap-5 p-3 pr-6 rounded-[1.55rem] border backdrop-blur-2xl saturate-[1.42] transition duration-300 hover:-translate-y-0.5", glassTone.soft)}
                        >
                            <motion.div className={cn("absolute inset-0", glassListeningLayer)} animate={{ opacity: modeOpacity("listening") }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassDictationLayer)} animate={{ opacity: modeOpacity("dictation") }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassTranslationLayer)} animate={{ opacity: modeOpacity("translation") }} transition={glassBlendTransition} />
                            <div className={cn("relative z-10 w-16 h-16 rounded-xl flex items-center justify-center shadow-md text-white bg-gradient-to-br border-2 border-white/20 overflow-hidden", listenRank.gradient)}>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                                <listenRank.icon className="w-8 h-8 relative z-10" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border", glassTone.textTag)}>Listening</span>
                                    <div className={cn("w-2 h-2 rounded-full", listenRank.bg.replace('bg-', 'bg-'))} />
                                    <span className="text-xs font-bold text-slate-500">{listenRank.title}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">{listeningElo}</span>
                                    {streak > 1 && (
                                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center text-amber-500 text-xs font-bold">
                                            <Flame className="w-3 h-3 mr-0.5 fill-amber-500" />
                                            Streak
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        {/* 2. Dictation Stats */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className={cn("relative overflow-hidden flex items-center gap-5 p-3 pr-6 rounded-[1.55rem] border backdrop-blur-2xl saturate-[1.42] transition duration-300 hover:-translate-y-0.5", glassTone.soft)}
                        >
                            <motion.div className={cn("absolute inset-0", glassListeningLayer)} animate={{ opacity: modeOpacity("listening") }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassDictationLayer)} animate={{ opacity: modeOpacity("dictation") }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassTranslationLayer)} animate={{ opacity: modeOpacity("translation") }} transition={glassBlendTransition} />
                            <div className={cn("relative z-10 w-16 h-16 rounded-xl flex items-center justify-center shadow-md text-white bg-gradient-to-br border-2 border-white/20 overflow-hidden", dictationRank.gradient)}>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                                <dictationRank.icon className="w-8 h-8 relative z-10" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border", glassTone.textTag)}>Dictation</span>
                                    <div className={cn("w-2 h-2 rounded-full", dictationRank.bg.replace('bg-', 'bg-'))} />
                                    <span className="text-xs font-bold text-slate-500">{dictationRank.title}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">{dictationElo}</span>
                                </div>
                            </div>
                        </motion.div>

                        {/* 3. Translation Stats */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.36 }}
                            className={cn("relative overflow-hidden flex items-center gap-5 p-3 pr-6 rounded-[1.55rem] border backdrop-blur-2xl saturate-[1.42] transition duration-300 hover:-translate-y-0.5", glassTone.soft)}
                        >
                            <motion.div className={cn("absolute inset-0", glassListeningLayer)} animate={{ opacity: modeOpacity("listening") }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassDictationLayer)} animate={{ opacity: modeOpacity("dictation") }} transition={glassBlendTransition} />
                            <motion.div className={cn("absolute inset-0", glassTranslationLayer)} animate={{ opacity: modeOpacity("translation") }} transition={glassBlendTransition} />
                            <div className={cn("relative z-10 w-16 h-16 rounded-xl flex items-center justify-center shadow-md text-white bg-gradient-to-br border-2 border-white/20 overflow-hidden", transRank.gradient)}>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20" />
                                <transRank.icon className="w-8 h-8 relative z-10" />
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn("text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border", glassTone.textTag)}>Translation</span>
                                    <div className={cn("w-2 h-2 rounded-full", transRank.bg.replace('bg-', 'bg-'))} />
                                    <span className="text-xs font-bold text-slate-500">{transRank.title}</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">{eloRating}</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>

                {/* Elo Chart */}
                <div className="mb-12">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={`${battleMode}-${refreshCount}`}
                            initial={{ opacity: 0, y: 14, scale: 0.985, filter: "blur(8px)" }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -10, scale: 0.99, filter: "blur(6px)" }}
                            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                        >
                            <EloChart mode={battleMode} />
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Mode Switcher */}
                <div className="flex justify-center mb-12">
                    <div className={cn("relative flex items-center gap-2 backdrop-blur-2xl saturate-[1.45] p-1.5 rounded-full border", glassTone.pill)}>
                        <motion.div className={cn("absolute inset-0 rounded-full", glassListeningLayer)} animate={{ opacity: modeOpacity("listening") }} transition={glassBlendTransition} />
                        <motion.div className={cn("absolute inset-0 rounded-full", glassDictationLayer)} animate={{ opacity: modeOpacity("dictation") }} transition={glassBlendTransition} />
                        <motion.div className={cn("absolute inset-0 rounded-full", glassTranslationLayer)} animate={{ opacity: modeOpacity("translation") }} transition={glassBlendTransition} />
                        <motion.div
                            className={cn("absolute h-[calc(100%-12px)] top-[6px] rounded-full border border-white/50", glassTone.active)}
                            initial={false}
                            animate={{
                                left: `calc(${activeBattleModeIndex} * ((100% - 12px) / 3) + 6px)`,
                                width: "calc((100% - 12px) / 3)",
                            }}
                            transition={{ type: "spring", stiffness: 210, damping: 24, mass: 0.84 }}
                        />
                        {battleModeTabs.map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setBattleMode(tab.key)}
                                className={cn(
                                    "relative z-10 flex min-w-[122px] items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-bold transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                    battleMode === tab.key
                                        ? "text-slate-900 scale-105"
                                        : "text-slate-600 hover:text-slate-800 hover:bg-white/35"
                                )}
                            >
                                <div className={cn("w-2 h-2 rounded-full", battleMode === tab.key ? `${tab.dotClass} animate-pulse` : "bg-stone-300")} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Quick Start Hero */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-20"
                >
                    <button
                        onClick={() => setActiveDrill({ type: 'scenario', topic: 'Random Scenario' })}
                        className={cn("group relative w-full overflow-hidden rounded-[2.1rem] border border-white/45 text-slate-900 backdrop-blur-[22px] saturate-[1.5] transition-all hover:scale-[1.01]", glassTone.hero)}
                    >
                        <motion.div className={cn("absolute inset-0 z-0", glassListeningHeroLayer)} animate={{ opacity: modeOpacity("listening") }} transition={glassBlendTransition} />
                        <motion.div className={cn("absolute inset-0 z-0", glassDictationHeroLayer)} animate={{ opacity: modeOpacity("dictation") }} transition={glassBlendTransition} />
                        <motion.div className={cn("absolute inset-0 z-0", glassTranslationHeroLayer)} animate={{ opacity: modeOpacity("translation") }} transition={glassBlendTransition} />
                        <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_8%_0%,rgba(255,255,255,0.6),rgba(255,255,255,0.12)_44%,transparent_70%)] z-0" />

                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between p-8 md:p-12 gap-8">
                            <div className="text-left">
                                <div className={cn("inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-white/45", glassTone.badge)}>
                                    <Zap className="w-3 h-3" /> Quick Match
                                </div>
                                <h2 className="text-3xl md:text-5xl font-bold mb-2">Instant Combat</h2>
                                <p className="text-slate-600 text-lg max-w-md">Enter a random real-world scenario tailored to your current Elo level.</p>
                            </div>
                            <div className={cn("w-16 h-16 rounded-full border border-white/55 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-45", glassTone.icon)}>
                                <Sword className="w-8 h-8" />
                            </div>
                        </div>
                    </button>
                </motion.div>

                {/* Topic Grid */}
                <div>
                    <h3 className="text-2xl font-bold text-slate-900 mb-8 flex items-center gap-3">
                        <span className={cn("w-2 h-8 rounded-full", glassTone.marker)} />
                        Theme Academy
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {TOPICS.map((topic, i) => {
                            const isLocked = eloRating < topic.minElo;
                            return (
                                <motion.div
                                    key={topic.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 + (i * 0.1) }}
                                >
                                    <button
                                        onClick={() => !isLocked && setActiveDrill({ type: 'scenario', topic: topic.title })}
                                        disabled={isLocked}
                                        className={cn(
                                            "w-full h-full text-left p-6 rounded-[1.8rem] border transition-all duration-300 relative overflow-hidden group",
                                            isLocked
                                                ? "bg-[linear-gradient(135deg,rgba(235,244,255,0.45),rgba(206,228,255,0.2))] border-white/35 opacity-75 cursor-not-allowed backdrop-blur-xl"
                                                : cn("border-white/45 backdrop-blur-2xl saturate-[1.45] hover:-translate-y-1", glassTone.soft)
                                        )}
                                    >
                                        {!isLocked && (
                                            <>
                                                <motion.div className={cn("absolute inset-0 z-0", glassListeningLayer)} animate={{ opacity: modeOpacity("listening") }} transition={glassBlendTransition} />
                                                <motion.div className={cn("absolute inset-0 z-0", glassDictationLayer)} animate={{ opacity: modeOpacity("dictation") }} transition={glassBlendTransition} />
                                                <motion.div className={cn("absolute inset-0 z-0", glassTranslationLayer)} animate={{ opacity: modeOpacity("translation") }} transition={glassBlendTransition} />
                                            </>
                                        )}
                                        <div className={cn("inline-flex p-3 rounded-2xl mb-4 transition-transform group-hover:scale-110", topic.color)}>
                                            <topic.icon className="w-6 h-6" />
                                        </div>

                                        <h4 className="relative z-10 text-xl font-bold text-slate-800 mb-1">{topic.title}</h4>
                                        <p className="relative z-10 text-sm text-slate-600 font-medium mb-4">{topic.description}</p>

                                        {isLocked ? (
                                            <div className="relative z-10 inline-flex items-center gap-2 text-xs font-bold text-slate-500 bg-white/45 px-3 py-1.5 rounded-full border border-white/45">
                                                <Lock className="w-3 h-3" /> Requires {topic.minElo} Elo
                                            </div>
                                        ) : (
                                            <div className={cn("absolute bottom-6 right-6 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all", glassTone.chevron)}>
                                                <ChevronRight className="w-6 h-6" />
                                            </div>
                                        )}
                                    </button>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {showGuide && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[85] bg-slate-950/55 backdrop-blur-sm p-3 md:p-8"
                        onClick={() => setShowGuide(false)}
                    >
                        <motion.div
                            initial={{ y: 22, scale: 0.98, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 12, scale: 0.985, opacity: 0 }}
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            onClick={(event) => event.stopPropagation()}
                            className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.95),rgba(245,243,255,0.94))] shadow-[0_35px_100px_rgba(15,23,42,0.35)]"
                        >
                            <div className="flex items-center justify-between border-b border-white/65 px-5 py-4 md:px-7">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-purple-600">Battle Guide</p>
                                    <h2 className="mt-1 text-xl font-bold text-stone-900">三模式详细玩法</h2>
                                </div>
                                <button
                                    onClick={() => setShowGuide(false)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-purple-200/70 bg-white/80 text-purple-700 transition hover:bg-purple-50"
                                    aria-label="关闭玩法说明"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar overflow-y-auto px-5 py-5 md:px-7 md:py-6">
                                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                                    <aside className="h-fit rounded-2xl border border-white/70 bg-white/70 p-3 backdrop-blur-xl">
                                        <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-stone-500">目录</p>
                                        <div className="space-y-1.5">
                                            {GUIDE_SECTIONS.map((section) => {
                                                const Icon = section.icon;
                                                const isActive = activeGuideSection === section.id;
                                                return (
                                                    <button
                                                        key={section.id}
                                                        onClick={() => setActiveGuideSection(section.id)}
                                                        className={cn(
                                                            "w-full rounded-xl border px-2.5 py-2 text-left transition-all",
                                                            isActive
                                                                ? cn("shadow-[0_10px_20px_rgba(15,23,42,0.08)]", section.tone)
                                                                : "border-transparent bg-white/60 text-stone-600 hover:border-stone-200 hover:bg-white"
                                                        )}
                                                    >
                                                        <div className="flex items-start gap-2">
                                                            <span className={cn("mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border", isActive ? "border-current/30 bg-white/70" : "border-stone-200 bg-stone-50 text-stone-500")}>
                                                                <Icon className="h-3.5 w-3.5" />
                                                            </span>
                                                            <span>
                                                                <span className="block text-xs font-bold tracking-wide">{section.title}</span>
                                                                <span className="mt-0.5 block text-[11px] opacity-80">{section.subtitle}</span>
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </aside>

                                    <div className="space-y-4">
                                        <div className={cn("rounded-2xl border px-4 py-3 shadow-[0_12px_24px_rgba(15,23,42,0.08)]", activeGuideMeta.tone)}>
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-current/30 bg-white/75">
                                                    <activeGuideMeta.icon className="h-4 w-4" />
                                                </span>
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-[0.18em]">{activeGuideMeta.title}</p>
                                                    <p className="text-xs opacity-80">{activeGuideMeta.subtitle}</p>
                                                </div>
                                                <span className="ml-auto rounded-full border border-current/30 bg-white/75 px-2 py-0.5 text-[11px] font-semibold">
                                                    当前模式：{battleMode}
                                                </span>
                                            </div>
                                        </div>

                                        {(activeGuideSection === "elo" || activeGuideSection === "overview") && (
                                            <div className="rounded-2xl border border-indigo-200/80 bg-[linear-gradient(165deg,rgba(238,242,255,0.82),rgba(255,255,255,0.95))] p-4 shadow-[0_14px_28px_rgba(79,70,229,0.12)]">
                                                <div className="mb-3 flex items-center gap-2">
                                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500 text-white">
                                                        <Gauge className="h-4 w-4" />
                                                    </span>
                                                    <p className="text-sm font-black tracking-[0.14em] uppercase text-indigo-700">难度 / Elo 对应表</p>
                                                </div>
                                                <div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white/85">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-indigo-50/90 text-indigo-700">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-bold">Elo 区间</th>
                                                                <th className="px-3 py-2 text-left font-bold">难度等级</th>
                                                                <th className="px-3 py-2 text-left font-bold">CEFR</th>
                                                                <th className="px-3 py-2 text-left font-bold">段位</th>
                                                                <th className="px-3 py-2 text-left font-bold">题型风格</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {ELO_DIFFICULTY_TABLE.map((row, index) => (
                                                                <tr key={row.level} className={cn(index % 2 === 0 ? "bg-white" : "bg-indigo-50/30")}>
                                                                    <td className="border-t border-indigo-100 px-3 py-2 font-semibold text-stone-800">{row.elo}</td>
                                                                    <td className="border-t border-indigo-100 px-3 py-2 text-stone-700">{row.level}</td>
                                                                    <td className="border-t border-indigo-100 px-3 py-2 text-stone-700">{row.cefr}</td>
                                                                    <td className="border-t border-indigo-100 px-3 py-2 text-stone-700">{row.tier}</td>
                                                                    <td className="border-t border-indigo-100 px-3 py-2 text-stone-600">{row.desc}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        <div className="rounded-2xl border border-white/70 bg-white/78 px-4 py-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)] md:px-5">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={GUIDE_MARKDOWN_COMPONENTS}
                                            >
                                                {GUIDE_MARKDOWN[activeGuideSection]}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Drill Modal */}
            <AnimatePresence>
                {activeDrill && (
                    <DrillCore
                        context={activeDrill}
                        onClose={handleCloseDrill}
                        initialMode={battleMode}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
