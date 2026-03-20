#!/usr/bin/env node
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { performance } from "node:perf_hooks";

const DEFAULT_SCORES = [200, 1000, 1800, 2600, 3200];
const MIN_SAMPLES = 2;
const MAX_SAMPLES = 5;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim() || "";
const CAT_SMOKE_EMAIL = process.env.CAT_SMOKE_EMAIL?.trim() || "";
const CAT_SMOKE_PASSWORD = process.env.CAT_SMOKE_PASSWORD?.trim() || "";
const MODEL = "deepseek-chat";
let smokeAccessTokenPromise = null;

const CAT_RANK_TIERS = [
    { minScore: 0, maxScore: 199, name: "A0 起步", primaryLabel: "英语基础", secondaryLabel: "高中基础" },
    { minScore: 200, maxScore: 399, name: "A1 入门", primaryLabel: "英语基础", secondaryLabel: "高中中段" },
    { minScore: 400, maxScore: 599, name: "A2 进阶", primaryLabel: "英语基础", secondaryLabel: "高中毕业" },
    { minScore: 600, maxScore: 799, name: "B1 预备", primaryLabel: "四级预备", secondaryLabel: "CET-4 Prep" },
    { minScore: 800, maxScore: 999, name: "B1+ 强化", primaryLabel: "四级强化", secondaryLabel: "CET-4" },
    { minScore: 1000, maxScore: 1199, name: "B2- 稳定", primaryLabel: "四级通过", secondaryLabel: "CET-4" },
    { minScore: 1200, maxScore: 1399, name: "B2 预备", primaryLabel: "六级预备", secondaryLabel: "CET-6 Prep" },
    { minScore: 1400, maxScore: 1599, name: "B2+ 冲刺", primaryLabel: "六级冲刺", secondaryLabel: "CET-6 Prep" },
    { minScore: 1600, maxScore: 1799, name: "C1- 稳定", primaryLabel: "六级通过", secondaryLabel: "CET-6" },
    { minScore: 1800, maxScore: 1999, name: "C1 预备", primaryLabel: "专四预备", secondaryLabel: "TEM-4 Prep" },
    { minScore: 2000, maxScore: 2199, name: "C1+ 通过", primaryLabel: "专四通过", secondaryLabel: "TEM-4" },
    { minScore: 2200, maxScore: 2399, name: "C2- 学术", primaryLabel: "雅思 6.0", secondaryLabel: "IELTS 6.0" },
    { minScore: 2400, maxScore: 2599, name: "C2 学术", primaryLabel: "雅思 6.5", secondaryLabel: "IELTS 6.5" },
    { minScore: 2600, maxScore: 2799, name: "C2+ 高阶", primaryLabel: "雅思 7.0", secondaryLabel: "IELTS 7.0" },
    { minScore: 2800, maxScore: 2999, name: "S1 专业", primaryLabel: "专八预备", secondaryLabel: "TEM-8 Prep" },
    { minScore: 3000, maxScore: 3199, name: "S2 专家", primaryLabel: "专八 / 雅思 7.5", secondaryLabel: "TEM-8 / IELTS 7.5" },
    { minScore: 3200, maxScore: null, name: "大师", primaryLabel: "雅思 8.0+", secondaryLabel: "可持续增长" },
];

const FORMAL_MARKERS = [
    "however",
    "therefore",
    "moreover",
    "nevertheless",
    "consequently",
    "meanwhile",
    "instead",
    "whereas",
    "although",
    "thus",
    "furthermore",
    "specifically",
    "in addition",
    "for example",
    "as a result",
    "on the other hand",
    "in contrast",
    "despite",
    "while",
    "since",
    "because",
    "not only",
    "rather",
    "indicates",
    "suggests",
    "evidence",
];

const CASUAL_MARKERS = [
    "yeah",
    "okay",
    "ok",
    "stuff",
    "kind of",
    "sort of",
    "maybe",
    "like",
    "really",
    "just",
    "pretty",
    "gonna",
    "wanna",
];

