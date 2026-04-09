import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";
import {
    normalizeHighlightedMeanings,
    normalizeMorphologyNotes,
    normalizeWordBreakdown,
    type MeaningGroup,
} from "@/lib/vocab-meanings";

// ─── Prompt Templates ────────────────────────────────────────────────

const SYSTEM_PROMPT_FULL = [
    "你是一位IELTS词汇教练，专门帮助中国学生记忆英语单词和短语。",
    "你必须返回合法的 JSON，不要包含任何额外文字。",
    "",
    "## 输出格式要求",
    "",
    "```json",
    "{",
    '  "phonetic": "IPA音标，如 /əˈbaʊnd/",',
    '  "context_meaning": {',
    '    "definition": "结合语境的中文释义，1-2句话",',
    '    "translation": "该词/短语的核心中文翻译，精炼到2-6个字"',
    "  },",
    '  "meaning_groups": [',
    '    { "pos": "v.", "meanings": ["释义1", "释义2", "释义3"] },',
    '    { "pos": "n.", "meanings": ["释义1"] }',
    "  ],",
    '  "highlighted_meanings": ["最常用释义1", "最常用释义2"],',
    '  "word_breakdown": ["词根/词块1", "词根/词块2"],',
    '  "morphology_notes": ["词根词缀解释1", "词根词缀解释2"]',
    "}",
    "```",
    "",
    "## 关键规则",
    "",
    "### meaning_groups（释义分组）",
    "- 按词性分组，每词性最多4个释义",
    "- 释义用中文，简洁精准，不超过15个字",
    "- 最常用的释义排在前面",
    "- 如果是短语/词组，词性用 \"phr.\"",
    "",
    "### ⭐ highlighted_meanings（重点释义）—— 最重要！",
    "- 必须标注1-3个这个词最核心、最高频的释义",
    "- 每一条必须从 meaning_groups 中某个 meanings 数组里原样拷贝",
    "- 字符必须和 meaning_groups 完全一致，一个字都不能改",
    "- 如果有语境，优先标注语境中用到的那个释义",
    "- 如果没有语境，标注日常英语中使用频率最高的释义",
    "- 这个字段绝对不能为空数组！至少标注1个",
    "",
    "### word_breakdown（词根拆解）",
    "- 将单词拆分为有意义的词根、词缀部分",
    "- 如果是短语，拆分为关键构成词",
    "- 简单常见词可以返回空数组",
    "",
    "### morphology_notes（形态学笔记）",
    "- 解释词根词缀的含义和来源",
    "- 帮助记忆的联想或助记",
    "- 简单常见词可以返回空数组",
].join("\n");

const SYSTEM_PROMPT_BATTLE = [
    "你是快速IELTS词汇教练。返回精简JSON，不要多余文字。",
    "输出格式：{\"phonetic\":\"\",\"context_meaning\":{\"definition\":\"\",\"translation\":\"\"},\"meaning_groups\":[{\"pos\":\"\",\"meanings\":[]}],\"highlighted_meanings\":[\"\"],\"word_breakdown\":[],\"morphology_notes\":[]}",
    "",
    "关键：highlighted_meanings 必须从 meaning_groups 原样拷贝最常用的1-2个释义，不能为空！",
].join("\n");

// ─── Few-shot examples ──────────────────────────────────────────────

const FEW_SHOT_WORD_WITH_CONTEXT = [
    {
        role: "user" as const,
        content: [
            'Word: "elaborate"',
            'Context: "She elaborated on her plan during the meeting."',
        ].join("\n"),
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({
            phonetic: "/ɪˈlæbəreɪt/",
            context_meaning: {
                definition: "在会议上对计划进行了详细阐述",
                translation: "详细阐述",
            },
            meaning_groups: [
                { pos: "v.", meanings: ["详细阐述", "精心制作", "详尽说明"] },
                { pos: "adj.", meanings: ["精心设计的", "复杂的", "详尽的"] },
            ],
            highlighted_meanings: ["详细阐述", "精心设计的"],
            word_breakdown: ["e- (出)", "labor (劳动)", "-ate (动词后缀)"],
            morphology_notes: [
                "labor 表示'劳动、工作'，elaborate 原义为'费力打造'",
                "作动词时强调展开细节，作形容词时强调精心复杂",
            ],
        }),
    },
];

