import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { deepseek } from "@/lib/deepseek";
import { levelFromScore } from "@/lib/cat-growth";
import {
    CAT_RANK_TIERS,
    getCatMainSkillBand,
    getCatArticleTargets,
    getCatNextRankTier,
    getCatQuizBlueprint,
    getCatSessionPolicy,
    getCatRankTier,
    getCatScoreToNextRank,
    getLegacyBandFromScore,
    getLegacyDifficultyFromScore,
    normalizeCatScore,
    type CatArticleLexicalEvidence,
    type CatArticleLexicalMix,
    type CatArticleTargets,
} from "@/lib/cat-score";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";
import { normalizeThetaFromScore } from "@/lib/cat-rasch";
import { getCatDifficultyScoreOffset } from "@/lib/cat-self-assessment";
import { pickCatTopicSeed, type TopicSelection } from "@/lib/content-topic-pool";

interface StartCatPayload {
    topic?: string;
    band?: number;
    difficultySignalHint?: number;
}

type ObjectiveQuestionType =
    | "multiple_choice"
    | "multiple_select"
    | "true_false_ng"
    | "matching"
    | "fill_blank_choice";

type SessionQuizQuestion = {
    id: number;
    itemId: string;
    type: ObjectiveQuestionType;
    question: string;
    options: string[];
    answer?: string;
    answers?: string[];
    explanation: {
        summary: string;
        reasoning?: string;
        trap?: string;
    };
    sourceParagraph?: string;
    evidence?: string;
    passageIndex: number;
    itemDifficulty: number;
};

type SessionBlueprint = {
    minItems: number;
    maxItems: number;
    targetSe: number;
    stopRule: "precision_first";
    challengeRatioTarget: [number, number];
    passages: Array<{
        passageIndex: number;
        title: string;
        content: string;
        targetScore: number;
        qualityTier: "ok" | "low_confidence";
    }>;
    items: SessionQuizQuestion[];
};

type DraftSelfCheck = {
    sentenceCount: number;
    complexSentenceCount: number;
    multiClauseSentenceCount: number;
    clauseMarkerCount: number;
};

type ArticleDraft = {
    title: string;
    content: string;
    byline: string;
    wordCount: number;
    selfCheck: DraftSelfCheck;
    lexicalMix: CatArticleLexicalMix;
    lexicalEvidence: CatArticleLexicalEvidence;
};

type RawModelDraft = {
    title?: string;
    content?: string;
    byline?: string;
    wordCount?: number;
    selfCheck?: Partial<DraftSelfCheck>;
    lexicalMix?: Partial<CatArticleLexicalMix>;
    lexicalEvidence?: Partial<CatArticleLexicalEvidence>;
};

const CAT_AUDIT_MODE = "single_shot_chat" as const;
const CAT_GENERATION_MODEL = "deepseek-chat" as const;
type CatGenerationTheme = {
    id: string;
    name: string;
    directive: string;
};

const CAT_GENERATION_THEMES: CatGenerationTheme[] = [
    {
        id: "scenario-log",
        name: "场景日志",
        directive: "Ground the passage in one realistic daily or academic scene with concrete actions and outcomes.",
    },
    {
        id: "contrast-brief",
        name: "对照短评",
        directive: "Contrast two approaches, then explain why one works better under specific constraints.",
    },
    {
        id: "problem-solution",
        name: "问题解决",
        directive: "Present a practical problem and a stepwise solution with clear cause-effect links.",
    },
    {
        id: "micro-case",
        name: "微案例",
        directive: "Use a compact case and extract one transferable strategy for readers.",
    },
    {
        id: "evidence-note",
        name: "证据笔记",
        directive: "Introduce a claim, then support it with observable evidence rather than abstract statements.",
    },
    {
        id: "timeline-shift",
        name: "时间线变化",
        directive: "Show past-present-near-future change while keeping logical continuity and accessible style.",
    },
];

function isMissingRpcFunction(error: { message?: string } | null, functionName: string) {
    const message = String(error?.message || "");
    if (!message) return false;
    return message.includes(`public.${functionName}`) && message.toLowerCase().includes("schema cache");
}

function pickRandomCatGenerationTheme() {
    return CAT_GENERATION_THEMES[Math.floor(Math.random() * CAT_GENERATION_THEMES.length)] ?? CAT_GENERATION_THEMES[0];
}