const ABSTRACT_TERMS = [
    "system",
    "policy",
    "strategy",
    "evidence",
    "mechanism",
    "framework",
    "sustainability",
    "efficiency",
    "implementation",
    "analysis",
    "assumption",
    "intervention",
    "variation",
    "complexity",
    "trade-off",
    "constraint",
    "uncertainty",
    "context",
    "perspective",
    "process",
    "structure",
    "principle",
    "phenomenon",
    "distribution",
    "regulation",
    "innovation",
    "resilience",
    "capacity",
    "optimization",
    "trajectory",
    "stakeholder",
    "methodology",
    "outcome",
    "evaluation",
    "governance",
    "economics",
    "research",
    "ethics",
    "academic",
    "data",
];

const CONCRETE_TERMS = [
    "daily",
    "school",
    "bus",
    "market",
    "kitchen",
    "street",
    "farm",
    "shop",
    "tool",
    "worker",
    "child",
    "phone",
    "map",
    "water",
    "food",
    "room",
    "garden",
    "neighbor",
    "notebook",
    "bicycle",
    "train",
    "desk",
    "window",
    "coin",
    "task",
    "team",
    "field",
    "table",
    "home",
    "tomato",
    "farmer",
    "marketplace",
    "market",
];

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function getSupabaseUrl() {
    const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (publicUrl) return publicUrl;

    const serverUrl = process.env.SUPABASE_URL?.trim();
    if (serverUrl) return serverUrl;

    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
}