const FEW_SHOT_PHRASE_WITH_CONTEXT = [
    {
        role: "user" as const,
        content: [
            'Word or phrase: "sends shivers down my spine"',
            'Context: "The eerie silence of the abandoned hospital sends shivers down my spine."',
        ].join("\n"),
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({
            phonetic: "",
            context_meaning: {
                definition: "废弃医院的诡异寂静让人毛骨悚然、不寒而栗",
                translation: "使人毛骨悚然",
            },
            meaning_groups: [
                { pos: "phr.", meanings: ["使人毛骨悚然", "让人不寒而栗", "令人脊背发凉"] },
            ],
            highlighted_meanings: ["使人毛骨悚然"],
            word_breakdown: ["send (传递)", "shiver (颤抖)", "spine (脊柱)"],
            morphology_notes: [
                "字面义：让颤抖沿脊柱传下去 → 引申为极度恐惧或兴奋的生理反应",
                "常用于描述恐怖、感动或激动的场景",
            ],
        }),
    },
];

const FEW_SHOT_WORD_NO_CONTEXT = [
    {
        role: "user" as const,
        content: 'The user is adding a vocabulary word: "resilient".',
    },
    {
        role: "assistant" as const,
        content: JSON.stringify({
            phonetic: "/rɪˈzɪliənt/",
            context_meaning: {
                definition: "能够从困难中迅速恢复的，有韧性的",
                translation: "有弹性的；坚韧的",
            },
            meaning_groups: [
                { pos: "adj.", meanings: ["有弹性的", "能迅速恢复的", "坚韧不拔的"] },
            ],
            highlighted_meanings: ["能迅速恢复的", "有弹性的"],
            word_breakdown: ["re- (回)", "sil- (跳)", "-ient (形容词后缀)"],
            morphology_notes: [
                "词根 sil-/sal- 来自拉丁语 salire（跳跃），resilient = 弹回来",
                "IELTS写作高频词，常用于描述人的品质或经济/生态系统的恢复力",
            ],
        }),
    },
];

// ─── Helpers ────────────────────────────────────────────────────────

function isPhrase(word: string) {
    return /\s/.test(word.trim());
}

function buildUserPrompt(word: string, context: string, isBattle: boolean): string {
    const phrase = isPhrase(word);

    if (context) {
        if (isBattle) {
            return [
                `${phrase ? "Phrase" : "Word"}: "${word}"`,
                `Context: "${context}"`,
                "返回JSON。highlighted_meanings 必须从 meaning_groups 原样拷贝1-2个最常用释义。",
            ].join("\n");
        }
        return [
            `请分析${phrase ? "短语" : "单词"} "${word}" 在以下语境中的含义：`,
            `"${context}"`,
            "",
            "要求：",
            "1. context_meaning 的 definition 要结合具体语境解释",
            "2. meaning_groups 列出该词所有常见词性的主要释义（最常用排前）",
            `3. highlighted_meanings 必须标注1-3个最核心的释义，从 meaning_groups 原样拷贝，优先标注语境中使用的含义`,
            "4. 释义全部用中文",
        ].join("\n");
    }

    return [
        `用户正在添加${phrase ? "短语" : "生词"}："${word}"`,
        "",
        "要求：",
        "1. meaning_groups 列出所有常见词性的主要释义（最常用排前）",
        "2. highlighted_meanings 必须标注1-2个日常英语中使用频率最高的释义，从 meaning_groups 原样拷贝",
        "3. 释义全部用中文",
    ].join("\n");
}

function selectFewShotExamples(word: string, context: string, isBattle: boolean) {
    if (isBattle) return []; // Skip few-shot for speed in battle mode
    const phrase = isPhrase(word);
    if (context) {
        return phrase ? FEW_SHOT_PHRASE_WITH_CONTEXT : FEW_SHOT_WORD_WITH_CONTEXT;
    }
    return FEW_SHOT_WORD_NO_CONTEXT;
}

/**
 * Server-side fallback: if AI returned meaning_groups but empty highlighted_meanings,
 * auto-pick the first meaning from the first group as highlighted.
 */
