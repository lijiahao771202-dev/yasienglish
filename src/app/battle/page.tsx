"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect, useCallback, type ComponentType } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DrillCore } from "@/components/drill/DrillCore";
import { Zap, ChevronRight, Lock, House, Sword, CircleHelp, X, BookOpen, Feather, Gauge, Coins, Gift, Blocks, Compass, Target } from "lucide-react";
import { SpotlightTour, type TourStep } from "@/components/ui/SpotlightTour";
import { cn } from "@/lib/utils";
import { getRank } from "@/lib/rankUtils";
import { db } from "@/lib/db";
import { EloChart } from "@/components/battle/EloChart";
import { BattleDrillSelection, shouldRefreshBattleChart } from "@/lib/battleUiState";
import { TOPICS } from "@/lib/battle-topics";
import { RANDOM_SCENARIO_TOPIC } from "@/lib/battle-quickmatch-topics";
import { getPressableStyle, getPressableTap } from "@/lib/pressable";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { getRebuildPracticeTier } from "@/lib/rebuild-mode";

type GuideSectionId = "overview" | "elo" | "dictation" | "translation" | "items" | "drops";

const GUIDE_SECTIONS: Array<{
    id: GuideSectionId;
    title: string;
    subtitle: string;
    icon: ComponentType<{ className?: string }>;
    tone: string;
}> = [
    { id: "overview", title: "总览", subtitle: "Battle 怎么玩", icon: Zap, tone: "text-indigo-700 bg-indigo-50 border-indigo-200" },
    { id: "elo", title: "Elo 规则", subtitle: "分数如何涨跌", icon: Gauge, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    { id: "dictation", title: "Dictation", subtitle: "听写中文", icon: BookOpen, tone: "text-purple-700 bg-purple-50 border-purple-200" },
    { id: "translation", title: "Translation", subtitle: "中译英", icon: Feather, tone: "text-amber-700 bg-amber-50 border-amber-200" },
    { id: "items", title: "道具图鉴", subtitle: "道具作用与用法", icon: Gift, tone: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-200" },
    { id: "drops", title: "掉落机制", subtitle: "奖励来源与概率", icon: Coins, tone: "text-rose-700 bg-rose-50 border-rose-200" },
];

const GUIDE_MARKDOWN: Record<GuideSectionId, string> = {
    overview: `
## Battle 三模式总览

Battle 是一个 **输入 -> 理解 -> 输出** 的闭环训练系统：

1. **Rebuild**：只听音频，用词块把整句拼回去  
2. **Dictation**：把听到的意思重建成中文  
3. **Translation**：再把中文转回自然英文

### 推荐节奏

- 先做 3-5 题 Rebuild 热身
- 切 Dictation 校验“你是否真的听懂”
- 最后用 Translation 把表达打磨成输出能力

这样练，进步速度通常比单模式刷题更稳定。
`,
    elo: `
## Elo 分是什么？

Elo 是 **每个模式的实力分**，不是总分。

- Dictation / Translation 各有独立 Elo
- Rebuild 分成两条线：
- \`sentence\` 只维护本地练习难度
- \`passage\` 使用独立正式 Elo
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

- Dictation Elo 与其它模式 **完全独立**
- \`VISIBLE\` 每题首次开启消耗 \`1\` 个 \`hint_ticket\`
- 同题内重复开关不重复扣费；新题会重新计算首次开启

### 奖励与掉落

- Dictation 也有金币结算与掉落事件
- 结算逻辑独立记入 Dictation Elo，不混入其它模式
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

### 当前 Battle 模式

- **Rebuild：有掉落和奖励**
- **Dictation：有掉落和奖励**
- **Translation：有掉落和奖励**，并且额外有抽卡事件

### 奖励逻辑

奖励不是固定值，而是由“分数表现 + 连胜状态 + 事件触发”叠加计算。  
下方表格给的是当前版本可见规则。
`,
};

const GUIDE_MARKDOWN_COMPONENTS: Components = {
    h1: ({ children }) => <h1 className="mt-1 text-2xl font-black tracking-tight text-theme-text">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-6 border-l-4 border-theme-border pl-3 text-xl font-bold text-theme-text">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-5 text-base font-bold text-theme-text">{children}</h3>,
    p: ({ children }) => <p className="my-3 text-[15px] leading-7 text-theme-text opacity-90">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-5 text-theme-text opacity-90">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-5 text-theme-text opacity-90">{children}</ol>,
    li: ({ children }) => <li className="text-[15px] leading-7 marker:text-theme-text-muted">{children}</li>,
    table: ({ children }) => <div className="my-4 overflow-x-auto rounded-xl border border-theme-border bg-theme-base-bg/70"><table className="min-w-full text-sm">{children}</table></div>,
    thead: ({ children }) => <thead className="bg-theme-card-bg/90 text-theme-text">{children}</thead>,
    th: ({ children }) => <th className="border-b border-theme-border px-3 py-2 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border-b border-theme-border px-3 py-2 align-top text-theme-text opacity-90">{children}</td>,
    blockquote: ({ children }) => <blockquote className="my-4 rounded-xl border-l-4 border-theme-border bg-theme-primary-bg/20 px-4 py-3 text-sm text-theme-text">{children}</blockquote>,
    strong: ({ children }) => <strong className="font-bold text-theme-text">{children}</strong>,
    code: ({ children, className }) => (
        <code className={cn("rounded-md bg-theme-card-bg px-1.5 py-0.5 font-mono text-[13px] text-theme-text border-[1px] border-theme-border/50", className)}>
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
        modes: "Rebuild + Dictation + Translation",
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

function BattlePageContent() {
    type BattleMode = "rebuild" | "dictation" | "translation";
    const router = useRouter();
    const searchParams = useSearchParams();
    const prefersReducedMotion = useReducedMotion();
    const [activeDrill, setActiveDrill] = useState<BattleDrillSelection | null>(null);
    const [eloRating, setEloRating] = useState(400); // Translation
    const [dictationElo, setDictationElo] = useState(400); // Dictation
    const [rebuildPracticeElo, setRebuildPracticeElo] = useState(400);
    const [rebuildBattleElo, setRebuildBattleElo] = useState(400);
    const [rebuildBattleStreak, setRebuildBattleStreak] = useState(0);
    const [battleMode, setBattleMode] = useState<BattleMode>('rebuild');
    const [rebuildVariant, setRebuildVariant] = useState<"sentence" | "passage">("sentence");
    const [rebuildSegmentCount, setRebuildSegmentCount] = useState<2 | 3 | 5>(3);
    const [showGuide, setShowGuide] = useState(false);
    const [activeGuideSection, setActiveGuideSection] = useState<GuideSectionId>("overview");
    const [refreshCount, setRefreshCount] = useState(0);
    const [navTransition, setNavTransition] = useState<"home" | "read" | null>(null);
    const [showBattleTour, setShowBattleTour] = useState(false);

    const activeModeDifficultyElo = battleMode === "translation"
        ? eloRating
        : battleMode === "dictation"
            ? dictationElo
            : (rebuildVariant === "passage" ? rebuildBattleElo : rebuildPracticeElo);


    useEffect(() => {
        const hasAppeared = localStorage.getItem("battle-hub-tour-onboarded");
        if (!hasAppeared) {
            const timer = setTimeout(() => {
                setShowBattleTour(true);
                localStorage.setItem("battle-hub-tour-onboarded", "true");
            }, 800);
            return () => clearTimeout(timer);
        }
    }, []);

    const battleTourSteps: TourStep[] = [
        {
            targetId: "battle-tabs",
            title: "三大硬核实战营",
            content: "重构、听写、翻译。这里不仅是普通的练习场，更是冷酷的排位试炼域。切页，就相当于切换了对应的拷问模块！",
            placement: "bottom"
        },
        {
            targetId: "battle-rebuild-overview",
            title: "Rebuild核心解析",
            content: "您现在挂载的正是 Rebuild 模式。在这个系统里，您需要完全依靠听觉，将碎片化的语料在无生词状态下重新搭建成完美的句型树，极度考验您的短期工作记忆区！",
            placement: "bottom"
        },
        {
            targetId: "battle-rebuild-variants",
            title: "单句练习 vs. 短文排位",
            content: "我们在模式内切分出两套体系：「单句」模式只作为热身赛改变您的隐藏练习层级，而「短文分段」才是真正的上代币排位赛，您的发挥将严格计入最终的主宰 Elo 结算网络！",
            placement: "bottom"
        },
        {
            targetId: "battle-chart",
            title: "全隔离算力雷达",
            content: "各模式互不干涉。系统为您每一项技能铺设了独立隔绝的 Elo 评分池。这意味着您的长难句翻译短板，绝不会拖累您的听音辨识段位！",
            placement: "top"
        },
        {
            targetId: "show-ladder-modal",
            title: "直指毕业天梯",
            content: "我们在后台调配了冷酷的「段位试炼谱系」。每一次涨分都是在强行解锁更变态的被动惩罚机制！请仔细看清上方的每一道防线，把打上 2400+ 冲向大师境当作你在这里的终极毕业目标！",
            placement: "top",
            customModal: (
                <div className="rounded-[2.2rem] bg-theme-base-bg/95 backdrop-blur-xl p-5 md:p-6 shadow-2xl border-4 border-theme-border/50 flex flex-col max-h-full">
                    <div className="shrink-0 mb-4 flex flex-col gap-2 text-center">
                        <span className={cn("mx-auto inline-flex items-center gap-1.5 rounded-full border-2 border-rose-200 bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-rose-600")}>
                            <Target className="h-3 w-3" />
                            Ultimate Goal
                        </span>
                        <h3 className="text-xl font-black text-theme-text tracking-tight">排位机制与底册参数体系</h3>
                        <p className="mx-auto max-w-xl text-xs leading-5 text-theme-text opacity-80">
                            排位分数直接挂钩底层的惩罚网络，得分越高，下发的试题参数越变态。请瞄准 <span className={cn("px-1 font-black text-rose-600")}>2400 (大师)</span> 最终毕业！
                        </p>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3">
                            {(() => {
                                const details = battleMode === "translation" ? TRANSLATION_DIFFICULTY_DETAIL : LISTENING_DIFFICULTY_DETAIL;
                                const reversedDetails = [...details].reverse();
                                return reversedDetails.map((row) => {
                                    const rawElo = row.elo.includes("+") ? parseInt(row.elo.split("+")[0]) : parseInt(row.elo.split("-")[0]);
                                    const isGraduation = rawElo === 2400; 
                                    const isCurrent = activeModeDifficultyElo >= rawElo && (row.elo.includes("+") ? true : activeModeDifficultyElo <= parseInt(row.elo.split("-")[1]!));
                                    const isPunishment = rawElo >= 3200;

                                    return (
                                        <div 
                                            key={row.elo}
                                            className={cn(
                                                "relative flex flex-col rounded-[1.1rem] border-[3px] p-3 transition-all text-left",
                                                isCurrent 
                                                    ? cn("scale-[1.02] shadow-[0_6px_12px_rgba(0,0,0,0.12)] border-theme-base bg-theme-active-bg z-10")
                                                    : "border-theme-border/30 bg-theme-base-bg/80 hover:border-theme-border/60 hover:bg-theme-card-bg"
                                            )}
                                        >
                                            {isCurrent && (
                                                <div className="absolute -top-2.5 -left-2.5 rounded-full bg-theme-base px-2 py-0.5 text-[10px] font-black tracking-widest text-white shadow-lg">
                                                    YOU
                                                </div>
                                            )}
                                            {isGraduation && (
                                                <div className="absolute -right-2 -top-2.5 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black tracking-widest text-amber-950 shadow-md">
                                                    🎯 毕业
                                                </div>
                                            )}
                                            {isPunishment && (
                                                <div className="absolute -right-2 -top-2.5 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black tracking-widest text-white shadow-md">
                                                    ☠️ 极刑
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between mb-2.5 border-b-2 border-theme-border/20 pb-1.5">
                                                <div className="flex items-center gap-1">
                                                    <span className={cn("text-[10px] font-black rounded px-1.5 py-0.5", isCurrent ? "bg-theme-base text-white" : "bg-theme-border/40 text-theme-text-muted")}>
                                                        {row.tier.split(" ")[0]}
                                                    </span>
                                                    <span className={cn("text-base font-black tracking-tight", isCurrent ? "text-theme-text" : "text-theme-text opacity-90")}>
                                                        {row.tier.split(" ")[1]}
                                                    </span>
                                                </div>
                                                <span className={cn("font-mono text-[10px] font-bold tracking-tight", isCurrent ? "text-theme-base" : "text-theme-text border border-theme-border/50 bg-theme-base-bg px-1 rounded-md")}>
                                                    Elo {row.elo}
                                                </span>
                                            </div>

                                            <div className="flex flex-col gap-1.5 mt-auto">
                                                {"audio" in row ? (
                                                    <>
                                                        <div className="flex justify-between items-center bg-theme-base-bg/50 rounded-md px-2 py-0.5">
                                                            <span className="text-[10px] font-bold text-theme-text-muted">词汇跨度</span>
                                                            <span className="text-[11px] font-black text-theme-text text-right">{row.vocab}词</span>
                                                        </div>
                                                        <div className="flex justify-between items-center bg-theme-base-bg/50 rounded-md px-2 py-0.5">
                                                            <span className="text-[10px] font-bold text-theme-text-muted">碎片密度</span>
                                                            <span className="text-[11px] font-black text-theme-text text-right">{row.validateRange}词/句</span>
                                                        </div>
                                                        <div className="flex flex-col bg-theme-base-bg/50 rounded-md px-2 py-0.5">
                                                            <span className="text-[9px] font-bold text-theme-text-muted uppercase">播报风格</span>
                                                            <span className="text-[11px] font-black text-theme-text truncate">{row.audio}</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="flex justify-between items-center bg-theme-base-bg/50 rounded-md px-2 py-0.5">
                                                            <span className="text-[10px] font-bold text-theme-text-muted">衍生词法</span>
                                                            <span className="text-[11px] font-black text-theme-text text-right truncate overflow-hidden max-w-[60%]">{row.vocab}</span>
                                                        </div>
                                                        <div className="flex justify-between items-center bg-theme-base-bg/50 rounded-md px-2 py-0.5">
                                                            <span className="text-[10px] font-bold text-theme-text-muted">跨度</span>
                                                            <span className="text-[11px] font-black text-theme-text text-right">{row.wordRange}</span>
                                                        </div>
                                                        <div className="flex flex-col bg-theme-base-bg/50 rounded-md px-2 py-0.5">
                                                            <span className="text-[9px] font-bold text-theme-text-muted uppercase">语法模型锁定</span>
                                                            <span className="text-[11px] font-black text-theme-text truncate" title={row.syntax}>{row.syntax}</span>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
            )
        },
        {
            targetId: "battle-quick",
            title: "极限智适应匹配",
            content: "拒绝挑挑拣拣！底层算力引擎会立刻扫描您的精确段位上限，在毫秒级冷锻一局强度卡在能力撕裂边缘的绝望试卷！现在，马上结束导览，狠狠砸下这个按钮开启您的破壁第一战！",
            placement: "top"
        }
    ];

    const loadProfile = useCallback(() => {
        db.user_profile.orderBy('id').first().then(async (profile) => {
            if (profile) {
                setEloRating(profile.elo_rating || 400);
                setDictationElo(profile.dictation_elo ?? profile.listening_elo ?? 400);
                setRebuildBattleElo(profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? profile.listening_elo ?? 400);
                setRebuildBattleStreak(profile.rebuild_streak ?? 0);
                const activeUserMeta = await db.sync_meta.get("active_user_id");
                const activeUserId = typeof activeUserMeta?.value === "string" ? activeUserMeta.value : "local";
                const hiddenMeta = await db.sync_meta.get(`rebuild_hidden_elo::${activeUserId}`);
                setRebuildPracticeElo(
                    typeof profile.rebuild_hidden_elo === "number"
                        ? profile.rebuild_hidden_elo
                        : (typeof hiddenMeta?.value === "number" ? hiddenMeta.value : (profile.listening_elo || 400)),
                );
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
        }, prefersReducedMotion ? 160 : target === "home" ? 760 : 560);
    };

    const rebuildBattleRank = getRank(rebuildBattleElo);
    const rebuildTier = getRebuildPracticeTier(rebuildPracticeElo);
    const routeFrom = searchParams.get("from");
    const hasBattleEntry = routeFrom === "home" || routeFrom === "read";
    const battleIntroEase = [0.22, 1, 0.36, 1] as const;

    const buildBattleSelection = useCallback((topic: string): BattleDrillSelection => (
        battleMode === "rebuild"
            ? {
                type: "scenario",
                topic,
                rebuildVariant,
                segmentCount: rebuildVariant === "passage" ? rebuildSegmentCount : 3,
            }
            : {
                type: "scenario",
                topic,
            }
    ), [battleMode, rebuildSegmentCount, rebuildVariant]);
    const sectionByMode: Record<BattleMode, GuideSectionId> = {
        rebuild: "overview",
        dictation: "dictation",
        translation: "translation",
    };
    const activeGuideMeta = GUIDE_SECTIONS.find((item) => item.id === activeGuideSection) ?? GUIDE_SECTIONS[0];
    const battleModeTabs: Array<{ key: BattleMode; label: string; dotClass: string; }> = [
        { key: "rebuild", label: "Rebuild", dotClass: "bg-teal-500" },
        { key: "dictation", label: "Dictation", dotClass: "bg-purple-500" },
        { key: "translation", label: "Translation", dotClass: "bg-indigo-500" },
    ];
    const activeBattleModeIndex = battleModeTabs.findIndex((item) => item.key === battleMode);
    const modeOpacity = (targetMode: BattleMode) => (battleMode === targetMode ? 1 : 0);
    const glassTone = {
        soft: "",
        pill: "",
        active: "",
        hero: "",
        badge: "",
        icon: "",
        marker: "",
        chevron: "text-theme-text",
        textTag: "",
    };

    const cuteTone = {
        cardTint: "bg-theme-card-bg",
        softTint: "bg-theme-base-bg",
        badge: "border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_4px_0_var(--theme-shadow)]",
        button: "border-theme-border bg-theme-primary-bg text-theme-primary-text hover:bg-theme-active-bg transition-colors shadow-[0_4px_0_var(--theme-shadow)]",
        buttonSecondary: "border-theme-border bg-theme-base-bg text-theme-text-muted hover:bg-theme-card-bg hover:text-theme-text transition-colors",
        iconWrap: "border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)]",
        activeTab: "border-theme-border bg-theme-active-bg text-theme-active-text shadow-[0_4px_0_var(--theme-shadow)]",
        inactiveTab: "text-theme-text-muted hover:bg-theme-card-bg hover:text-theme-text",
        miniChip: "border-theme-border bg-theme-base-bg text-theme-text-muted",
        marker: "bg-theme-text",
        heroGlow: "",
    };

    const chunkySurface = "rounded-[2rem] border-4 border-theme-border bg-theme-card-bg shadow-[0_8px_0_var(--theme-shadow)]";
    const chunkySurfaceSoft = "rounded-[1.7rem] border-4 border-theme-border bg-theme-card-bg shadow-[0_6px_0_var(--theme-shadow)]";
    const segmentedShell = "rounded-[1.8rem] border-4 border-theme-border bg-theme-card-bg p-2 shadow-[0_6px_0_var(--theme-shadow)]";
    const activeModeLabel = battleMode === "rebuild"
        ? "Rebuild"
        : battleMode === "dictation"
            ? "Dictation"
            : "Translation";

    return (
        <div className="min-h-screen bg-theme-base-bg text-theme-text font-sans selection:bg-theme-active-bg selection:text-theme-active-text pb-20">
            <div className="fixed inset-0 z-0 pointer-events-none bg-theme-base-bg" />
            <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-theme-base-bg to-transparent opacity-90" />
                <div className="absolute left-[-8%] top-24 h-64 w-64 rounded-full bg-theme-base-bg blur-3xl opacity-50" />
                <div className="absolute right-[-6%] top-32 h-72 w-72 rounded-full bg-theme-base-bg blur-3xl opacity-50" />
                <div className="absolute bottom-[-8%] left-[22%] h-72 w-72 rounded-full bg-theme-base-bg blur-3xl opacity-50" />
                <div className="absolute bottom-10 right-[18%] h-52 w-52 rounded-full bg-theme-base-bg blur-3xl opacity-50" />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(90%_72%_at_50%_0%,rgba(45,212,191,0.12),rgba(20,184,166,0.04)_42%,transparent_74%)]"
                    animate={{ opacity: modeOpacity("rebuild") }}
                    transition={{ duration: 1.25, ease: [0.19, 1, 0.22, 1] }}
                />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(85%_66%_at_50%_0%,rgba(196,181,253,0.12),rgba(168,85,247,0.04)_44%,transparent_74%)]"
                    animate={{ opacity: modeOpacity("dictation") }}
                    transition={{ duration: 1.25, ease: [0.19, 1, 0.22, 1] }}
                />
                <motion.div
                    className="absolute inset-0 bg-[radial-gradient(90%_70%_at_85%_0%,rgba(255,190,116,0.12),rgba(255,138,37,0.03)_42%,transparent_72%)]"
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
                            className="absolute inset-0 bg-theme-base-bg/80 backdrop-blur-[10px]"
                            initial={{ scale: 1.08, filter: "blur(22px)" }}
                            animate={{ scale: 1, filter: "blur(0px)" }}
                            transition={{ duration: 0.76, ease: [0.18, 1, 0.3, 1] }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className={cn("relative z-10 mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-16", activeDrill && "hidden")}
                initial={prefersReducedMotion
                    ? false
                    : {
                        opacity: 0,
                        y: hasBattleEntry ? 24 : 14,
                        scale: 0.988,
                        filter: "blur(14px)",
                    }}
                animate={navTransition
                    ? { opacity: 0, y: 16, scale: 0.985, filter: "blur(8px)" }
                    : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={{ duration: prefersReducedMotion ? 0.18 : 0.58, ease: battleIntroEase }}
            >
                <div className="mb-10 flex justify-center">
                    <div className={cn("flex w-full max-w-3xl flex-wrap items-center justify-center gap-3 px-4 py-3 md:px-5", chunkySurfaceSoft)}>
                        <motion.button
                            initial={{ opacity: 0, y: 22, scale: 0.92, filter: "blur(6px)" }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                            transition={{ delay: 0.02, duration: 0.86, ease: [0.16, 1, 0.3, 1] }}
                            onClick={() => handleNavigateWithCard("home")}
                            className="ui-pressable inline-flex h-14 w-14 items-center justify-center rounded-[1.35rem] border-4 border-theme-border bg-theme-primary-bg text-theme-primary-text hover:bg-theme-active-bg hover:text-theme-active-text"
                            style={getPressableStyle("var(--theme-shadow)", 6)}
                            whileTap={getPressableTap(Boolean(prefersReducedMotion), 6, 0.96)}
                            aria-label="返回欢迎页"
                        >
                            <House className="h-6 w-6" />
                        </motion.button>
                        <div className="rounded-[1.45rem] border-4 border-theme-border bg-theme-card-bg px-5 py-3 text-center shadow-[0_6px_0_var(--theme-shadow)]">
                            <p className="font-newsreader text-[1.55rem] italic leading-none text-theme-text md:text-[1.75rem]">Battle Arena</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleNavigateWithCard("read")}
                            className="ui-pressable inline-flex min-h-14 items-center gap-2 rounded-[1.35rem] border-4 border-theme-border bg-theme-card-bg px-4 py-2.5 text-sm font-bold text-theme-text transition hover:bg-theme-active-bg"
                            style={getPressableStyle("var(--theme-shadow)", 6)}
                        >
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-theme-border/20 bg-theme-base-bg/70">
                                <ChevronRight className="h-4 w-4" />
                            </span>
                            阅读页
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveGuideSection(sectionByMode[battleMode]);
                                setShowGuide(true);
                            }}
                            className="ui-pressable inline-flex min-h-14 items-center gap-2 rounded-[1.35rem] border-4 border-theme-border bg-theme-card-bg px-4 py-2.5 text-sm font-bold text-theme-text transition hover:bg-theme-active-bg"
                            style={getPressableStyle("var(--theme-shadow)", 6)}
                        >
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-theme-border/20 bg-theme-base-bg/70">
                                <CircleHelp className="h-4 w-4" />
                            </span>
                            玩法说明
                        </button>
                        <div className="inline-flex min-h-14 items-center gap-2 rounded-[1.35rem] border-4 border-theme-border px-4 py-2.5 text-sm font-black shadow-[0_6px_0_var(--theme-shadow)] bg-theme-primary-bg text-theme-primary-text">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-theme-border/20 bg-theme-base-bg/70">
                                <Sword className="h-4 w-4" />
                            </span>
                            {activeModeLabel}
                        </div>
                    </div>
                </div>

                <div className="mb-12">
                    <div className={cn("p-5 md:p-6", chunkySurface)}>
                        <div className="space-y-6">
                            <div data-tour-target="battle-tabs" className={cn("relative flex w-full items-center gap-2 overflow-x-auto", segmentedShell)}>
                                <motion.div
                                    className={cn("absolute top-2 h-[calc(100%-16px)] rounded-[1.15rem] border-4", cuteTone.activeTab)}
                                    initial={false}
                                    animate={{
                                        left: `calc(${activeBattleModeIndex} * ((100% - 16px) / 3) + 8px)`,
                                        width: "calc((100% - 16px) / 3)",
                                    }}
                                    transition={{ type: "spring", stiffness: 210, damping: 24, mass: 0.84 }}
                                />
                                {battleModeTabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setBattleMode(tab.key)}
                                        className={cn(
                                            "ui-pressable relative z-10 flex min-w-[140px] flex-1 items-center justify-center gap-2 rounded-[1.15rem] px-4 py-3.5 text-sm font-black transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                            battleMode === tab.key
                                                ? "scale-[1.02] text-stone-900"
                                                : cuteTone.inactiveTab
                                        )}
                                        style={getPressableStyle("rgba(238,232,220,0.95)", 4)}
                                    >
                                        <div className={cn("w-2 h-2 rounded-full", battleMode === tab.key ? `${tab.dotClass} animate-pulse` : "bg-stone-300")} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div data-tour-target="battle-rebuild-overview" className="rounded-[1.6rem] border-4 border-theme-border bg-theme-card-bg p-5 shadow-[0_4px_0_var(--theme-shadow)]">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-theme-text-muted">Drill Source</p>
                                        <p className="mt-1 text-sm leading-7 text-theme-text opacity-90">
                                            {battleMode === "rebuild"
                                                ? rebuildVariant === "passage"
                                                    ? "短文分段当前只开放 AI 出题，并在整篇结束后统一结算正式 Rebuild Elo。"
                                                    : "单句 Rebuild 维持 AI 练习模式，只调整隐藏练习难度。"
                                                : "当前模式继续走 AI 生成。"}
                                        </p>
                                    </div>
                                    <div className="inline-flex items-center gap-2 rounded-full border-4 border-theme-border bg-theme-base-bg px-4 py-2 text-sm font-black text-theme-text-muted shadow-[0_4px_0_var(--theme-shadow)]">
                                        <Blocks className="h-4 w-4" />
                                        AI Only
                                    </div>
                                </div>
                                {battleMode === "rebuild" ? (
                                    <div data-tour-target="battle-rebuild-variants" className="mt-4 space-y-4 border-t-2 border-theme-border/30 pt-4">
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-theme-text-muted">Rebuild Branch</p>
                                                <p className="mt-1 text-sm leading-7 text-theme-text opacity-90">单句保留隐藏练习难度，短文分段使用正式 Elo 和历史曲线。</p>
                                            </div>
                                            <div className="inline-flex items-center gap-2 rounded-full border-4 border-theme-border bg-theme-base-bg p-1.5 shadow-[0_4px_0_var(--theme-shadow)]">
                                                <button
                                                    type="button"
                                                    onClick={() => setRebuildVariant("sentence")}
                                                    className={cn(
                                                        "ui-pressable rounded-full border-4 px-4 py-2 text-sm font-black transition-colors",
                                                        rebuildVariant === "sentence"
                                                            ? "border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_4px_0_var(--theme-shadow)]"
                                                            : "border-transparent bg-transparent text-theme-text-muted hover:bg-theme-card-bg hover:text-theme-text"
                                                    )}
                                                    style={rebuildVariant === "sentence" ? getPressableStyle("var(--theme-shadow)", 4) : undefined}
                                                >
                                                    单句
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setRebuildVariant("passage")}
                                                    className={cn(
                                                        "ui-pressable rounded-full border-4 px-4 py-2 text-sm font-black transition-colors",
                                                        rebuildVariant === "passage"
                                                            ? "border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_4px_0_var(--theme-shadow)]"
                                                            : "border-transparent bg-transparent text-theme-text-muted hover:bg-theme-card-bg hover:text-theme-text"
                                                    )}
                                                    style={rebuildVariant === "passage" ? getPressableStyle("var(--theme-shadow)", 4) : undefined}
                                                >
                                                    短文分段
                                                </button>
                                            </div>
                                        </div>
                                        {rebuildVariant === "passage" ? (
                                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                <div>
                                                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-theme-text-muted">Segments</p>
                                                    <p className="mt-1 text-sm leading-7 text-theme-text opacity-90">一篇短文先按自然语义切段，再逐段完成词块重建。</p>
                                                </div>
                                                <div className="inline-flex items-center gap-2 rounded-full border-4 border-theme-border bg-theme-base-bg p-1.5 shadow-[0_4px_0_var(--theme-shadow)]">
                                                    {([2, 3, 5] as const).map((count) => (
                                                        <button
                                                            key={count}
                                                            type="button"
                                                            onClick={() => setRebuildSegmentCount(count)}
                                                            className={cn(
                                                                "ui-pressable rounded-full border-4 px-4 py-2 text-sm font-black transition-colors",
                                                                rebuildSegmentCount === count
                                                                    ? "border-theme-border bg-theme-primary-bg text-theme-primary-text shadow-[0_4px_0_var(--theme-shadow)]"
                                                                    : "border-transparent bg-transparent text-theme-text-muted hover:bg-theme-card-bg hover:text-theme-text"
                                                            )}
                                                            style={rebuildSegmentCount === count ? getPressableStyle("var(--theme-shadow)", 4) : undefined}
                                                        >
                                                            {count} 段
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>

                            <button
                                data-tour-target="battle-quick"
                                onClick={() => setActiveDrill(buildBattleSelection(RANDOM_SCENARIO_TOPIC))}
                                className={cn("ui-pressable group relative w-full overflow-hidden rounded-[1.6rem] border-4 border-theme-border p-6 text-left transition-all md:p-8", cuteTone.cardTint)}
                                style={getPressableStyle("var(--theme-shadow)", 6)}
                            >
                                <div className={cn("absolute inset-0", cuteTone.heroGlow)} />
                                <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                                    <div className="text-left">
                                        <div className={cn("mb-4 inline-flex items-center gap-2 rounded-full border-4 px-3 py-1 text-xs font-black uppercase tracking-wider", cuteTone.badge)}>
                                            <Zap className="w-3 h-3" />
                                            Quick Match
                                        </div>
                                        <h2 className="mb-2 text-3xl font-black text-stone-900 md:text-5xl">立即开练</h2>
                                        <p className="max-w-2xl text-base leading-8 text-stone-600 md:text-lg">直接进入一局贴合你当前 Elo 的真实场景训练，打开就能开始练。</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-full border-4 border-theme-border bg-theme-base-bg px-4 py-2 text-sm font-black text-theme-text shadow-[0_4px_0_var(--theme-shadow)]">随机场景</div>
                                        <div className={cn("flex h-20 w-20 items-center justify-center rounded-[2rem] border-4 transition-transform group-hover:scale-110 group-hover:rotate-6", cuteTone.iconWrap)}>
                                            <Sword className="h-10 w-10" />
                                        </div>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Elo Chart */}
                <div data-tour-target="battle-chart" className="mb-10">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={`${battleMode}-${refreshCount}`}
                            initial={{ opacity: 0, y: 14, scale: 0.985, filter: "blur(8px)" }}
                            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -10, scale: 0.99, filter: "blur(6px)" }}
                            transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {battleMode === "rebuild" ? (
                                rebuildVariant === "passage" ? (
                                    <div className={cn("relative overflow-hidden p-6 md:p-7", chunkySurface, cuteTone.cardTint)}>
                                        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-theme-text-muted">Rebuild Passage Battle</p>
                                                <h3 className="mt-2 text-2xl font-black text-theme-text">短文分段正式 Elo</h3>
                                                <p className="mt-2 max-w-2xl text-sm leading-7 text-theme-text opacity-90">整篇短文只结算一次正式 Rebuild Elo。每段保留词块重建和自评，最后自动合成为整场 battle 结算。</p>
                                            </div>
                                            <div className="rounded-[1.5rem] border-4 border-theme-border bg-theme-primary-bg/20 px-5 py-4 shadow-[0_6px_0_var(--theme-shadow)]">
                                                <div className="text-xs font-black uppercase tracking-[0.18em] text-theme-text-muted">Rebuild Elo</div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-3xl font-black text-theme-text">{rebuildBattleElo}</span>
                                                    <span className="rounded-full border-[3px] border-theme-border bg-theme-card-bg px-3 py-1 text-sm font-black text-theme-text">{rebuildBattleRank.title}</span>
                                                </div>
                                                <div className="mt-2 text-xs font-bold text-theme-text-muted">当前连胜 {rebuildBattleStreak}</div>
                                            </div>
                                        </div>
                                        <div className="relative z-10 mt-6">
                                            <EloChart mode="rebuild" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className={cn("relative overflow-hidden p-6 md:p-7", chunkySurface, cuteTone.cardTint)}>
                                        <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-theme-text-muted">Rebuild Practice</p>
                                                <h3 className="mt-2 text-2xl font-black text-theme-text">当前练习层：{rebuildTier.label}</h3>
                                                <p className="mt-2 max-w-2xl text-sm leading-7 text-theme-text opacity-90">单句 Rebuild 不改正式 Elo。系统会根据你的自评、重播次数、提示使用和拼句表现，轻微上调或下调下一题难度。</p>
                                            </div>
                                            <div className="rounded-[1.5rem] border-4 border-theme-border bg-theme-primary-bg/20 px-5 py-4 shadow-[0_6px_0_var(--theme-shadow)]">
                                                <div className="text-xs font-black uppercase tracking-[0.18em] text-theme-text-muted">Practice Tier</div>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-3xl font-black text-theme-text">{rebuildTier.cefr}</span>
                                                    <span className="rounded-full border-[3px] border-theme-border bg-theme-card-bg px-3 py-1 text-sm font-black text-theme-text">{rebuildTier.bandPosition}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className={cn("p-5 md:p-6", chunkySurface, cuteTone.cardTint)}>
                                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-stone-500">Battle Progress</p>
                                            <h3 className="mt-2 text-2xl font-black text-stone-900">最近曲线</h3>
                                            <p className="mt-1 text-sm leading-7 text-stone-600">看你在当前模式里的 Elo 变化、段位推进和最近训练节奏。</p>
                                        </div>
                                        <div className={cn("inline-flex items-center gap-2 rounded-full border-4 px-4 py-2 text-sm font-black", cuteTone.badge)}>
                                            <Gauge className="h-4 w-4" />
                                            {activeModeLabel}
                                        </div>
                                    </div>
                                    <EloChart mode={battleMode} />
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Topic Grid */}
                <div data-tour-target="battle-topics" className={cn("p-5 md:p-6", chunkySurface)}>
                    <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h3 className="flex items-center gap-3 text-2xl font-black text-stone-900">
                                <span className={cn("h-8 w-2 rounded-full", cuteTone.marker)} />
                                训练主题
                            </h3>
                            <p className="mt-2 text-sm leading-7 text-stone-600">每张卡片就是一局可爱的 battle 场景，按当前模式和 Elo 自适应难度。</p>
                        </div>
                        <div className={cn("inline-flex items-center gap-2 rounded-full border-4 px-4 py-2 text-sm font-black", cuteTone.badge)}>
                            <Gift className="h-4 w-4" />
                            Topic Academy
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {TOPICS.map((topic, i) => {
                            const isLocked = activeModeDifficultyElo < topic.minElo;
                            return (
                                <motion.div
                                    key={topic.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 + (i * 0.1) }}
                                >
                                    <button
                                        onClick={() => !isLocked && setActiveDrill(buildBattleSelection(topic.title))}
                                        disabled={isLocked}
                                        className={cn(
                                            "ui-pressable group relative h-full w-full overflow-hidden rounded-[1.8rem] border-4 p-6 text-left transition-all duration-300 disabled:shadow-none",
                                            isLocked
                                                ? "cursor-not-allowed border-theme-border/50 bg-theme-base-bg opacity-75"
                                                : cn("border-theme-border bg-theme-card-bg", cuteTone.softTint)
                                        )}
                                        style={getPressableStyle("var(--theme-shadow)", 6)}
                                    >
                                        {!isLocked ? <div className={cn("absolute inset-0 opacity-60", cuteTone.heroGlow)} /> : null}
                                        <div className={cn("relative z-10 mb-4 inline-flex rounded-[1.25rem] border-4 border-white p-3 shadow-[0_8px_18px_rgba(0,0,0,0.1)] transition-transform group-hover:scale-110", topic.color)}>
                                            <topic.icon className="w-6 h-6" />
                                        </div>

                                        <h4 className="relative z-10 mb-1 text-xl font-black text-stone-900">{topic.title}</h4>
                                        <p className="relative z-10 mb-4 text-sm font-medium leading-7 text-stone-600">{topic.description}</p>

                                        {isLocked ? (
                                            <div className="relative z-10 inline-flex items-center gap-2 rounded-full border-4 border-theme-border bg-theme-base-bg px-3 py-1.5 text-xs font-black text-theme-text-muted">
                                                <Lock className="w-3 h-3" /> Requires {topic.minElo} Elo
                                            </div>
                                        ) : (
                                            <div className={cn("absolute bottom-6 right-6 opacity-0 -translate-x-2 transition-all group-hover:translate-x-0 group-hover:opacity-100", glassTone.chevron)}>
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
                        className="fixed inset-0 z-[85] bg-black/30 backdrop-blur-sm p-3 md:p-8"
                        onClick={() => setShowGuide(false)}
                    >
                        <motion.div
                            initial={{ y: 22, scale: 0.98, opacity: 0 }}
                            animate={{ y: 0, scale: 1, opacity: 1 }}
                            exit={{ y: 12, scale: 0.985, opacity: 0 }}
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            onClick={(event) => event.stopPropagation()}
                            className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] border-4 border-theme-border bg-theme-base-bg shadow-[0_35px_100px_rgba(15,23,42,0.18),10px_10px_0_var(--theme-shadow)]"
                        >
                            <div className="flex items-center justify-between border-b-2 border-theme-border/30 px-5 py-4 md:px-7">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-purple-600">Battle Guide</p>
                                    <h2 className="mt-1 text-xl font-black text-stone-900">三模式详细玩法</h2>
                                </div>
                                    <button
                                    onClick={() => setShowGuide(false)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border-4 border-theme-border bg-theme-card-bg text-theme-text transition hover:bg-theme-active-bg"
                                    aria-label="关闭玩法说明"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar overflow-y-auto px-5 py-5 md:px-7 md:py-6">
                                <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                                    <aside className="h-fit rounded-[1.6rem] border-4 border-theme-border bg-theme-card-bg p-3 shadow-[0_6px_0_var(--theme-shadow)]">
                                        <p className="mb-2 px-2 text-[11px] font-black uppercase tracking-[0.18em] text-theme-text-muted">目录</p>
                                        <div className="space-y-1.5">
                                            {GUIDE_SECTIONS.map((section) => {
                                                const Icon = section.icon;
                                                const isActive = activeGuideSection === section.id;
                                                return (
                                                    <button
                                                        key={section.id}
                                                        onClick={() => setActiveGuideSection(section.id)}
                                                        className={cn(
                                                            "w-full rounded-[1rem] border-4 px-2.5 py-2 text-left transition-all",
                                                            isActive
                                                                ? cn("shadow-[0_6px_0_var(--theme-shadow)]", section.tone)
                                                                : "border-transparent bg-theme-base-bg text-theme-text-muted hover:border-theme-border hover:bg-theme-active-bg"
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
                                        <div className={cn("rounded-[1.5rem] border-4 px-4 py-3 shadow-[0_10px_0_rgba(238,232,220,0.95)]", activeGuideMeta.tone)}>
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

                                        {(activeGuideSection === "dictation" || activeGuideSection === "elo" || activeGuideSection === "overview") && (
                                            <div className="rounded-2xl border border-sky-200/80 bg-[linear-gradient(165deg,rgba(224,242,254,0.7),rgba(255,255,255,0.95))] p-4 shadow-[0_14px_28px_rgba(2,132,199,0.12)]">
                                                <div className="mb-3 flex items-center gap-2">
                                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500 text-white">
                                                        <BookOpen className="h-4 w-4" />
                                                    </span>
                                                    <p className="text-sm font-black tracking-[0.14em] uppercase text-sky-700">Dictation 难度细表（词量与长度）</p>
                                                </div>
                                                <div className="overflow-x-auto rounded-xl border border-sky-100 bg-white/90">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-sky-50/90 text-sky-800">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-bold">Elo 区间</th>
                                                                <th className="px-3 py-2 text-left font-bold">段位</th>
                                                                <th className="px-3 py-2 text-left font-bold">词汇量参考</th>
                                                                <th className="px-3 py-2 text-left font-bold">题目词数</th>
                                                                <th className="px-3 py-2 text-left font-bold">评分词数</th>
                                                                <th className="px-3 py-2 text-left font-bold">音频风格</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {LISTENING_DIFFICULTY_DETAIL.map((row, index) => (
                                                                <tr key={row.elo} className={cn(index % 2 === 0 ? "bg-white" : "bg-sky-50/30")}>
                                                                    <td className="border-t border-sky-100 px-3 py-2 font-semibold text-stone-800">{row.elo}</td>
                                                                    <td className="border-t border-sky-100 px-3 py-2 text-stone-700">{row.tier}</td>
                                                                    <td className="border-t border-sky-100 px-3 py-2 text-stone-700">{row.vocab}</td>
                                                                    <td className="border-t border-sky-100 px-3 py-2 text-stone-700">{row.promptRange}</td>
                                                                    <td className="border-t border-sky-100 px-3 py-2 text-stone-700">{row.validateRange}</td>
                                                                    <td className="border-t border-sky-100 px-3 py-2 text-stone-600">{row.audio}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <p className="mt-3 rounded-xl border border-sky-200/80 bg-sky-50/70 px-3 py-2 text-xs leading-6 text-sky-900">
                                                    Dictation 会沿用同一条听力难度梯度，但评分目标只看中文语义重建是否完整。
                                                </p>
                                            </div>
                                        )}

                                        {(activeGuideSection === "translation" || activeGuideSection === "elo" || activeGuideSection === "overview") && (
                                            <div className="rounded-2xl border border-amber-200/80 bg-[linear-gradient(165deg,rgba(255,237,213,0.7),rgba(255,255,255,0.95))] p-4 shadow-[0_14px_28px_rgba(217,119,6,0.12)]">
                                                <div className="mb-3 flex items-center gap-2">
                                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white">
                                                        <Feather className="h-4 w-4" />
                                                    </span>
                                                    <p className="text-sm font-black tracking-[0.14em] uppercase text-amber-700">Translation 难度细表（句长与语法）</p>
                                                </div>
                                                <div className="overflow-x-auto rounded-xl border border-amber-100 bg-white/90">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-amber-50/90 text-amber-800">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-bold">Elo 区间</th>
                                                                <th className="px-3 py-2 text-left font-bold">段位</th>
                                                                <th className="px-3 py-2 text-left font-bold">句长范围</th>
                                                                <th className="px-3 py-2 text-left font-bold">语法复杂度</th>
                                                                <th className="px-3 py-2 text-left font-bold">词汇风格</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {TRANSLATION_DIFFICULTY_DETAIL.map((row, index) => (
                                                                <tr key={row.elo} className={cn(index % 2 === 0 ? "bg-white" : "bg-amber-50/30")}>
                                                                    <td className="border-t border-amber-100 px-3 py-2 font-semibold text-stone-800">{row.elo}</td>
                                                                    <td className="border-t border-amber-100 px-3 py-2 text-stone-700">{row.tier}</td>
                                                                    <td className="border-t border-amber-100 px-3 py-2 text-stone-700">{row.wordRange}</td>
                                                                    <td className="border-t border-amber-100 px-3 py-2 text-stone-700">{row.syntax}</td>
                                                                    <td className="border-t border-amber-100 px-3 py-2 text-stone-600">{row.vocab}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {(activeGuideSection === "items" || activeGuideSection === "overview") && (
                                            <div className="rounded-2xl border border-fuchsia-200/80 bg-[linear-gradient(165deg,rgba(250,232,255,0.68),rgba(255,255,255,0.95))] p-4 shadow-[0_14px_28px_rgba(192,38,211,0.12)]">
                                                <div className="mb-3 flex items-center gap-2">
                                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500 text-white">
                                                        <Gift className="h-4 w-4" />
                                                    </span>
                                                    <p className="text-sm font-black tracking-[0.14em] uppercase text-fuchsia-700">道具图鉴（作用 / 消耗 / 返还）</p>
                                                </div>
                                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                                    {ITEM_ATLAS.map((item) => (
                                                        <div key={item.id} className="rounded-2xl border border-fuchsia-100/80 bg-white/85 p-3 shadow-[0_10px_22px_rgba(167,139,250,0.12)]">
                                                            <div className="mb-2 flex items-start gap-2">
                                                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-200/80 bg-fuchsia-50 text-xl">
                                                                    {item.icon}
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-black text-stone-900">{item.name}</p>
                                                                    <p className="text-xs font-semibold text-fuchsia-700">售价：{item.price} 金币</p>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-1.5 text-xs leading-5 text-stone-700">
                                                                <p><span className="font-bold text-stone-900">作用：</span>{item.effect}</p>
                                                                <p><span className="font-bold text-stone-900">消耗：</span>{item.consume}</p>
                                                                <p><span className="font-bold text-stone-900">返还：</span>{item.refund}</p>
                                                            </div>
                                                            <p className="mt-2 inline-flex rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[11px] font-bold text-fuchsia-700">
                                                                可用模式：{item.modes}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {(activeGuideSection === "drops" || activeGuideSection === "overview") && (
                                            <div className="space-y-4 rounded-2xl border border-rose-200/80 bg-[linear-gradient(165deg,rgba(255,228,230,0.68),rgba(255,255,255,0.95))] p-4 shadow-[0_14px_28px_rgba(225,29,72,0.12)]">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500 text-white">
                                                        <Coins className="h-4 w-4" />
                                                    </span>
                                                    <p className="text-sm font-black tracking-[0.14em] uppercase text-rose-700">奖励与掉落机制</p>
                                                    <span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Rebuild: 有奖励/掉落</span>
                                                    <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-bold text-purple-700">Dictation: 有奖励/掉落</span>
                                                </div>

                                                <div className="overflow-x-auto rounded-xl border border-rose-100 bg-white/90">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-rose-50/90 text-rose-800">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-bold">奖励来源</th>
                                                                <th className="px-3 py-2 text-left font-bold">触发条件</th>
                                                                <th className="px-3 py-2 text-left font-bold">奖励内容</th>
                                                                <th className="px-3 py-2 text-left font-bold">适用模式</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {REWARD_RULES.map((rule, index) => (
                                                                <tr key={rule.source} className={cn(index % 2 === 0 ? "bg-white" : "bg-rose-50/30")}>
                                                                    <td className="border-t border-rose-100 px-3 py-2 font-semibold text-stone-800">{rule.source}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-700">{rule.trigger}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-700">{rule.detail}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-600">{rule.mode}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="overflow-x-auto rounded-xl border border-rose-100 bg-white/90">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-rose-50/90 text-rose-800">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-bold">掉落来源</th>
                                                                <th className="px-3 py-2 text-left font-bold">触发条件</th>
                                                                <th className="px-3 py-2 text-left font-bold">掉落内容</th>
                                                                <th className="px-3 py-2 text-left font-bold">适用模式</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {DROP_RULES.map((rule, index) => (
                                                                <tr key={rule.source} className={cn(index % 2 === 0 ? "bg-white" : "bg-rose-50/30")}>
                                                                    <td className="border-t border-rose-100 px-3 py-2 font-semibold text-stone-800">{rule.source}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-700">{rule.trigger}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-700">{rule.reward}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-600">{rule.mode}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="overflow-x-auto rounded-xl border border-rose-100 bg-white/90">
                                                    <table className="min-w-full text-sm">
                                                        <thead className="bg-rose-50/90 text-rose-800">
                                                            <tr>
                                                                <th className="px-3 py-2 text-left font-bold">抽卡池</th>
                                                                <th className="px-3 py-2 text-left font-bold">可能奖励</th>
                                                                <th className="px-3 py-2 text-left font-bold">权重</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {GACHA_POOL_TABLE.map((row, index) => (
                                                                <tr key={row.pool} className={cn(index % 2 === 0 ? "bg-white" : "bg-rose-50/30")}>
                                                                    <td className="border-t border-rose-100 px-3 py-2 font-semibold text-stone-800">{row.pool}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-700">{row.reward}</td>
                                                                    <td className="border-t border-rose-100 px-3 py-2 text-stone-600">{row.weight}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <p className="rounded-xl border border-theme-border/80 bg-theme-primary-bg/20 px-3 py-2 text-xs leading-6 text-theme-text-muted">
                                                    抽卡事件目前仅在 Translation 触发。Rebuild 与 Dictation 仍有完整金币结算、暴击、隐藏赏金和开题掉落，只是没有抽卡池。
                                                </p>
                                            </div>
                                        )}

                                        <div className="rounded-[1.6rem] border-4 border-theme-border bg-theme-card-bg px-4 py-4 shadow-[0_6px_0_var(--theme-shadow)] md:px-5">
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
                    <motion.div
                        key={`drill-modal-${battleMode}-${activeDrill.type}-${activeDrill.topic || "drill"}-${activeDrill.rebuildVariant || "sentence"}-${activeDrill.segmentCount || 3}`}
                        initial={{ opacity: 0, y: 16, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.98 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed inset-0 z-[100] isolate pointer-events-auto"
                    >
                        <DrillCore
                            context={activeDrill}
                            onClose={handleCloseDrill}
                            initialMode={battleMode}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Compass Manual Trigger */}
            <AnimatePresence>
                {!showGuide && !activeDrill && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setShowBattleTour(true)}
                        className={cn(
                            "fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-theme-border shadow-[0_4px_0_0_var(--theme-shadow)] transition-colors",
                            "bg-theme-primary-bg text-theme-primary-text hover:bg-theme-active-bg hover:text-theme-active-text"
                        )}
                        aria-label="打开功能导览"
                    >
                        <Compass className="h-6 w-6 stroke-[2.5]" />
                    </motion.button>
                )}
            </AnimatePresence>

            <SpotlightTour
                isOpen={showBattleTour}
                onClose={() => setShowBattleTour(false)}
                steps={battleTourSteps}
            />
        </div>
    );
}

export default function BattlePage() {
    return (
        <Suspense fallback={null}>
            <BattlePageContent />
        </Suspense>
    );
}