function getSupabasePublishableKey() {
    const publicPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
    if (publicPublishableKey) return publicPublishableKey;

    const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (publicAnonKey) return publicAnonKey;

    const serverPublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (serverPublishableKey) return serverPublishableKey;

    const serverAnonKey = process.env.SUPABASE_ANON_KEY?.trim();
    if (serverAnonKey) return serverAnonKey;

    throw new Error(
        "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
}

function lerp(start, end, progress) {
    return start + (end - start) * progress;
}

function normalizeScore(score) {
    if (!Number.isFinite(score)) return 0;
    return Math.max(0, Math.round(score));
}

function getRankTier(score) {
    const normalizedScore = normalizeScore(score);
    return (
        CAT_RANK_TIERS.find((tier) => {
            if (tier.maxScore === null) return normalizedScore >= tier.minScore;
            return normalizedScore >= tier.minScore && normalizedScore <= tier.maxScore;
        }) ?? CAT_RANK_TIERS[0]
    );
}

function getLegacyBandFromScore(score) {
    const normalizedScore = normalizeScore(score);
    return clamp(Math.floor(normalizedScore / 400) + 1, 1, 9);
}

function getLegacyDifficultyFromScore(score) {
    const band = getLegacyBandFromScore(score);
    if (band <= 3) return "cet4";
    if (band <= 6) return "cet6";
    return "ielts";
}

function getDifficultyProfile(score) {
    const normalizedScore = normalizeScore(score);
    const progress = clamp(normalizedScore / 3200, 0, 1);

    return {
        score: normalizedScore,
        progress,
        wordCountMin: Math.round(lerp(220, 720, progress)),
        wordCountMax: Math.round(lerp(340, 820, progress)),
        sentenceLengthMin: Number(lerp(11, 18, progress).toFixed(2)),
        sentenceLengthMax: Number(lerp(16, 28, progress).toFixed(2)),
        clauseDensityMin: Number(lerp(0.12, 0.4, progress).toFixed(3)),
        clauseDensityMax: Number(lerp(0.25, 0.55, progress).toFixed(3)),
        rareWordRatioMin: Number(lerp(0.04, 0.1, progress).toFixed(3)),
        rareWordRatioMax: Number(lerp(0.08, 0.16, progress).toFixed(3)),
        abstractnessLevel: Number(lerp(1, 5, progress).toFixed(2)),
        distractorStrength: Number(lerp(1, 5, progress).toFixed(2)),
    };
}

function getQuizBlueprint(score) {
    const normalizedScore = normalizeScore(score);
    const band = normalizedScore < 800 ? 5 : normalizedScore < 1600 ? 6 : normalizedScore < 2400 ? 7 : 8;
    const ratios =
        normalizedScore < 800
            ? {
                  multiple_choice: 0.4,
                  multiple_select: 0.1,
                  true_false_ng: 0.25,
                  matching: 0.15,
                  fill_blank_choice: 0.1,
              }
            : normalizedScore < 1600
              ? {
                    multiple_choice: 0.32,
                    multiple_select: 0.15,
                    true_false_ng: 0.23,
                    matching: 0.2,
                    fill_blank_choice: 0.1,
                }
              : normalizedScore < 2400
                ? {
                      multiple_choice: 0.24,
                      multiple_select: 0.2,
                      true_false_ng: 0.21,
                      matching: 0.2,
                      fill_blank_choice: 0.15,
                  }
                : {
                      multiple_choice: 0.18,
                      multiple_select: 0.25,
                      true_false_ng: 0.17,
                      matching: 0.2,
                      fill_blank_choice: 0.2,
                  };

    const questionCount = band;
    const distribution = buildObjectiveDistribution(questionCount, ratios);

    return {
        score: normalizedScore,
        questionCount,
        ratioBandLabel: normalizedScore < 800 ? "基础段" : normalizedScore < 1600 ? "进阶段" : normalizedScore < 2400 ? "强化段" : "高阶段",
        ratios,
        distribution,
    };
}

function buildObjectiveDistribution(questionCount, ratios) {
    const safeQuestionCount = Math.max(1, Math.round(questionCount));
    const types = ["multiple_choice", "multiple_select", "true_false_ng", "matching", "fill_blank_choice"];
    const distribution = Object.fromEntries(types.map((type) => [type, Math.floor(safeQuestionCount * ratios[type])]));

    if (distribution.multiple_select < 1) distribution.multiple_select = 1;

    let total = types.reduce((sum, type) => sum + distribution[type], 0);
    const protectedMinimum = (type) => {
        if (type === "multiple_select") return 1;
        if (safeQuestionCount >= 7 && (type === "true_false_ng" || type === "matching")) return 1;
        return 0;
    };

    while (total > safeQuestionCount) {
        const reductionOrder = ["multiple_choice", "fill_blank_choice", "true_false_ng", "matching", "multiple_select"];
        const removable = reductionOrder.find((type) => distribution[type] > protectedMinimum(type));
        if (!removable) break;
        distribution[removable] -= 1;
        total -= 1;
    }

    if (total < safeQuestionCount) {
        const remainders = types
            .map((type) => ({
                type,
                remainder: safeQuestionCount * ratios[type] - Math.floor(safeQuestionCount * ratios[type]),
            }))
            .sort((left, right) => {
                if (right.remainder !== left.remainder) return right.remainder - left.remainder;
                const priority = ["multiple_select", "true_false_ng", "matching", "multiple_choice", "fill_blank_choice"];
                return priority.indexOf(left.type) - priority.indexOf(right.type);
            });

        let cursor = 0;
        while (total < safeQuestionCount) {
            const fallbackType = remainders[cursor % remainders.length]?.type ?? "multiple_choice";
            distribution[fallbackType] += 1;
            total += 1;
            cursor += 1;
        }
    }

    return distribution;
}

function defaultTopicByScore(score) {
    if (score < 1000) return "Daily habits, study life, and practical communication";
    if (score < 2000) return "Technology, society, and behavior change";
    if (score < 2800) return "Education policy, science ethics, and cognition";
    return "Research methods, long-term strategy, and interdisciplinary reasoning";
}

function buildArticlePrompt({ topic, score, rankName, primaryLabel, secondaryLabel, difficulty, profile, quizBlueprint }) {
    return `
You are generating one adaptive English reading article for a Chinese learner.

Learner profile:
- CAT score: ${score}
- Rank: ${rankName}
- Primary benchmark: ${primaryLabel}
- Secondary benchmark: ${secondaryLabel}
- Legacy bucket: ${difficulty}

Hard article constraints:
- Topic: ${topic}
- Word count target: ${profile.wordCountMin}-${profile.wordCountMax}
- Average sentence length target: ${profile.sentenceLengthMin.toFixed(1)}-${profile.sentenceLengthMax.toFixed(1)} words
- Clause density target: ${profile.clauseDensityMin.toFixed(2)}-${profile.clauseDensityMax.toFixed(2)}
- Rare-word ratio target: ${(profile.rareWordRatioMin * 100).toFixed(1)}%-${(profile.rareWordRatioMax * 100).toFixed(1)}%
- Abstractness level (1-5): ${profile.abstractnessLevel.toFixed(2)}
- Distractor strength (1-5): ${profile.distractorStrength.toFixed(2)}

Quiz generation context (must align with this article):
- Question count: ${quizBlueprint.questionCount}
- Type distribution:
${Object.entries(quizBlueprint.distribution)
    .map(([type, count]) => `  - ${type}: ${count}`)
    .join("\n")}

Output JSON only:
{
  "title": "string",
  "content": "string, paragraphs separated by double newlines",
  "byline": "CAT Adaptive Trainer",
  "wordCount": 0
}

Rules:
- Keep claims plausible and evidence-based.
- Build strong contextual clues for objective questions.
- Do not output markdown fences.
`.trim();
}

function tokenizeWords(text) {
    return (text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? []).map((token) => token.toLowerCase());
}

function countPhraseHits(text, phrases) {
    const lower = text.toLowerCase();
    return phrases.reduce((count, phrase) => {
        const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "g");
        const matches = lower.match(regex);
        return count + (matches ? matches.length : 0);
    }, 0);
}