function ensureHighlightedMeanings(
    highlighted: string[],
    meaningGroups: MeaningGroup[],
): string[] {
    if (highlighted.length > 0) return highlighted;

    // Fallback: pick the first 1-2 meanings from the first group
    const firstGroup = meaningGroups[0];
    if (!firstGroup || firstGroup.meanings.length === 0) return [];

    return firstGroup.meanings.slice(0, Math.min(2, firstGroup.meanings.length));
}

// ─── Route Handler ──────────────────────────────────────────────────

export async function POST(req: Request) {
    try {
        const { word, context, economyContext, uiSurface } = await req.json() as {
            word?: string;
            context?: string;
            economyContext?: ReadingEconomyContext;
            uiSurface?: string;
        };

        if (!word) {
            return NextResponse.json({ error: "Word is required" }, { status: 400 });
        }

        let readingCoinMutation: {
            balance: number;
            delta: number;
            applied: boolean;
            action: string;
        } | null = null;
        const readContext = isReadEconomyContext(economyContext)
            ? {
                ...economyContext,
                action: economyContext?.action ?? "word_deep_analyze",
            }
            : null;

        if (readContext?.action) {
            const charge = await chargeReadingCoins({
                action: readContext.action,
                dedupeKey: readContext.dedupeKey,
                meta: {
                    articleUrl: readContext.articleUrl ?? null,
                    word,
                    from: "api/ai/define",
                },
            });
            if (!charge.ok && charge.insufficient) {
                return NextResponse.json(
                    insufficientReadingCoinsPayload(readContext.action, charge.required ?? 2, charge.balance),
                    { status: 402 },
                );
            }
            readingCoinMutation = {
                balance: charge.balance,
                delta: charge.delta,
                applied: charge.applied,
                action: charge.action,
            };
        }

        const normalizedContext = typeof context === "string" ? context.trim() : "";
        const isBattlePopup = uiSurface === "battle_word_popup";

        const systemPrompt = isBattlePopup ? SYSTEM_PROMPT_BATTLE : SYSTEM_PROMPT_FULL;
        const userPrompt = buildUserPrompt(word, normalizedContext, isBattlePopup);
        const fewShotMessages = selectFewShotExamples(word, normalizedContext, isBattlePopup);

        let completion;
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                completion = await deepseek.chat.completions.create({
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...fewShotMessages,
                        { role: "user", content: userPrompt },
                    ],
                    model: "deepseek-chat",
                    response_format: { type: "json_object" },
                    temperature: isBattlePopup ? 0.2 : 0.3,
                });
                break; // 成功则跳出循环
            } catch (error: any) {
                lastError = error;
                console.warn(`[API/DeepSeek] Attempt ${attempt} failed:`, error?.message || error);
                if (attempt === 3) throw error;
                // 退避重试，避免被限流（短睡眠）
                await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
            }
        }
        
        if (!completion) throw lastError;

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content);
        const meaningGroups = Array.isArray(result?.meaning_groups)
            ? (result.meaning_groups as MeaningGroup[])
                .filter((group) => group && typeof group.pos === "string" && Array.isArray(group.meanings))
                .map((group) => ({
                    pos: group.pos,
                    meanings: group.meanings
                        .map((meaning) => String(meaning || "").trim())
                        .filter(Boolean)
                        .slice(0, 6),
                }))
                .filter((group) => group.meanings.length > 0)
            : [];

        const rawHighlighted = normalizeHighlightedMeanings(result?.highlighted_meanings);
        const highlightedMeanings = ensureHighlightedMeanings(rawHighlighted, meaningGroups);
        const wordBreakdown = normalizeWordBreakdown(result?.word_breakdown);
        const morphologyNotes = normalizeMorphologyNotes(result?.morphology_notes);

        return NextResponse.json({
            context_meaning: result?.context_meaning,
            phonetic: typeof result?.phonetic === "string" ? result.phonetic : "",
            meaning_groups: meaningGroups,
            highlighted_meanings: highlightedMeanings,
            word_breakdown: wordBreakdown,
            morphology_notes: morphologyNotes,
            readingCoins: readingCoinMutation,
        });

    } catch (error) {
        console.error("DeepSeek API Error:", error);
        return NextResponse.json({ error: "Failed to fetch definition" }, { status: 500 });
    }
}
