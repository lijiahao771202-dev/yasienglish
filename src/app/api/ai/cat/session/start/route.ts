import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { deepseek } from "@/lib/deepseek";
import { levelFromScore } from "@/lib/cat-growth";
import {
    getCatDifficultyProfile,
    getCatQuizBlueprint,
    getCatRankTier,
    getCatScoreToNextRank,
    getLegacyBandFromScore,
    getLegacyDifficultyFromScore,
    getTierLexicalProfile,
    normalizeCatScore,
    validateArticleDifficulty as validateCatArticleDifficulty,
} from "@/lib/cat-score";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { createServerClient, getServerUserSafely } from "@/lib/supabase/server";

interface StartCatPayload {
    topic?: string;
    band?: number;
}

type ArticleDraft = {
    title: string;
    content: string;
    byline: string;
    wordCount: number;
};

type LexicalAudit = {
    coreCoverage: number;
    stretchCoverage: number;
    overlevelPenalty: number;
    confidence: number;
    reasons: string[];
};

type ValidationSummary = {
    stage: "r1" | "r2" | "r3" | "fallback";
    scoreUsed: number;
    passed: boolean;
    structure: {
        ok: boolean;
        reasons: string[];
        metrics: {
            wordCount: number;
            sentenceCount: number;
            avgSentenceLength: number;
            clauseDensity: number;
            rareWordRatio: number;
        };
    };
    lexical: LexicalAudit;
    reasons: string[];
};

function isMissingRpcFunction(error: { message?: string } | null, functionName: string) {
    const message = String(error?.message || "");
    if (!message) return false;
    return message.includes(`public.${functionName}`) && message.toLowerCase().includes("schema cache");
}