function countTermHits(text, terms) {
    const lower = text.toLowerCase();
    return terms.reduce((count, term) => {
        const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "g");
        const matches = lower.match(regex);
        return count + (matches ? matches.length : 0);
    }, 0);
}

function analyzeArticleStructure(text) {
    const words = tokenizeWords(text);
    const wordCount = words.length;
    const sentenceChunks = text
        .split(/[.!?]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
    const sentenceCount = Math.max(1, sentenceChunks.length);
    const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : wordCount;
    const clauseMarkers = countPhraseHits(text, [
        "because",
        "although",
        "though",
        "while",
        "whereas",
        "which",
        "that",
        "who",
        "whose",
        "whom",
        "if",
        "when",
        "unless",
        "whether",
        "since",
    ]);
    const clauseDensity = clauseMarkers / sentenceCount;
    const rareWordCount = words.filter((word) => word.length >= 9).length;
    const rareWordRatio = wordCount > 0 ? rareWordCount / wordCount : 0;

    return {
        wordCount,
        sentenceCount,
        avgSentenceLength,
        clauseDensity,
        rareWordRatio,
    };
}

function validateArticleAgainstDifficultyProfile(text, profile) {
    const metrics = analyzeArticleStructure(text);
    const reasons = [];

    const wordMin = Math.max(120, profile.wordCountMin - 30);
    const wordMax = profile.wordCountMax + 30;
    if (metrics.wordCount < wordMin || metrics.wordCount > wordMax) {
        reasons.push(`Word count out of range (${wordMin}-${wordMax}).`);
    }

    const sentenceMin = Math.max(6, profile.sentenceLengthMin - 3.2);
    const sentenceMax = profile.sentenceLengthMax + 3.2;
    if (metrics.avgSentenceLength < sentenceMin || metrics.avgSentenceLength > sentenceMax) {
        reasons.push(`Average sentence length out of range (${sentenceMin.toFixed(1)}-${sentenceMax.toFixed(1)}).`);
    }

    const clauseMin = Math.max(0.02, profile.clauseDensityMin - 0.08);
    const clauseMax = profile.clauseDensityMax + 0.08;
    if (metrics.clauseDensity < clauseMin || metrics.clauseDensity > clauseMax) {
        reasons.push(`Clause density out of range (${clauseMin.toFixed(2)}-${clauseMax.toFixed(2)}).`);
    }

    const rareMin = Math.max(0, profile.rareWordRatioMin - 0.03);
    const rareMax = profile.rareWordRatioMax + 0.03;
    if (metrics.rareWordRatio < rareMin || metrics.rareWordRatio > rareMax) {
        reasons.push(`Rare-word ratio out of range (${(rareMin * 100).toFixed(1)}%-${(rareMax * 100).toFixed(1)}%).`);
    }

    return {
        isValid: reasons.length === 0,
        metrics,
        reasons,
    };
}

function getRegisterTarget(score) {
    if (score < 800) return { idealAbstract: 0.03, tolerance: 0.04, minFormal: 1, maxCasual: 2, minConcrete: 4 };
    if (score < 1600) return { idealAbstract: 0.06, tolerance: 0.045, minFormal: 2, maxCasual: 1, minConcrete: 3 };
    if (score < 2400) return { idealAbstract: 0.1, tolerance: 0.05, minFormal: 3, maxCasual: 0, minConcrete: 2 };
    if (score < 3000) return { idealAbstract: 0.13, tolerance: 0.055, minFormal: 4, maxCasual: 0, minConcrete: 1 };
    return { idealAbstract: 0.16, tolerance: 0.06, minFormal: 5, maxCasual: 0, minConcrete: 1 };
}

function evaluateRegister(text, score) {
    const words = tokenizeWords(text);
    const wordCount = Math.max(1, words.length);
    const abstractCount = countTermHits(text, ABSTRACT_TERMS);
    const concreteCount = countTermHits(text, CONCRETE_TERMS);
    const formalCount = countPhraseHits(text, FORMAL_MARKERS);
    const casualCount = countPhraseHits(text, CASUAL_MARKERS);
    const abstractRatio = abstractCount / wordCount;
    const target = getRegisterTarget(score);

    const densityFit = 1 - clamp(Math.abs(abstractRatio - target.idealAbstract) / target.tolerance, 0, 1);
    const formalFit = clamp(formalCount / target.minFormal, 0, 1);
    const concreteFit = clamp(concreteCount / target.minConcrete, 0, 1);
    const casualFit = casualCount <= target.maxCasual ? 1 : Math.max(0, 1 - (casualCount - target.maxCasual) * 0.35);
    const registerScore = densityFit * 0.45 + formalFit * 0.25 + concreteFit * 0.2 + casualFit * 0.1;
    const hit = registerScore >= 0.62 && casualCount <= target.maxCasual + 1;

    return {
        hit,
        registerScore,
        abstractRatio,
        formalCount,
        casualCount,
        concreteCount,
        target,
    };
}

function formatPercent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value) {
    return `${Math.round(value)}ms`;
}

