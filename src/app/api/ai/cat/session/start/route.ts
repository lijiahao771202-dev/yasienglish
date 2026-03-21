import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { deepseek } from "@/lib/deepseek";
import { levelFromScore } from "@/lib/cat-growth";
import {
    getCatMainSkillBand,
    getCatArticleTargets,
    getCatQuizBlueprint,
    getCatSessionPolicy,
    getCatRankTier,
    getCatScoreToNextRank,
    getLegacyBandFromScore,
    getLegacyDifficultyFromScore,
    normalizeCatScore,
    CAT_MAIN_SKILL_BANDS,
    type CatArticleLexicalEvidence,
    type CatArticleLexicalMix,
    type CatArticleTargets,
} from "@/lib/cat-score";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";
import { normalizeThetaFromScore } from "@/lib/cat-rasch";
import { pickCatTopicSeed } from "@/lib/content-topic-pool";

interface StartCatPayload {
    topic?: string;
    band?: number;
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

function buildBandMappingPromptText() {
    return CAT_MAIN_SKILL_BANDS
        .map((band) => {
            const scoreRange = band.max === null ? `${band.min}+` : `${band.min}-${band.max}`;
            return `- ${scoreRange}: ${band.label} (${band.examMapping}) | 词汇重点: ${band.lexicalFocus}`;
        })
        .join("\n");
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function buildArticlePrompt(params: {
    topic: string;
    score: number;
    rankName: string;
    primaryLabel: string;
    secondaryLabel: string;
    difficulty: ReturnType<typeof getLegacyDifficultyFromScore>;
    targets: CatArticleTargets;
    generationTheme: CatGenerationTheme;
}) {
    const { topic, score, rankName, primaryLabel, secondaryLabel, difficulty, targets, generationTheme } = params;
    const { lexicalTarget, lengthTarget, syntaxTarget } = targets;
    const shortWordMin = Math.max(80, Math.round(lengthTarget.wordCountMin * 0.45));
    const shortWordMax = Math.max(shortWordMin + 40, Math.round(lengthTarget.wordCountMax * 0.6));
    const mainBand = getCatMainSkillBand(score);
    const clauseMarkers =
        "because, although, though, while, whereas, which, that, who, whose, whom, if, when, unless, whether, since, after, before, until, once, provided, despite, where, as";

    return [
        "Task: Generate ONE CAT adaptive short reading passage for a Chinese learner.",
        `Topic: ${topic}`,
        `Learner score: ${score} | Rank: ${rankName} | ${primaryLabel} / ${secondaryLabel} | Bucket: ${difficulty}`,
        `Main skill band: ${mainBand.label} (${mainBand.examMapping})`,
        "",
        "CAT score map (0-3200+):",
        buildBandMappingPromptText(),
        "",
        "Why this matters:",
        "- The passage is used in adaptive CAT training. Difficulty must match the learner score.",
        "- Keep challenge but avoid uncontrolled complexity spikes.",
        "",
        "RANDOM STYLE INJECTION (must apply this generation):",
        `- Theme: ${generationTheme.name}`,
        `- Directive: ${generationTheme.directive}`,
        "",
        "THREE-AXIS HARD TARGETS (all required):",
        `1) Lexical ratio (decimal 0-1, not %): core=${lexicalTarget.coreTierLabel} ${Math.round(lexicalTarget.ratios.core[0] * 100)}%-${Math.round(lexicalTarget.ratios.core[1] * 100)}%; lower=${lexicalTarget.lowerTierLabel ?? "None"} ${Math.round(lexicalTarget.ratios.lower[0] * 100)}%-${Math.round(lexicalTarget.ratios.lower[1] * 100)}%; stretch=${lexicalTarget.stretchTierLabel} ${Math.round(lexicalTarget.ratios.stretch[0] * 100)}%-${Math.round(lexicalTarget.ratios.stretch[1] * 100)}%; overlevel<=${Math.round(lexicalTarget.overlevelMax * 100)}%.`,
        `2) Length: short passage wordCount ${shortWordMin}-${shortWordMax} (english tokens).`,
        `3) Syntax: complexSentenceRatio ${Math.round(syntaxTarget.complexSentenceRatioRange[0] * 100)}%-${Math.round(syntaxTarget.complexSentenceRatioRange[1] * 100)}%; multiClauseSentenceRatio ${Math.round(syntaxTarget.multiClauseSentenceRatioRange[0] * 100)}%-${Math.round(syntaxTarget.multiClauseSentenceRatioRange[1] * 100)}%; clauseDensity ${syntaxTarget.clauseDensityRange[0].toFixed(2)}-${syntaxTarget.clauseDensityRange[1].toFixed(2)}.`,
        "",
        "Writing rules:",
        "- Write 2-3 coherent short paragraphs only.",
        "- Keep the title concise and natural.",
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
        "B. Draft short passage in 2-3 coherent paragraphs.",
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
        "2-3 short paragraphs of article content",
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
    topic: string;
    rankName: string;
    primaryLabel: string;
    secondaryLabel: string;
    difficulty: ReturnType<typeof getLegacyDifficultyFromScore>;
    generationTheme: CatGenerationTheme;
    useSharedKey?: boolean;
}) {
    const difficultyTargets = getCatArticleTargets(params.score);
    const prompt = buildArticlePrompt({
        topic: params.topic,
        score: params.score,
        rankName: params.rankName,
        primaryLabel: params.primaryLabel,
        secondaryLabel: params.secondaryLabel,
        difficulty: params.difficulty,
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
    const levelBefore = Number((profile as Record<string, unknown> | null)?.cat_level ?? levelFromScore(scoreBefore));
    const thetaBefore = Number((profile as Record<string, unknown> | null)?.cat_theta ?? normalizeThetaFromScore(scoreBefore));
    const seBefore = clamp(Number((profile as Record<string, unknown> | null)?.cat_se ?? 1.15), 0.22, 2.4);
    const nextBand = getLegacyBandFromScore(scoreBefore);
    const difficulty = getLegacyDifficultyFromScore(scoreBefore);
    const rankBefore = getCatRankTier(scoreBefore);
    const scoreToNextRank = getCatScoreToNextRank(scoreBefore);
    const mainSkillBand = getCatMainSkillBand(scoreBefore);
    const topicSeed = pickCatTopicSeed({
        score: scoreBefore,
        userTopic: typeof body.topic === "string" ? body.topic : "",
    });
    const topic = topicSeed.topicLine;
    const generationTheme = pickRandomCatGenerationTheme();

    const passageOneResult = await generateValidatedArticle({
        score: scoreBefore,
        topic,
        rankName: rankBefore.name,
        primaryLabel: rankBefore.primaryLabel,
        secondaryLabel: rankBefore.secondaryLabel,
        difficulty,
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
    const questionBlueprint = getCatQuizBlueprint(scoreBefore);
    const sessionPolicy = getCatSessionPolicy(scoreBefore);
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
                targetScore: scoreBefore,
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
                score: scoreBefore,
                questionCount: questionBlueprint.questionCount,
                ratioBandLabel: questionBlueprint.ratioBandLabel,
                distribution: questionBlueprint.distribution,
                allowedTypes: questionBlueprint.allowedTypes,
            },
            catSessionBlueprint: sessionBlueprint,
            catDifficultyProfile: {
                wordCount: [difficultyTargets.lengthTarget.wordCountMin, difficultyTargets.lengthTarget.wordCountMax],
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
}