function stripCodeFences(text: string) {
    return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function safeParseJson<T>(text: string): T | null {
    try {
        return JSON.parse(stripCodeFences(text)) as T;
    } catch {
        return null;
    }
}

function tryExtractJsonObject(text: string): string | null {
    if (!text) return null;
    const cleaned = stripCodeFences(text);
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;
    return cleaned.slice(first, last + 1);
}

function parseTaggedDraft(text: string): RawModelDraft | null {
    if (!text.trim()) return null;

    const normalized = text.replace(/\r\n/g, "\n").trim();
    const sectionRegex =
        /\[(Title|Article|LexicalMix|LexicalEvidence)\]\s*([\s\S]*?)(?=\n\[(Title|Article|LexicalMix|LexicalEvidence)\]\s*|$)/gi;

    const sections: Record<string, string> = {};
    for (const match of normalized.matchAll(sectionRegex)) {
        const key = (match[1] || "").trim().toLowerCase();
        const value = (match[2] || "").trim();
        if (key && value) {
            sections[key] = value;
        }
    }

    const article = sections.article || "";
    if (!article) {
        return null;
    }

    const title = (sections.title || article.split("\n")[0] || "CAT Adaptive Reading").trim();

    const mixText = sections.lexicalmix || "";
    const readMix = (key: string) => {
        const matched = mixText.match(new RegExp(`${key}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"));
        if (!matched) return undefined;
        const value = Number(matched[1]);
        if (!Number.isFinite(value)) return undefined;
        return value;
    };

    const evidenceText = sections.lexicalevidence || "";
    const readEvidence = (key: string) => {
        const matched = evidenceText.match(new RegExp(`${key}\\s*:\\s*([^\\n]+)`, "i"));
        if (!matched) return undefined;
        return matched[1]
            .split(/[，,]/g)
            .map((word) => word.trim())
            .filter(Boolean);
    };

    return {
        title,
        content: article,
        byline: "CAT Adaptive Trainer",
        wordCount: article.split(/\s+/).filter(Boolean).length,
        lexicalMix: {
            lower: readMix("lower"),
            core: readMix("core"),
            stretch: readMix("stretch"),
            overlevel: readMix("overlevel"),
        },
        lexicalEvidence: {
            lower: readEvidence("lower"),
            core: readEvidence("core"),
            stretch: readEvidence("stretch"),
            overlevel: readEvidence("overlevel"),
        },
    };
}

function parseModelDraft(raw: string): RawModelDraft | null {
    const jsonCandidate = tryExtractJsonObject(raw);
    if (jsonCandidate) {
        const jsonParsed = safeParseJson<RawModelDraft>(jsonCandidate);
        if (jsonParsed) return jsonParsed;
    }
    return parseTaggedDraft(raw);
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function getParagraphGuidance(wordCountMax: number) {
    if (wordCountMax <= 320) return "2-3 natural paragraphs";
    if (wordCountMax <= 560) return "3-4 natural paragraphs";
    if (wordCountMax <= 850) return "4-5 natural paragraphs";
    return "5-6 natural paragraphs";
}

function formatScoreWindow(minScore: number, maxScore: number | null) {
    return maxScore === null ? `${minScore}+` : `${minScore}-${maxScore}`;
}

function buildRankSystemOverviewLines() {
    return [
        "- 0-599: high-school foundation track (A0, A1, A2).",
        "- 600-1199: CET-4 track (B1, B1+, B2-).",
        "- 1200-1799: CET-6 track (B2, B2+, C1-).",
        "- 1800-2599: TEM-4 / IELTS 6.x track (C1, C1+, C2-, C2).",
        "- 2600-3199: TEM-8 / IELTS 7.x track (C2+, S1, S2).",
        "- 3200+: IELTS 8+ / master track.",
    ];
}

function getStageMeaningSummary(targets: CatArticleTargets) {
    const { rankTarget, contentTarget } = targets;

    if (rankTarget.primaryLabel.includes("预备")) {
        return `- Current stage: entering ${contentTarget.examMapping}. The passage should already belong to this exam family, but remain more guided than a full pass-level text.`;
    }

    if (rankTarget.primaryLabel.includes("强化")) {
        return `- Current stage: reinforced ${contentTarget.examMapping} practice. Use a complete passage with controlled reasoning load and clear evidence paths.`;
    }

    if (rankTarget.primaryLabel.includes("冲刺")) {
        return `- Current stage: late-stage ${contentTarget.examMapping} preparation. Push difficulty close to the exam, but do not cross into the next exam family.`;
    }

    if (rankTarget.primaryLabel.includes("通过") || rankTarget.primaryLabel.includes("稳定")) {
        return `- Current stage: stable ${contentTarget.examMapping} mastery. Use a full passage at this level without drifting into the next exam family.`;
    }

    if (rankTarget.primaryLabel.includes("学术")) {
        return `- Current stage: academic reading band. The passage should sustain denser ideas and evidence tracking without becoming research-paper prose.`;
    }

    if (rankTarget.primaryLabel.includes("高阶") || rankTarget.primaryLabel.includes("专业")) {
        return `- Current stage: high-order professional reading. The text can be dense and analytical, but must still read like a teachable exam passage.`;
    }

    return `- Current stage: ${rankTarget.primaryLabel} (${rankTarget.secondaryLabel}). Keep the article clearly inside this band.`;
}

function getRelativeDifficultyLines(score: number) {
    const current = getCatRankTier(score);
    const previous = CAT_RANK_TIERS.find((tier) => tier.index === current.index - 1) ?? null;
    const next = getCatNextRankTier(score);

    return {
        previousLine: previous
            ? `- Harder than ${previous.primaryLabel} (${previous.secondaryLabel}).`
            : "- Harder than beginner-baseline material.",
        nextLine: next
            ? `- Easier than ${next.primaryLabel} (${next.secondaryLabel}).`
            : "- This is the current ceiling rank; do not artificially cap difficulty below it.",
        previous,
        next,
    };
}

function getAdjacentRankLines(score: number) {
    const current = getCatRankTier(score);
    const previous = CAT_RANK_TIERS.find((tier) => tier.index === current.index - 1) ?? null;
    const next = getCatNextRankTier(score);

    return {
        currentLine: `- Current rank score window: ${formatScoreWindow(current.minScore, current.maxScore)}.`,
        previousLine: previous
            ? `- Previous: ${previous.name} | ${previous.primaryLabel} / ${previous.secondaryLabel} | ${formatScoreWindow(previous.minScore, previous.maxScore)}.`
            : "- Previous: none. This is the opening rank.",
        nextLine: next
            ? `- Next: ${next.name} | ${next.primaryLabel} / ${next.secondaryLabel} | ${formatScoreWindow(next.minScore, next.maxScore)}.`
            : "- Next: none. This is the ceiling rank.",
    };
}

function getDriftGuardLine(targets: CatArticleTargets) {
    const { previous, next } = getRelativeDifficultyLines(targets.score);
    const guardrails = [
        previous ? `${previous.primaryLabel} (${previous.secondaryLabel}) simplicity` : "oversimplified beginner text",
        next ? `${next.primaryLabel} (${next.secondaryLabel}) difficulty` : null,
        targets.contentTarget.examMapping.includes("四级") || targets.contentTarget.examMapping.includes("六级")
            ? "IELTS/TEM-style academic density"
            : null,
    ].filter(Boolean);

    return `- Do not drift into: ${guardrails.join("; ")}.`;
}

function getTopicSourceLine(topicSelection: TopicSelection) {
    return topicSelection.source === "user"
        ? "- Topic source: user-provided topic."
        : "- Topic source: random pool for this score band.";
}

export function buildArticlePrompt(params: {
    topicSelection: TopicSelection;
    targets: CatArticleTargets;
    generationTheme: CatGenerationTheme;
}) {
    const { topicSelection, targets, generationTheme } = params;
    const { lexicalTarget, lengthTarget, syntaxTarget, rankTarget, contentTarget, score } = targets;
    const clauseMarkers =
        "because, although, though, while, whereas, which, that, who, whose, whom, if, when, unless, whether, since, after, before, until, once, provided, despite, where, as";
    const paragraphGuidance = getParagraphGuidance(lengthTarget.wordCountMax);
    const relativeDifficulty = getRelativeDifficultyLines(score);
    const adjacentRanks = getAdjacentRankLines(score);

    return [
        "Task: Generate ONE CAT adaptive reading passage for a Chinese learner.",
        `Topic: ${topicSelection.topicLine}`,
        `Learner score: ${score}`,
        `Rank target: ${rankTarget.name} | ${rankTarget.primaryLabel} / ${rankTarget.secondaryLabel}`,
        `Exam anchor: ${contentTarget.examMapping}`,
        `Content focus: core=${contentTarget.coreDomain}; stretch=${contentTarget.stretchDomain}`,
        "",
        "Mode context:",
        "- This mode generates one adaptive reading passage tuned to the learner's current rank, not a full exam paper.",
        "- The passage should train the learner exactly at the current level boundary and preserve clear pedagogical control.",
        "Rank system overview:",
        ...buildRankSystemOverviewLines(),
        "",
        "Topic context:",
        getTopicSourceLine(topicSelection),
        `- Topic domain: ${topicSelection.domainLabel}.`,
        `- Topic subtopic: ${topicSelection.subtopicLabel}.`,
        `- Topic angle: ${topicSelection.angle}.`,
        "- Keep the article anchored in this topic domain and angle; do not switch to an unrelated field.",
        "",
        "Score interpretation:",
        "- Score scale: internal CAT ladder from 0 to 3200+.",
        "- The raw score is only an internal locator for the product.",
        "- Use the rank target and hard targets below as the true difficulty reference.",
        adjacentRanks.currentLine,
        "",
        "Adjacent ranks:",
        adjacentRanks.previousLine,
        adjacentRanks.nextLine,
        "",
        "Stage meaning:",
        getStageMeaningSummary(targets),
        relativeDifficulty.previousLine,
        relativeDifficulty.nextLine,
        getDriftGuardLine(targets),
        "",
        "Difficulty control map:",
        `- Rank-scale controls: wordCount ${lengthTarget.wordCountMin}-${lengthTarget.wordCountMax}; avg sentence length ${syntaxTarget.sentenceLengthRange[0]}-${syntaxTarget.sentenceLengthRange[1]} words; content focus core=${contentTarget.coreDomain}; stretch=${contentTarget.stretchDomain}.`,
        "- Track-level controls:",
        `- Vocabulary track: core=${lexicalTarget.coreTierLabel}; lower=${lexicalTarget.lowerTierLabel ?? "None"}; stretch=${lexicalTarget.stretchTierLabel}.`,
        `- Overlevel cap: <=${Math.round(lexicalTarget.overlevelMax * 100)}%.`,
        `- Syntax density track: complexSentenceRatio ${Math.round(syntaxTarget.complexSentenceRatioRange[0] * 100)}%-${Math.round(syntaxTarget.complexSentenceRatioRange[1] * 100)}%; multiClauseSentenceRatio ${Math.round(syntaxTarget.multiClauseSentenceRatioRange[0] * 100)}%-${Math.round(syntaxTarget.multiClauseSentenceRatioRange[1] * 100)}%; clauseDensity ${syntaxTarget.clauseDensityRange[0].toFixed(2)}-${syntaxTarget.clauseDensityRange[1].toFixed(2)}.`,
        "",
        "Why this matters:",
        "- The passage is used in adaptive CAT training. Difficulty must match the learner score.",
        "- Keep challenge, but stay inside this exact rank target rather than drifting into the next exam level.",
        "",
        "RANDOM STYLE INJECTION (must apply this generation):",
        `- Theme: ${generationTheme.name}`,
        `- Directive: ${generationTheme.directive}`,
        "",
        "Question-generation readiness:",
        "- The passage will later be turned into objective questions, so preserve evidence traceability.",
        "- Make sure key claims, contrasts, causes, and details can be located in specific sentences or paragraphs.",
        "",
        "THREE-AXIS HARD TARGETS (all required):",
        `1) Lexical ratio (decimal 0-1, not %): core=${lexicalTarget.coreTierLabel} ${Math.round(lexicalTarget.ratios.core[0] * 100)}%-${Math.round(lexicalTarget.ratios.core[1] * 100)}%; lower=${lexicalTarget.lowerTierLabel ?? "None"} ${Math.round(lexicalTarget.ratios.lower[0] * 100)}%-${Math.round(lexicalTarget.ratios.lower[1] * 100)}%; stretch=${lexicalTarget.stretchTierLabel} ${Math.round(lexicalTarget.ratios.stretch[0] * 100)}%-${Math.round(lexicalTarget.ratios.stretch[1] * 100)}%; overlevel<=${Math.round(lexicalTarget.overlevelMax * 100)}%.`,
        `2) Length: wordCount ${lengthTarget.wordCountMin}-${lengthTarget.wordCountMax} (english tokens).`,
        `3) Syntax: average sentence length ${syntaxTarget.sentenceLengthRange[0]}-${syntaxTarget.sentenceLengthRange[1]} words; complexSentenceRatio ${Math.round(syntaxTarget.complexSentenceRatioRange[0] * 100)}%-${Math.round(syntaxTarget.complexSentenceRatioRange[1] * 100)}%; multiClauseSentenceRatio ${Math.round(syntaxTarget.multiClauseSentenceRatioRange[0] * 100)}%-${Math.round(syntaxTarget.multiClauseSentenceRatioRange[1] * 100)}%; clauseDensity ${syntaxTarget.clauseDensityRange[0].toFixed(2)}-${syntaxTarget.clauseDensityRange[1].toFixed(2)}.`,
        "",
        "Writing rules:",
        `- Write a complete passage using ${paragraphGuidance}.`,
        "- Keep the title concise and natural.",
        "- Make the article feel like this rank level, not a shorter teaser and not a harder next-band passage.",
        "- Do not output placeholder text, markdown fences, bullet lists, or commentary.",
        "- Do not mention prompt instructions in the content.",
        "",
        "How syntax is measured by validator:",
        `- Clause markers: ${clauseMarkers}.`,
        "- complex sentence = sentence containing >=1 clause marker.",
        "- multi-clause sentence = sentence containing >=2 clause markers.",
        "- clauseDensity = total clause markers / sentence count.",
        "- Use mostly short independent clauses if you need to reduce density.",
        "",
        "INTERNAL WORKFLOW (must follow before final output):",
        "A. Plan ratio first: choose lexicalMix.lower/core/stretch/overlevel within target bands and make sum about 1.00.",
        "B. Draft the full passage at the target rank level with natural paragraphing.",
        "C. Self-check length + syntax using the validator rules above.",
        "D. Self-check lexicalEvidence: every evidence word MUST appear verbatim in content.",
        "E. If any axis misses, revise internally. Return final result only once.",
        "",
        "OUTPUT FORMAT:",
        "- Do NOT output JSON.",
        "- Do NOT output markdown fence.",
        "- Do NOT output explanation text.",
        "- Use EXACT plain text template below:",
        "[Title]",
        "one short title line",
        "",
        "[Article]",
        "full article content with natural paragraphing",
        "",
        "[LexicalMix]",
        "lower: 0.xx",
        "core: 0.xx",
        "stretch: 0.xx",
        "overlevel: 0.xx",
        "",
        "[LexicalEvidence]",
        "lower: word1, word2",
        "core: word1, word2, word3",
        "stretch: word1, word2",
        "overlevel: word1",
        "",
        "- lexicalEvidence words must appear verbatim in [Article].",
        "- lexicalMix values in [0,1], sum close to 1.00 (0.95-1.05).",
    ].join("\n");
}

function getBearerToken(request: Request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
        return null;
    }

    return token.trim() || null;
}

async function getRecentCatTopicLines(params: {
    dbClient: Awaited<ReturnType<typeof createServerClient>> | ReturnType<typeof createClient>;
    userId: string;
}) {
    const { data } = await params.dbClient
        .from("cat_sessions")
        .select("topic")
        .eq("user_id", params.userId)
        .order("created_at", { ascending: false })
        .limit(24);

    return Array.isArray(data)
        ? data
            .map((row) => (typeof row.topic === "string" ? row.topic.trim() : ""))
            .filter(Boolean)
        : [];
}

function normalizeEvidenceBucket(input: unknown) {
    if (!Array.isArray(input)) return [];
    return input
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 12);
}

function normalizeMixValue(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value)) return 0;
    if (value > 1 && value <= 100) {
        return Math.max(0, Math.min(1, value / 100));
    }
    return Math.max(0, Math.min(1, value));
}

function normalizeDraft(parsed: RawModelDraft): ArticleDraft | null {
    const title = (parsed.title || "").trim();
    const content = (parsed.content || "").trim();
    const byline = (parsed.byline || "CAT Adaptive Trainer").trim();
    if (!content) return null;

    const countedWords = content.split(/\s+/).filter(Boolean).length;

    const selfCheck: DraftSelfCheck = {
        sentenceCount: Math.max(0, Math.round(Number(parsed.selfCheck?.sentenceCount ?? 0))),
        complexSentenceCount: Math.max(0, Math.round(Number(parsed.selfCheck?.complexSentenceCount ?? 0))),
        multiClauseSentenceCount: Math.max(0, Math.round(Number(parsed.selfCheck?.multiClauseSentenceCount ?? 0))),
        clauseMarkerCount: Math.max(0, Math.round(Number(parsed.selfCheck?.clauseMarkerCount ?? 0))),
    };

    const lexicalMix: CatArticleLexicalMix = {
        lower: normalizeMixValue(parsed.lexicalMix?.lower),
        core: normalizeMixValue(parsed.lexicalMix?.core),
        stretch: normalizeMixValue(parsed.lexicalMix?.stretch),
        overlevel: normalizeMixValue(parsed.lexicalMix?.overlevel),
    };

    const lexicalEvidence: CatArticleLexicalEvidence = {
        lower: normalizeEvidenceBucket(parsed.lexicalEvidence?.lower),
        core: normalizeEvidenceBucket(parsed.lexicalEvidence?.core),
        stretch: normalizeEvidenceBucket(parsed.lexicalEvidence?.stretch),
        overlevel: normalizeEvidenceBucket(parsed.lexicalEvidence?.overlevel),
    };

    return {
        title,
        content,
        byline,
        wordCount: Number.isFinite(parsed.wordCount ?? NaN)
            ? Math.max(0, Math.round(Number(parsed.wordCount)))
            : countedWords,
        selfCheck,
        lexicalMix,
        lexicalEvidence,
    };
}

function splitParagraphs(content: string) {
    return content
        .split(/\n\n+/g)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
}


async function generateDraft(params: {
    prompt: string;
    useSharedKey?: boolean;
}) {
    const baseRequest = {
        model: CAT_GENERATION_MODEL,
        messages: [
            {
                role: "system" as const,
                content:
                    "You are an adaptive reading content generator. Follow user constraints exactly and output using the exact plain-text tagged template requested by the user.",
            },
            { role: "user" as const, content: params.prompt },
        ],
        temperature: 0.2,
        max_tokens: 2400,
    };

    const completion = await (async () => {
        if (params.useSharedKey) {
            const sharedKey = process.env.DEEPSEEK_API_KEY?.trim();
            if (!sharedKey) {
                throw new Error("Missing shared DeepSeek API key for single-shot mode.");
            }

            const sharedClient = new OpenAI({
                apiKey: sharedKey,
                baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
            });
            return sharedClient.chat.completions.create(baseRequest);
        }

        return deepseek.chat.completions.create(baseRequest);
    })();

    const message = completion.choices[0]?.message as
        | {
              content?: string | null;
              reasoning_content?: string | null;
          }
        | undefined;

    const content = typeof message?.content === "string" ? message.content : "";
    const reasoningContent = typeof message?.reasoning_content === "string" ? message.reasoning_content : "";

    const rawCandidate = content || reasoningContent || "";
    if (!rawCandidate) return { rawContent: null, draft: null };

    const parsed = parseModelDraft(rawCandidate);
    if (!parsed) return { rawContent: rawCandidate, draft: null };
    return { rawContent: rawCandidate, draft: normalizeDraft(parsed) };
}

async function generateValidatedArticle(params: {
    score: number;
    topicSelection: TopicSelection;
    generationTheme: CatGenerationTheme;
    useSharedKey?: boolean;
}) {
    const difficultyTargets = getCatArticleTargets(params.score);
    const prompt = buildArticlePrompt({
        topicSelection: params.topicSelection,
        targets: difficultyTargets,
        generationTheme: params.generationTheme,
    });

    const generated = await generateDraft({
        prompt,
        useSharedKey: params.useSharedKey,
    });

    if (!generated.draft) {
        return {
            draft: null,
            rawContent: generated.rawContent,
            difficultyTargets,
            model: CAT_GENERATION_MODEL,
        };
    }

    return {
        draft: generated.draft,
        rawContent: generated.rawContent,
        difficultyTargets,
        model: CAT_GENERATION_MODEL,
    };
}


export async function POST(request: Request) {
    try {
        const body = (await request.json().catch(() => ({}))) as StartCatPayload;
        const supabase = await createServerClient();
        const { user, error } = await getServerUserSafely();
        const bearerToken = getBearerToken(request);

        let resolvedUser = user;
        if (!resolvedUser) {
            if (bearerToken) {
                const { data, error: bearerError } = await supabase.auth.getUser(bearerToken);
                resolvedUser = data.user ?? null;
                if (bearerError || !resolvedUser) {
                    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
                }
            } else if (error) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            } else {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        const dbClient = bearerToken
            ? createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
                  auth: {
                      persistSession: false,
                      autoRefreshToken: false,
                  },
                  global: {
                      headers: {
                          Authorization: `Bearer ${bearerToken}`,
                      },
                  },
              })
            : supabase;

        const { data: profile } = await dbClient
            .from("profiles")
            .select("*")
            .eq("user_id", resolvedUser.id)
            .maybeSingle();

        const scoreBefore = normalizeCatScore(Number((profile as Record<string, unknown> | null)?.cat_score ?? 1000));
        const difficultySignalHintRaw = Number(body.difficultySignalHint ?? 0);
        const difficultySignalHint = Number.isFinite(difficultySignalHintRaw)
            ? Math.max(-1, Math.min(1, difficultySignalHintRaw))
            : 0;
        const generationScore = normalizeCatScore(scoreBefore + getCatDifficultyScoreOffset(difficultySignalHint));
        const levelBefore = Number((profile as Record<string, unknown> | null)?.cat_level ?? levelFromScore(scoreBefore));
        const thetaBefore = Number((profile as Record<string, unknown> | null)?.cat_theta ?? normalizeThetaFromScore(scoreBefore));
        const seBefore = clamp(Number((profile as Record<string, unknown> | null)?.cat_se ?? 1.15), 0.22, 2.4);
        const nextBand = getLegacyBandFromScore(generationScore);
        const difficulty = getLegacyDifficultyFromScore(generationScore);
        const rankBefore = getCatRankTier(scoreBefore);
        const scoreToNextRank = getCatScoreToNextRank(scoreBefore);
        const mainSkillBand = getCatMainSkillBand(scoreBefore);
        const requestedTopic = typeof body.topic === "string" ? body.topic : "";
        const recentTopicLines = requestedTopic.trim()
            ? []
            : await getRecentCatTopicLines({
                dbClient,
                userId: resolvedUser.id,
            });
        const topicSeed = pickCatTopicSeed({
            score: generationScore,
            userTopic: requestedTopic,
            recentTopicLines,
        });
        const topic = topicSeed.topicLine;
        const generationTheme = pickRandomCatGenerationTheme();

        const passageOneResult = await generateValidatedArticle({
            score: generationScore,
            topicSelection: topicSeed,
            generationTheme,
            useSharedKey: true,
        });

        if (!passageOneResult.draft) {
            return NextResponse.json(
                {
                    error: "Failed to generate CAT article.",
                    auditMode: CAT_AUDIT_MODE,
                    difficultyTargets: passageOneResult.difficultyTargets,
                },
                { status: 500 },
            );
        }

        const passageOneDraft = passageOneResult.draft;
        const questionBlueprint = getCatQuizBlueprint(generationScore);
        const sessionPolicy = getCatSessionPolicy(generationScore);
        const challengeRatioMin = Math.max(0, Number((sessionPolicy.challengeRatio - 0.08).toFixed(2)));
        const challengeRatioMax = Math.min(1, Number((sessionPolicy.challengeRatio + 0.08).toFixed(2)));
        const sessionBlueprint: SessionBlueprint = {
            minItems: sessionPolicy.minItems,
            maxItems: sessionPolicy.maxItems,
            targetSe: sessionPolicy.targetSe,
            stopRule: "precision_first",
            challengeRatioTarget: [challengeRatioMin, challengeRatioMax],
            passages: [
                {
                    passageIndex: 1,
                    title: passageOneDraft.title || "CAT Short Passage",
                    content: passageOneDraft.content,
                    targetScore: generationScore,
                    qualityTier: "ok",
                },
            ],
            items: [],
        };

        const articleTitle = passageOneDraft.title || `${rankBefore.name} 阅读训练`;
        const articleUrl = `cat://${resolvedUser.id}/${Date.now()}`;
        const blocks = splitParagraphs(passageOneDraft.content).map((paragraph) => ({ type: "paragraph", content: paragraph }));
        const difficultyTargets = passageOneResult.difficultyTargets;
        const qualityTier = "ok" as const;
        const attemptCount = 1;
        const usedReasoner = false;

        let sessionRow: {
            session_id?: string;
            score_before?: number;
            level_before?: number;
            theta_before?: number;
            band?: number;
            difficulty?: string;
            created_at?: string;
        } = {};

        const { data: sessionData, error: sessionError } = await dbClient.rpc("start_cat_session", {
            p_topic: topic,
            p_difficulty: difficulty,
            p_band: nextBand,
            p_article_title: articleTitle,
            p_article_url: articleUrl,
        });

        if (sessionError) {
            if (!isMissingRpcFunction(sessionError, "start_cat_session")) {
                return NextResponse.json({ error: sessionError.message }, { status: 500 });
            }

            const { data: insertedSession, error: insertError } = await dbClient
                .from("cat_sessions")
                .insert({
                    user_id: resolvedUser.id,
                    topic,
                    difficulty,
                    band: nextBand,
                    score_before: scoreBefore,
                    article_title: articleTitle,
                    article_url: articleUrl,
                    status: "started",
                })
                .select("id, band, difficulty, created_at")
                .single();

            if (insertError) {
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }

            sessionRow = {
                session_id: insertedSession.id,
                score_before: scoreBefore,
                level_before: levelBefore,
                theta_before: thetaBefore,
                band: insertedSession.band ?? nextBand,
                difficulty: insertedSession.difficulty ?? difficulty,
                created_at: insertedSession.created_at ?? new Date().toISOString(),
            };
        } else {
            const rpcRow = Array.isArray(sessionData) ? sessionData[0] : sessionData;
            sessionRow = rpcRow ?? {};
        }

        try {
            await dbClient
                .from("cat_sessions")
                .update({
                    session_blueprint: sessionBlueprint,
                    quality_tier: qualityTier,
                    se_before: seBefore,
                    target_se: sessionPolicy.targetSe,
                    item_count: questionBlueprint.questionCount,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", sessionRow?.session_id ?? "");
                // ignore missing column/table errors in older DBs
        } catch {
            // no-op
        }

        return NextResponse.json({
            article: {
                title: articleTitle,
                content: passageOneDraft.content,
                byline: passageOneDraft.byline,
                textContent: passageOneDraft.content,
                blocks,
                url: articleUrl,
                difficulty,
                isAIGenerated: true,
                isCatMode: true,
                catSessionId: sessionRow?.session_id,
                catBand: sessionRow?.band ?? nextBand,
                catScoreSnapshot: scoreBefore,
                catThetaSnapshot: thetaBefore,
                catSeSnapshot: seBefore,
                catRankName: rankBefore.name,
                catRankPrimaryLabel: rankBefore.primaryLabel,
                catRankSecondaryLabel: rankBefore.secondaryLabel,
                catQuizBlueprint: {
                    score: generationScore,
                    questionCount: questionBlueprint.questionCount,
                    ratioBandLabel: questionBlueprint.ratioBandLabel,
                    distribution: questionBlueprint.distribution,
                    allowedTypes: questionBlueprint.allowedTypes,
                },
                catSessionBlueprint: sessionBlueprint,
                catDifficultyProfile: {
                    wordCount: [difficultyTargets.lengthTarget.wordCountMin, difficultyTargets.lengthTarget.wordCountMax],
                    sentenceLength: difficultyTargets.syntaxTarget.sentenceLengthRange,
                    complexSentenceRatio: difficultyTargets.syntaxTarget.complexSentenceRatioRange,
                    multiClauseSentenceRatio: difficultyTargets.syntaxTarget.multiClauseSentenceRatioRange,
                    clauseDensity: difficultyTargets.syntaxTarget.clauseDensityRange,
                    lexicalRatios: difficultyTargets.lexicalTarget.ratios,
                },
                generationTheme: {
                    id: generationTheme.id,
                    name: generationTheme.name,
                },
            },
            catSession: {
                id: sessionRow?.session_id,
                band: sessionRow?.band ?? nextBand,
                difficulty: sessionRow?.difficulty ?? difficulty,
                scoreBefore: sessionRow?.score_before ?? scoreBefore,
                generationScore,
                levelBefore: sessionRow?.level_before ?? levelBefore,
                thetaBefore: sessionRow?.theta_before ?? thetaBefore,
                seBefore,
                createdAt: sessionRow?.created_at ?? new Date().toISOString(),
                topic,
                rankBefore: rankBefore.name,
                primaryLabel: rankBefore.primaryLabel,
                secondaryLabel: rankBefore.secondaryLabel,
                scoreToNextRank,
                stopRule: "precision_first",
                minItems: sessionPolicy.minItems,
                maxItems: sessionPolicy.maxItems,
                targetSe: sessionPolicy.targetSe,
                difficultySignalHint,
                generationTheme: generationTheme.name,
                topicSeed,
            },
            catProfile: {
                score: scoreBefore,
                level: levelBefore,
                theta: thetaBefore,
                se: seBefore,
                points: (profile as Record<string, unknown> | null)?.cat_points ?? 0,
                currentBand: (profile as Record<string, unknown> | null)?.cat_current_band ?? nextBand,
                rank: rankBefore.name,
                primaryLabel: rankBefore.primaryLabel,
                secondaryLabel: rankBefore.secondaryLabel,
                scoreToNextRank,
                mainSkillBand,
            },
            qualityTier,
            attemptCount,
            usedReasoner,
            auditMode: CAT_AUDIT_MODE,
            model: passageOneResult.model,
            difficultyTargets,
            difficultyAudit: null,
            validationSummary: null,
            abilitySnapshot: {
                score: scoreBefore,
                theta: thetaBefore,
                se: seBefore,
                rank: rankBefore.name,
            },
        });
    } catch (error) {
        console.error("CAT session start failed:", error);
        const message = error instanceof Error && error.message.trim()
            ? error.message
            : "启动 CAT 训练失败。";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