async function getSmokeAccessToken() {
    if (!CAT_SMOKE_EMAIL || !CAT_SMOKE_PASSWORD) {
        return null;
    }

    if (!smokeAccessTokenPromise) {
        smokeAccessTokenPromise = (async () => {
            const client = createClient(getSupabaseUrl(), getSupabasePublishableKey(), {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                },
            });

            const { data, error } = await client.auth.signInWithPassword({
                email: CAT_SMOKE_EMAIL,
                password: CAT_SMOKE_PASSWORD,
            });

            if (error) {
                throw new Error(`Failed to sign in CAT smoke user: ${error.message}`);
            }

            const accessToken = data.session?.access_token ?? "";
            if (!accessToken) {
                throw new Error("Supabase signInWithPassword did not return an access token.");
            }

            return accessToken;
        })();
    }

    return smokeAccessTokenPromise;
}

function resolveLocalSessionStartUrl() {
    const explicit = process.env.CAT_SESSION_START_URL?.trim();
    if (explicit) return explicit;

    const baseUrl = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.LOCAL_APP_URL?.trim();
    if (!baseUrl) return null;

    try {
        return new URL("/api/ai/cat/session/start", baseUrl).toString();
    } catch {
        return null;
    }
}

function extractGeneratedArticle(payload) {
    const article = payload?.article ?? payload?.data?.article ?? null;
    if (!article || typeof article !== "object") return null;

    const content = typeof article.content === "string" ? article.content.trim() : "";
    if (!content) return null;

    return {
        title: typeof article.title === "string" ? article.title.trim() : "",
        content,
        byline: typeof article.byline === "string" && article.byline.trim() ? article.byline.trim() : "CAT Adaptive Trainer",
    };
}