function round(value: number, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function defaultTopicByScore(score: number) {
    if (score < 1000) return "Daily habits, study life, and practical communication";
    if (score < 2000) return "Technology, society, and behavior change";
    if (score < 2800) return "Education policy, science ethics, and cognition";
    return "Research methods, long-term strategy, and interdisciplinary reasoning";
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

function formatQuestionDistribution(distribution: Record<string, number>) {
    return Object.entries(distribution)
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ");
}

function buildArticlePrompt(params: {
    topic: string;
    score: number;
    rankName: string;
    primaryLabel: string;
    secondaryLabel: string;
    difficulty: ReturnType<typeof getLegacyDifficultyFromScore>;
    profile: ReturnType<typeof getCatDifficultyProfile>;
    quizBlueprint: ReturnType<typeof getCatQuizBlueprint>;
    lexicalProfile: ReturnType<typeof getTierLexicalProfile>;
    failureSummary?: string;
}) {
    const { topic, score, rankName, primaryLabel, secondaryLabel, difficulty, profile, quizBlueprint, lexicalProfile, failureSummary } = params;

    return [
        "Write one English reading article for a Chinese learner.",
        `Topic: ${topic}`,
        `Score: ${score} | Rank: ${rankName} | ${primaryLabel} / ${secondaryLabel} | Bucket: ${difficulty}`,
        `Structure target: ${profile.wordCountMin}-${profile.wordCountMax} words; sentence ${profile.sentenceLengthMin.toFixed(1)}-${profile.sentenceLengthMax.toFixed(1)} words; clause ${profile.clauseDensityMin.toFixed(2)}-${profile.clauseDensityMax.toFixed(2)}.`,
        `Tier lexical register: core=${lexicalProfile.coreDomain}; stretch=${lexicalProfile.stretchDomain}.`,
        `Lexical gate: coreCoverage >= ${lexicalProfile.minimumCoreCoverage}; stretchCoverage >= ${lexicalProfile.minimumStretchCoverage}; overlevelPenalty <= ${lexicalProfile.maximumOverlevelPenalty}; confidence >= ${lexicalProfile.minimumConfidence}.`,
        "Avoid vocabulary leaps above two tiers and keep the article aligned with the target register.",
        `Quiz context: ${quizBlueprint.questionCount} questions | ${formatQuestionDistribution(quizBlueprint.distribution)}`,
        'Return JSON only: {"title":"string","content":"string","byline":"CAT Adaptive Trainer","wordCount":0}',
        "Keep claims plausible, concise, and directly useful for objective question writing.",
        failureSummary ? `Fix only: ${failureSummary}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

function buildLexicalAuditPrompt(params: {
    content: string;
    score: number;
    rankName: string;
    lexicalProfile: ReturnType<typeof getTierLexicalProfile>;
}) {
    const { content, score, rankName, lexicalProfile } = params;

    return [
        "Assess lexical fit for one CAT reading article.",
        `Score: ${score} | Rank: ${rankName}`,
        `Core register: ${lexicalProfile.coreDomain}; stretch register: ${lexicalProfile.stretchDomain}.`,
        `Thresholds: coreCoverage >= ${lexicalProfile.minimumCoreCoverage}; stretchCoverage >= ${lexicalProfile.minimumStretchCoverage}; overlevelPenalty <= ${lexicalProfile.maximumOverlevelPenalty}; confidence >= ${lexicalProfile.minimumConfidence}`,
        "Return JSON only with these fields:",
        '{"coreCoverage":0,"stretchCoverage":0,"overlevelPenalty":0,"confidence":0,"reasons":["short reason"]}',
        "Rules:",
        "- Use decimals from 0 to 1 for the four scores.",
        "- reasons should be short and specific.",
        "- Penalize over-level vocabulary, weak coverage of core content, and missing stretch vocabulary.",
        "Article:",
        content,
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

function normalizeDraft(parsed: {
    title?: string;
    content?: string;
    byline?: string;
    wordCount?: number;
}): ArticleDraft | null {
    const title = (parsed.title || "").trim();
    const content = (parsed.content || "").trim();
    const byline = (parsed.byline || "CAT Adaptive Trainer").trim();
    if (!content) return null;

    return {
        title,
        content,
        byline,
        wordCount: Number.isFinite(parsed.wordCount ?? NaN)
            ? Math.max(0, Math.round(Number(parsed.wordCount)))
            : content.split(/\s+/).filter(Boolean).length,
    };
}

async function generateDraft(params: {
    model: "deepseek-chat" | "deepseek-reasoner";
    prompt: string;
    useSharedKey?: boolean;
}) {
    const baseRequest = {
        model: params.model,
        messages: [{ role: "user" as const, content: params.prompt }],
        response_format: { type: "json_object" as const },
        temperature: params.model === "deepseek-reasoner" ? 0.2 : 0.55,
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

    const content = completion.choices[0]?.message?.content;
    if (!content) {
        return null;
    }

    const parsed = safeParseJson<{
        title?: string;
        content?: string;
        byline?: string;
        wordCount?: number;
    }>(content);

    if (!parsed) return null;
    return normalizeDraft(parsed);
}

async function runLexicalAudit(params: {
    content: string;
    score: number;
    rankName: string;
    lexicalProfile: ReturnType<typeof getTierLexicalProfile>;
}) {
    const prompt = buildLexicalAuditPrompt(params);

    const completion = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 240,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
        return {
            coreCoverage: 0,
            stretchCoverage: 0,
            overlevelPenalty: 1,
            confidence: 0,
            reasons: ["lexical audit returned empty content"],
        } satisfies LexicalAudit;
    }

    const parsed = safeParseJson<Partial<LexicalAudit>>(content);
    if (!parsed) {
        return {
            coreCoverage: 0,
            stretchCoverage: 0,
            overlevelPenalty: 1,
            confidence: 0,
            reasons: ["lexical audit returned invalid JSON"],
        } satisfies LexicalAudit;
    }

    return {
        coreCoverage: Number(parsed.coreCoverage ?? 0),
        stretchCoverage: Number(parsed.stretchCoverage ?? 0),
        overlevelPenalty: Number(parsed.overlevelPenalty ?? 1),
        confidence: Number(parsed.confidence ?? 0),
        reasons: Array.isArray(parsed.reasons)
            ? parsed.reasons.map((reason) => String(reason).trim()).filter(Boolean)
            : [],
    } satisfies LexicalAudit;
}

function toValidationSummary(params: {
    stage: ValidationSummary["stage"];
    scoreUsed: number;
    validation: ReturnType<typeof validateCatArticleDifficulty>;
}): ValidationSummary {
    const { stage, scoreUsed, validation } = params;
    const reasons = [
        ...validation.structure.reasons.map((reason) => `structure: ${reason}`),
        ...validation.lexical.reasons.map((reason) => `lexical: ${reason}`),
    ];

    return {
        stage,
        scoreUsed,
        passed: validation.isValid,
        structure: {
            ok: validation.structure.isValid,
            reasons: validation.structure.reasons,
            metrics: validation.structure.metrics,
        },
        lexical: {
            coreCoverage: validation.lexical.coreCoverage,
            stretchCoverage: validation.lexical.stretchCoverage,
            overlevelPenalty: validation.lexical.overlevelPenalty,
            confidence: validation.lexical.confidence,
            reasons: validation.lexical.reasons,
        },
        reasons,
    };
}

async function generateValidatedArticle(params: {
    score: number;
    topic: string;
    rankName: string;
    primaryLabel: string;
    secondaryLabel: string;
    difficulty: ReturnType<typeof getLegacyDifficultyFromScore>;
    profile: ReturnType<typeof getCatDifficultyProfile>;
    quizBlueprint: ReturnType<typeof getCatQuizBlueprint>;
    useSharedKey?: boolean;
}) {
    const lexicalProfile = getTierLexicalProfile(params.score);
    const prompt = buildArticlePrompt({
        topic: params.topic,
        score: params.score,
        rankName: params.rankName,
        primaryLabel: params.primaryLabel,
        secondaryLabel: params.secondaryLabel,
        difficulty: params.difficulty,
        profile: params.profile,
        quizBlueprint: params.quizBlueprint,
        lexicalProfile,
    });

    const model = "deepseek-chat" as const;
    const draft = await generateDraft({ model, prompt, useSharedKey: params.useSharedKey });
    if (!draft) {
        return {
            draft: null,
            validation: {
                stage: "r1",
                scoreUsed: params.score,
                passed: false,
                structure: {
                    ok: false,
                    reasons: ["generation returned invalid JSON or empty content"],
                    metrics: {
                        wordCount: 0,
                        sentenceCount: 0,
                        avgSentenceLength: 0,
                        clauseDensity: 0,
                        rareWordRatio: 0,
                    },
                },
                lexical: {
                    coreCoverage: 0,
                    stretchCoverage: 0,
                    overlevelPenalty: 1,
                    confidence: 0,
                    reasons: ["generation failed before lexical audit"],
                },
                reasons: ["generation returned invalid JSON or empty content"],
            } satisfies ValidationSummary,
            model,
            lexicalProfile,
        };
    }

    const lexicalAudit = await runLexicalAudit({
        content: draft.content,
        score: params.score,
        rankName: params.rankName,
        lexicalProfile,
    });

    const validation = toValidationSummary({
        stage: "r1",
        scoreUsed: params.score,
        validation: validateCatArticleDifficulty({
            text: draft.content,
            score: params.score,
            profile: params.profile,
            lexicalAuditResult: lexicalAudit,
        }),
    });

    return {
        draft,
        validation,
        model,
        lexicalProfile,
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
        .select("cat_score, cat_level, cat_theta, cat_points, cat_current_band")
        .eq("user_id", resolvedUser.id)
        .maybeSingle();

    const scoreBefore = normalizeCatScore(Number(profile?.cat_score ?? 1000));
    const levelBefore = Number(profile?.cat_level ?? levelFromScore(scoreBefore));
    const thetaBefore = Number(profile?.cat_theta ?? 0);
    const nextBand = getLegacyBandFromScore(scoreBefore);
    const difficulty = getLegacyDifficultyFromScore(scoreBefore);
    const rankBefore = getCatRankTier(scoreBefore);
    const scoreToNextRank = getCatScoreToNextRank(scoreBefore);
    const topic = (body.topic || "").trim() || defaultTopicByScore(scoreBefore);

    const attemptCount = 1;
    const qualityTier = "single_shot" as const;
    const usedReasoner = false;
    const activeScore = scoreBefore;
    const activeProfile = getCatDifficultyProfile(scoreBefore);
    const activeQuizBlueprint = getCatQuizBlueprint(scoreBefore);
    const activeRank = rankBefore;

    const result = await generateValidatedArticle({
        score: scoreBefore,
        topic,
        rankName: rankBefore.name,
        primaryLabel: rankBefore.primaryLabel,
        secondaryLabel: rankBefore.secondaryLabel,
        difficulty,
        profile: activeProfile,
        quizBlueprint: activeQuizBlueprint,
        useSharedKey: true,
    });

    if (!result.draft) {
        return NextResponse.json({ error: "Failed to generate CAT article." }, { status: 500 });
    }

    const articleDraft = result.draft;
    const validationSummary = result.validation;

    const articleTitle = articleDraft.title || `${activeRank.name} 阅读训练`;
    const articleUrl = `cat://${resolvedUser.id}/${Date.now()}`;
    const blocks = articleDraft.content
        .split(/\n\n+/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => ({ type: "paragraph", content: paragraph }));

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

    const finalDifficultyProfile = activeProfile;
    const finalQuizBlueprint = activeQuizBlueprint;
    const finalScoreSnapshot = activeScore;

    return NextResponse.json({
        article: {
            title: articleTitle,
            content: articleDraft.content,
            byline: articleDraft.byline,
            textContent: articleDraft.content,
            blocks,
            url: articleUrl,
            difficulty,
            isAIGenerated: true,
            isCatMode: true,
            catSessionId: sessionRow?.session_id,
            catBand: sessionRow?.band ?? nextBand,
            catScoreSnapshot: finalScoreSnapshot,
            catRankName: activeRank.name,
            catRankPrimaryLabel: activeRank.primaryLabel,
            catRankSecondaryLabel: activeRank.secondaryLabel,
            catQuizBlueprint: finalQuizBlueprint,
            catDifficultyProfile: {
                wordCount: [finalDifficultyProfile.wordCountMin, finalDifficultyProfile.wordCountMax],
                sentenceLength: [finalDifficultyProfile.sentenceLengthMin, finalDifficultyProfile.sentenceLengthMax],
                clauseDensity: [finalDifficultyProfile.clauseDensityMin, finalDifficultyProfile.clauseDensityMax],
                rareWordRatio: [finalDifficultyProfile.rareWordRatioMin, finalDifficultyProfile.rareWordRatioMax],
            },
        },
        catSession: {
            id: sessionRow?.session_id,
            band: sessionRow?.band ?? nextBand,
            difficulty: sessionRow?.difficulty ?? difficulty,
            scoreBefore: sessionRow?.score_before ?? scoreBefore,
            levelBefore: sessionRow?.level_before ?? levelBefore,
            thetaBefore: sessionRow?.theta_before ?? thetaBefore,
            createdAt: sessionRow?.created_at ?? new Date().toISOString(),
            topic,
            rankBefore: rankBefore.name,
            primaryLabel: rankBefore.primaryLabel,
            secondaryLabel: rankBefore.secondaryLabel,
            scoreToNextRank,
        },
        catProfile: {
            score: scoreBefore,
            level: levelBefore,
            theta: thetaBefore,
            points: profile?.cat_points ?? 0,
            currentBand: profile?.cat_current_band ?? nextBand,
            rank: rankBefore.name,
            primaryLabel: rankBefore.primaryLabel,
            secondaryLabel: rankBefore.secondaryLabel,
            scoreToNextRank,
        },
        qualityTier,
        attemptCount,
        usedReasoner,
        validationSummary: validationSummary
            ? {
                  stage: validationSummary.stage,
                  scoreUsed: validationSummary.scoreUsed,
                  passed: validationSummary.passed,
                  structure: {
                      ok: validationSummary.structure.ok,
                      reasons: validationSummary.structure.reasons.slice(0, 3),
                  },
                  lexical: {
                      coreCoverage: round(validationSummary.lexical.coreCoverage, 3),
                      stretchCoverage: round(validationSummary.lexical.stretchCoverage, 3),
                      overlevelPenalty: round(validationSummary.lexical.overlevelPenalty, 3),
                      confidence: round(validationSummary.lexical.confidence, 3),
                      reasons: validationSummary.lexical.reasons.slice(0, 3),
                  },
                  reasons: validationSummary.reasons.slice(0, 5),
              }
            : null,
    });
}