function extractLocalValidationSummary(payload) {
    const validationSummary = payload?.validationSummary ?? null;
    if (!validationSummary || typeof validationSummary !== "object") return null;
    return validationSummary;
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

async function generateArticleViaLocalRoute(score, topic) {
    const url = resolveLocalSessionStartUrl();
    if (!url) return null;

    const headers = {
        "content-type": "application/json",
    };

    const accessToken = await getSmokeAccessToken();
    if (accessToken) {
        headers.authorization = `Bearer ${accessToken}`;
    }

    const response = await fetchWithTimeout(
        url,
        {
            method: "POST",
            headers,
            body: JSON.stringify({
                topic,
                band: getLegacyBandFromScore(score),
                singleShot: true,
            }),
        },
        30000,
    );

    if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(
            `Local route returned ${response.status}${bodyText ? `: ${bodyText.slice(0, 240)}` : ""}`,
        );
    }

    const payload = await response.json().catch(() => null);
    const article = extractGeneratedArticle(payload);
    if (!article) {
        throw new Error("Local route response did not include a generated article.");
    }

    return {
        article,
        validationSummary: extractLocalValidationSummary(payload),
        qualityTier: typeof payload?.qualityTier === "string" ? payload.qualityTier : null,
    };
}

function createDeepSeekClient() {
    if (!DEEPSEEK_API_KEY) {
        throw new Error("Missing DEEPSEEK_API_KEY. Export it before running this smoke check.");
    }

    return new OpenAI({
        apiKey: DEEPSEEK_API_KEY,
        baseURL: DEEPSEEK_BASE_URL,
    });
}

async function generateArticleViaDeepSeek(score, topic) {
    const profile = getDifficultyProfile(score);
    const tier = getRankTier(score);
    const quizBlueprint = getQuizBlueprint(score);
    const client = createDeepSeekClient();
    const prompt = buildArticlePrompt({
        topic,
        score,
        rankName: tier.name,
        primaryLabel: tier.primaryLabel,
        secondaryLabel: tier.secondaryLabel,
        difficulty: getLegacyDifficultyFromScore(score),
        profile,
        quizBlueprint,
    });

    const completion = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.45,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
        throw new Error("DeepSeek returned empty content.");
    }

    const parsed = JSON.parse(raw);
    const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
    if (!content) {
        throw new Error("DeepSeek returned JSON without article content.");
    }

    return {
        title: typeof parsed.title === "string" ? parsed.title.trim() : "",
        content,
        byline: typeof parsed.byline === "string" && parsed.byline.trim() ? parsed.byline.trim() : "CAT Adaptive Trainer",
    };
}

async function generateArticle(score, topic) {
    const localRouteUrl = resolveLocalSessionStartUrl();
    if (localRouteUrl) {
        try {
            const result = await generateArticleViaLocalRoute(score, topic);
            if (result?.article) {
                return { ...result, source: "local-route" };
            }
        } catch (error) {
            if (!DEEPSEEK_API_KEY) {
                throw new Error(`Local route failed and DEEPSEEK_API_KEY is missing: ${error.message}`);
            }
            console.warn(`[${score}] local route unavailable, falling back to DeepSeek: ${error.message}`);
        }

        if (!DEEPSEEK_API_KEY) {
            throw new Error("Local route did not return an article and DEEPSEEK_API_KEY is missing.");
        }
    } else if (DEEPSEEK_API_KEY) {
        console.warn(`[${score}] local route unavailable, falling back to DeepSeek: no local CAT session URL configured.`);
    }

    const article = await generateArticleViaDeepSeek(score, topic);
    return { article, source: "deepseek", validationSummary: null, qualityTier: null };
}

function summarizeSamples(samples) {
    const total = Math.max(1, samples.length);
    const structureHitCount = samples.filter((sample) => sample.structureHit).length;
    const registerHitCount = samples.filter((sample) => sample.registerHit).length;
    const overallHitCount = samples.filter((sample) => sample.overallHit).length;
    const degradedCount = samples.filter((sample) => sample.degraded).length;
    const avgLatencyMs = samples.reduce((sum, sample) => sum + sample.latencyMs, 0) / total;

    return {
        samples: total,
        structureHitRate: structureHitCount / total,
        registerHitRate: registerHitCount / total,
        overallHitRate: overallHitCount / total,
        avgLatencyMs,
        degradedRate: degradedCount / total,
    };
}

function printUsage() {
    console.log(`
Lightweight CAT difficulty smoke check.

Usage:
  node scripts/cat-difficulty-smoke-check.mjs

Environment:
  DEEPSEEK_API_KEY        required for the DeepSeek fallback path
  DEEPSEEK_BASE_URL       optional, defaults to https://api.deepseek.com
  CAT_SESSION_START_URL   optional, tries the local /api/ai/cat/session/start first
  APP_URL / NEXT_PUBLIC_APP_URL / LOCAL_APP_URL
                          optional base URL used to build the local API endpoint
  CAT_SMOKE_EMAIL         optional, enables Supabase login for local-route auth
  CAT_SMOKE_PASSWORD      optional, enables Supabase login for local-route auth
`.trim());
}

function parseArgs(argv) {
    const flags = new Set(argv);
    return {
        help: flags.has("--help") || flags.has("-h"),
    };
}

async function run() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    const localRouteUrl = resolveLocalSessionStartUrl();
    if (!DEEPSEEK_API_KEY && !localRouteUrl) {
        throw new Error("Missing DEEPSEEK_API_KEY and no local CAT session route configured. Set DEEPSEEK_API_KEY or CAT_SESSION_START_URL / APP_URL.");
    }

    const scores = DEFAULT_SCORES;
    const runId = new Date().toISOString();
    console.log(`CAT difficulty smoke check (lightweight)`);
    console.log(`Run: ${runId}`);
    console.log(`Scores: ${scores.join(", ")}`);
    console.log(`Sampling rule: 2 articles minimum, expand to 5 only if the first 2 do not both pass overall.`);
    console.log(`Primary path: local route with smoke login when available, otherwise DeepSeek fallback + local validation.`);
    console.log("");

    const results = [];

    for (const score of scores) {
        const profile = getDifficultyProfile(score);
        const topic = defaultTopicByScore(score);
        const samples = [];

        for (let index = 1; index <= MAX_SAMPLES; index += 1) {
            const startedAt = performance.now();
            let article;
            let source = "deepseek";
            let validationSummary = null;
            let qualityTier = null;
            let generationError = null;

            try {
                const generated = await generateArticle(score, topic);
                article = generated.article;
                source = generated.source;
                validationSummary = generated.validationSummary;
                qualityTier = generated.qualityTier;
            } catch (error) {
                generationError = error;
            }

            const latencyMs = performance.now() - startedAt;
            const text = article?.content ?? "";
            const hasLocalValidationSummary = source === "local-route" && validationSummary && typeof validationSummary === "object";

            let structureHit;
            let registerHit;
            let overallHit;
            let degraded;

            if (hasLocalValidationSummary) {
                const lexical = validationSummary.lexical;
                structureHit = Boolean(validationSummary.structure?.ok);
                registerHit =
                    Boolean(lexical && typeof lexical === "object") &&
                    ["coreCoverage", "stretchCoverage", "overlevelPenalty", "confidence"].every((field) => isFiniteNumber(lexical[field]));
                overallHit = Boolean(validationSummary.passed);
                degraded = qualityTier === "degraded";
            } else {
                const structure = text ? validateArticleAgainstDifficultyProfile(text, profile) : null;
                const register = text ? evaluateRegister(text, score) : null;
                structureHit = Boolean(structure?.isValid);
                registerHit = Boolean(register?.hit);
                overallHit = Boolean(text) && structureHit && registerHit && !generationError;
                degraded = !overallHit;
            }

            samples.push({
                index,
                source,
                latencyMs,
                generationError: generationError ? generationError.message : null,
                structureHit,
                registerHit,
                overallHit,
                degraded,
            });

            const status = generationError
                ? `error: ${generationError.message}`
                : `structure=${structureHit ? "pass" : "fail"} register=${registerHit ? "pass" : "fail"} overall=${overallHit ? "pass" : "fail"}${hasLocalValidationSummary ? ` tier=${qualityTier ?? "unknown"}` : ""}`;
            console.log(`[${score}] sample ${index}/${MAX_SAMPLES} (${source}) ${formatMs(latencyMs)} ${status}`);

            if (index >= MIN_SAMPLES && samples.every((sample) => sample.overallHit)) {
                console.log(`[${score}] early stop after ${index} samples.`);
                break;
            }
        }

        const summary = summarizeSamples(samples);
        results.push({
            score,
            topic,
            profile,
            summary,
            samples,
        });

        console.log(
            `[${score}] summary: samples=${summary.samples}, structure=${formatPercent(summary.structureHitRate)}, register=${formatPercent(summary.registerHitRate)}, overall=${formatPercent(summary.overallHitRate)}, avg=${formatMs(summary.avgLatencyMs)}, degraded=${formatPercent(summary.degradedRate)}`,
        );
        console.log("");
    }

    console.log("Summary table");
    console.log("| score | samples | structure | register | overall | avg_ms | degraded |");
    console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
    for (const result of results) {
        const { summary } = result;
        console.log(
            `| ${result.score} | ${summary.samples} | ${formatPercent(summary.structureHitRate)} | ${formatPercent(summary.registerHitRate)} | ${formatPercent(summary.overallHitRate)} | ${Math.round(summary.avgLatencyMs)} | ${formatPercent(summary.degradedRate)} |`,
        );
    }

    console.log("");
    console.log(
        JSON.stringify(
            {
                mode: "lightweight-cat-difficulty-smoke-check",
                runId,
                scores,
                minSamples: MIN_SAMPLES,
                maxSamples: MAX_SAMPLES,
                results: results.map((result) => ({
                    score: result.score,
                    samples: result.summary.samples,
                    structureHitRate: result.summary.structureHitRate,
                    registerHitRate: result.summary.registerHitRate,
                    overallHitRate: result.summary.overallHitRate,
                    avgLatencyMs: result.summary.avgLatencyMs,
                    degradedRate: result.summary.degradedRate,
                })),
            },
            null,
            2,
        ),
    );
}

run().catch((error) => {
    console.error(`cat difficulty smoke check failed: ${error.message}`);
    process.exitCode = 1;
});
