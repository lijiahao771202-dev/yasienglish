import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { deepseek } from "@/lib/deepseek";
import {
    buildAiProviderRateLimitPayload,
    getAiProviderRetryAfterSeconds,
    isAiProviderRateLimitError,
} from "@/lib/ai-provider-errors";
import {
    CAT_OBJECTIVE_QUESTION_TYPES,
    type CatObjectiveQuestionType,
    buildObjectiveDistribution,
    getCatRankTier,
    getCatQuizBlueprint,
    normalizeCatScore,
} from "@/lib/cat-score";

type Difficulty = "cet4" | "cet6" | "ielts";

type QuizMode = "standard" | "cat";

interface QuizRequestPayload {
    articleContent?: string;
    difficulty?: Difficulty;
    title?: string;
    quizMode?: QuizMode;
    catBand?: number;
    catScore?: number;
    catQuizBlueprint?: {
        questionCount?: number;
        distribution?: Partial<Record<CatObjectiveQuestionType, number>>;
        allowedTypes?: CatObjectiveQuestionType[];
    };
}

interface QuizCacheEntry {
    createdAt: number;
    payload: {
        questions: unknown[];
        difficulty: Difficulty;
        articleTitle?: string;
        quizMode: QuizMode;
        catBand: number | null;
        catBlueprint: {
            score: number;
            questionCount: number;
            distribution: Record<CatObjectiveQuestionType, number>;
        } | null;
        standardBlueprint: {
            questionCount: number;
            distribution: Record<CatObjectiveQuestionType, number>;
        } | null;
        generationMs?: number;
    };
}

const QUIZ_CACHE_TTL_MS = 15 * 60 * 1000;
const QUIZ_PROMPT_VERSION = "2026-04-09-exam-style-v1";
const TRUE_FALSE_NG_OPTIONS = ["True", "False", "Not Given"] as const;

interface NormalizedExplanation {
    summary: string;
    reasoning?: string;
    trap?: string;
}

export interface NormalizedGeneratedQuestion {
    id: number;
    itemId: string;
    type: CatObjectiveQuestionType;
    question: string;
    options: string[];
    answer?: string;
    answers?: string[];
    sourceParagraph: string;
    evidence: string;
    explanation: NormalizedExplanation;
    itemDifficulty: number;
}

function getQuizCacheStore() {
    const globalScope = globalThis as typeof globalThis & { __yasiQuizCache?: Map<string, QuizCacheEntry> };
    if (!globalScope.__yasiQuizCache) {
        globalScope.__yasiQuizCache = new Map<string, QuizCacheEntry>();
    }
    return globalScope.__yasiQuizCache;
}

function pruneQuizCache(store: Map<string, QuizCacheEntry>, now: number) {
    for (const [key, entry] of store.entries()) {
        if (now - entry.createdAt > QUIZ_CACHE_TTL_MS) {
            store.delete(key);
        }
    }
}

const TYPE_LABELS: Record<CatObjectiveQuestionType, string> = {
    multiple_choice: "单选题",
    multiple_select: "多选题",
    true_false_ng: "True/False/Not Given",
    matching: "段落匹配",
    fill_blank_choice: "选项填空",
};

const STANDARD_DISTRIBUTION: Record<Difficulty, Record<CatObjectiveQuestionType, number>> = {
    cet4: {
        multiple_choice: 3,
        multiple_select: 1,
        true_false_ng: 1,
        matching: 0,
        fill_blank_choice: 0,
    },
    cet6: {
        multiple_choice: 2,
        multiple_select: 1,
        true_false_ng: 1,
        matching: 1,
        fill_blank_choice: 1,
    },
    ielts: {
        multiple_choice: 1,
        multiple_select: 1,
        true_false_ng: 2,
        matching: 2,
        fill_blank_choice: 1,
    },
};

const QUESTION_TYPE_OFFSETS: Record<CatObjectiveQuestionType, number> = {
    multiple_choice: -0.15,
    true_false_ng: -0.05,
    fill_blank_choice: 0.12,
    matching: 0.2,
    multiple_select: 0.32,
};

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function sumDistribution(distribution: Record<CatObjectiveQuestionType, number>) {
    return CAT_OBJECTIVE_QUESTION_TYPES.reduce((sum, type) => sum + distribution[type], 0);
}

function toPositiveInteger(value: unknown): number | null {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.round(num));
}

function sanitizeDistribution(
    input: Partial<Record<CatObjectiveQuestionType, number>> | undefined,
    questionCount: number,
    fallback: Record<CatObjectiveQuestionType, number>,
    options?: {
        allowedTypes?: CatObjectiveQuestionType[];
    },
) {
    const safeQuestionCount = Math.max(1, Math.round(questionCount));
    const allowedTypeSet = new Set(
        (options?.allowedTypes ?? CAT_OBJECTIVE_QUESTION_TYPES).filter((type) =>
            CAT_OBJECTIVE_QUESTION_TYPES.includes(type),
        ),
    );
    const candidate = CAT_OBJECTIVE_QUESTION_TYPES.reduce((acc, type) => {
        const parsed = toPositiveInteger(input?.[type]);
        acc[type] = allowedTypeSet.has(type) ? (parsed ?? 0) : 0;
        return acc;
    }, {} as Record<CatObjectiveQuestionType, number>);

    if (sumDistribution(candidate) !== safeQuestionCount) {
        const fallbackTotal = sumDistribution(fallback);
        if (fallbackTotal === safeQuestionCount) {
            return fallback;
        }

        const fallbackRatios = CAT_OBJECTIVE_QUESTION_TYPES.reduce((acc, type) => {
            acc[type] = fallbackTotal > 0 ? fallback[type] / fallbackTotal : 0;
            return acc;
        }, {} as Record<CatObjectiveQuestionType, number>);

        return buildObjectiveDistribution(safeQuestionCount, fallbackRatios, {
            allowedTypes: Array.from(allowedTypeSet),
        });
    }

    return candidate;
}

function distributionText(distribution: Record<CatObjectiveQuestionType, number>) {
    return CAT_OBJECTIVE_QUESTION_TYPES
        .map((type) => `- ${TYPE_LABELS[type]} (${type}): ${distribution[type]} 题`)
        .join("\n");
}

function getStandardExamStyleGuide(difficulty: Difficulty) {
    switch (difficulty) {
        case "cet4":
            return `Target exam feel: CET-4 reading.
- Prioritize main idea, detail locating, reference resolution, and vocabulary-in-context.
- Keep stems short and clear; avoid excessive abstraction or nested logic.
- Distractors should be plausible but still distinguishable from the correct option through direct textual evidence.
- Prefer questions that feel like college English test items, not generic app trivia.`;
        case "cet6":
            return `Target exam feel: CET-6 reading.
- Emphasize inference, writer attitude, paragraph function, and sentence purpose in addition to factual detail.
- Allow moderate paraphrase between the article and options; do not copy the source sentence verbatim.
- Distractors should be stronger and closer to the passage wording than CET-4 style items.
- Make the set feel like upper-band college English reading practice.`;
        case "ielts":
        default:
            return `Target exam feel: IELTS Academic reading.
- Favor evidence-sensitive items such as True/False/Not Given, matching, and summary-gap style reasoning when the distribution allows.
- Use careful paraphrase and require the learner to distinguish contradiction from not mentioned.
- Distractors should be subtle, information-dense, and grounded in specific evidence spans.
- Make stems concise, objective, and exam-like rather than explanatory.`;
    }
}

function getCatExamStyleGuide(score: number) {
    const tier = getCatRankTier(score);

    if (score < 800) {
        return `Target learner band: ${tier.primaryLabel} / ${tier.secondaryLabel}.
- Keep the questions literal and evidence-first.
- Favor direct detail checks, simple reference questions, and low-burden vocabulary-in-context.
- Limit each item to one reasoning step.`;
    }

    if (score < 1400) {
        return `Target learner band: ${tier.primaryLabel} / ${tier.secondaryLabel}.
- Make the set feel like CET-4 level reading practice.
- Prioritize main idea, detail locating, reference resolution, and contextual vocabulary.
- Use moderate paraphrase, but keep the answer path stable and teachable.`;
    }

    if (score < 2000) {
        return `Target learner band: ${tier.primaryLabel} / ${tier.secondaryLabel}.
- Make the set feel like CET-6 to TEM-4-prep practice.
- Include inference, attitude, rhetorical purpose, and paragraph relation questions.
- Distractors should be closer to the correct answer and require stronger elimination.`;
    }

    if (score < 2600) {
        return `Target learner band: ${tier.primaryLabel} / ${tier.secondaryLabel}.
- Make the set feel like TEM-4 / IELTS 6.x practice.
- Blend detail, inference, paragraph-function, and cross-sentence evidence questions.
- Use denser paraphrase and more competitive distractors.`;
    }

    return `Target learner band: ${tier.primaryLabel} / ${tier.secondaryLabel}.
- Make the set feel like IELTS 7+ / TEM-8 style reading.
- Use paragraph matching, viewpoint discrimination, summary-gap logic, and nuanced inference where allowed.
- Require precise evidence control; wrong options should often be partially true but textually unsupported for the exact claim.`;
}

function getDifficultyBaseTheta(difficulty: Difficulty) {
    switch (difficulty) {
        case "cet4":
            return -0.45;
        case "cet6":
            return 0.35;
        case "ielts":
        default:
            return 1.1;
    }
}

function getScoreBaseTheta(score: number) {
    return (normalizeCatScore(score) / 3200) * 6 - 3;
}

function getExpectedDifficulty(params: {
    quizMode: QuizMode;
    difficulty: Difficulty;
    score: number;
    order: number;
    questionCount: number;
    type: CatObjectiveQuestionType;
}) {
    const { quizMode, difficulty, score, order, questionCount, type } = params;
    const baseTheta = quizMode === "cat" ? getScoreBaseTheta(score) : getDifficultyBaseTheta(difficulty);
    const spread = questionCount > 1 ? ((order - 1) / (questionCount - 1)) * 0.9 - 0.35 : 0;
    const withTypeOffset = baseTheta + spread + QUESTION_TYPE_OFFSETS[type];
    return Number(clamp(withTypeOffset, -3.5, 4.5).toFixed(3));
}

function normalizeOptionText(option: string, index: number) {
    const trimmed = option.trim();
    const expectedLetter = String.fromCharCode(65 + index);
    return /^[A-D](?:[).:\-\s]|$)/i.test(trimmed) ? trimmed : `${expectedLetter}. ${trimmed}`;
}

function stripOptionPrefix(option: string) {
    return option.replace(/^[A-D](?:[).:\-\s]+)?/i, "").trim();
}

function resolveAnswerToken(token: string, options: string[]) {
    const normalizedToken = token.trim().toUpperCase();
    if (["A", "B", "C", "D"].includes(normalizedToken)) {
        return normalizedToken;
    }

    const matchedIndex = options.findIndex((option) => {
        const full = option.trim().toUpperCase();
        const withoutPrefix = stripOptionPrefix(option).toUpperCase();
        return full === normalizedToken || withoutPrefix === normalizedToken;
    });

    return matchedIndex >= 0 ? String.fromCharCode(65 + matchedIndex) : normalizedToken;
}

function resolveTrueFalseNgAnswer(token: string) {
    const normalizedToken = token.trim().toUpperCase();
    if (normalizedToken === "A" || normalizedToken === "TRUE") return "True";
    if (normalizedToken === "B" || normalizedToken === "FALSE") return "False";
    if (normalizedToken === "C" || normalizedToken === "NOT GIVEN" || normalizedToken === "NOT_GIVEN") {
        return "Not Given";
    }
    return "";
}

function normalizeExplanation(candidate: Record<string, unknown>) {
    const rawExplanation = candidate.explanation;
    if (typeof rawExplanation === "string" && rawExplanation.trim()) {
        return {
            summary: rawExplanation.trim(),
            reasoning: typeof candidate.reasoning === "string" ? candidate.reasoning.trim() : undefined,
            trap: typeof candidate.trap === "string" ? candidate.trap.trim() : undefined,
        } satisfies NormalizedExplanation;
    }

    if (rawExplanation && typeof rawExplanation === "object") {
        const explanationObj = rawExplanation as Record<string, unknown>;
        const summary = typeof explanationObj.summary === "string"
            ? explanationObj.summary.trim()
            : "";
        if (summary) {
            return {
                summary,
                reasoning: typeof explanationObj.reasoning === "string" ? explanationObj.reasoning.trim() : undefined,
                trap: typeof explanationObj.trap === "string" ? explanationObj.trap.trim() : undefined,
            } satisfies NormalizedExplanation;
        }
    }

    return null;
}

export function normalizeGeneratedQuestions(
    rawQuestions: unknown[],
    params: {
        quizMode: QuizMode;
        difficulty: Difficulty;
        score: number;
        expectedCount: number;
        allowedTypes: CatObjectiveQuestionType[];
    },
) {
    const allowedTypeSet = new Set(params.allowedTypes);
    const safeExpectedCount = Math.max(1, params.expectedCount);
    const normalized: NormalizedGeneratedQuestion[] = [];

    for (const rawQuestion of rawQuestions) {
        if (!rawQuestion || typeof rawQuestion !== "object") continue;
        const candidate = rawQuestion as Record<string, unknown>;
        const rawType = typeof candidate.type === "string" ? candidate.type : "";
        const type = CAT_OBJECTIVE_QUESTION_TYPES.includes(rawType as CatObjectiveQuestionType)
            ? rawType as CatObjectiveQuestionType
            : null;
        if (!type || !allowedTypeSet.has(type)) continue;

        const question = typeof candidate.question === "string" ? candidate.question.trim() : "";
        const sourceParagraph = typeof candidate.sourceParagraph === "string" ? candidate.sourceParagraph.trim() : "";
        const evidence = typeof candidate.evidence === "string" ? candidate.evidence.trim() : "";
        const explanation = normalizeExplanation(candidate);
        if (!question || !sourceParagraph || !evidence || !explanation) continue;

        if (type === "true_false_ng") {
            const rawAnswer = typeof candidate.answer === "string" ? resolveTrueFalseNgAnswer(candidate.answer) : "";
            if (!rawAnswer) continue;
            normalized.push({
                id: normalized.length + 1,
                itemId: `quiz-item-${normalized.length + 1}`,
                type,
                question,
                options: [...TRUE_FALSE_NG_OPTIONS],
                answer: rawAnswer,
                sourceParagraph,
                evidence,
                explanation,
                itemDifficulty: typeof candidate.itemDifficulty === "number"
                    ? Number(clamp(candidate.itemDifficulty, -3.5, 4.5).toFixed(3))
                    : getExpectedDifficulty({
                        quizMode: params.quizMode,
                        difficulty: params.difficulty,
                        score: params.score,
                        order: normalized.length + 1,
                        questionCount: safeExpectedCount,
                        type,
                    }),
            });
            continue;
        }

        const rawOptions = Array.isArray(candidate.options)
            ? candidate.options.filter((option): option is string => typeof option === "string" && option.trim().length > 0)
            : [];
        if (rawOptions.length !== 4) continue;
        const options = rawOptions.map(normalizeOptionText);

        if (type === "multiple_select") {
            const rawAnswers = Array.isArray(candidate.answers)
                ? candidate.answers.filter((answer): answer is string => typeof answer === "string" && answer.trim().length > 0)
                : [];
            const fallbackAnswer = typeof candidate.answer === "string"
                ? candidate.answer.split(/[，,;/|\s]+/g).filter(Boolean)
                : [];
            const answers = Array.from(new Set([...rawAnswers, ...fallbackAnswer].map((answer) => resolveAnswerToken(answer, options))))
                .filter((answer) => ["A", "B", "C", "D"].includes(answer));
            if (answers.length < 2 || answers.length > 3) continue;

            normalized.push({
                id: normalized.length + 1,
                itemId: `quiz-item-${normalized.length + 1}`,
                type,
                question,
                options,
                answers,
                sourceParagraph,
                evidence,
                explanation,
                itemDifficulty: typeof candidate.itemDifficulty === "number"
                    ? Number(clamp(candidate.itemDifficulty, -3.5, 4.5).toFixed(3))
                    : getExpectedDifficulty({
                        quizMode: params.quizMode,
                        difficulty: params.difficulty,
                        score: params.score,
                        order: normalized.length + 1,
                        questionCount: safeExpectedCount,
                        type,
                    }),
            });
            continue;
        }

        const answer = typeof candidate.answer === "string" ? resolveAnswerToken(candidate.answer, options) : "";
        if (!["A", "B", "C", "D"].includes(answer)) continue;

        normalized.push({
            id: normalized.length + 1,
            itemId: `quiz-item-${normalized.length + 1}`,
            type,
            question,
            options,
            answer,
            sourceParagraph,
            evidence,
            explanation,
            itemDifficulty: typeof candidate.itemDifficulty === "number"
                ? Number(clamp(candidate.itemDifficulty, -3.5, 4.5).toFixed(3))
                : getExpectedDifficulty({
                    quizMode: params.quizMode,
                    difficulty: params.difficulty,
                    score: params.score,
                    order: normalized.length + 1,
                    questionCount: safeExpectedCount,
                    type,
                }),
        });
    }

    return normalized;
}

export function buildStandardInstruction(difficulty: Difficulty) {
    const distribution = STANDARD_DISTRIBUTION[difficulty] ?? STANDARD_DISTRIBUTION.ielts;
    const questionCount = sumDistribution(distribution);
    const examStyleGuide = getStandardExamStyleGuide(difficulty);

    return {
        questionCount,
        distribution,
        instruction: `Generate exactly ${questionCount} objective reading questions.
${examStyleGuide}

Question type distribution:
${distributionText(distribution)}

Question protocol (strict):
1. All questions must be objective; no short-answer questions.
2. \'multiple_choice\', \'matching\', \'fill_blank_choice\' use exactly 4 options and one correct answer in field \'answer\'.
3. \'multiple_select\' uses exactly 4 options and 2-3 correct options in field \'answers\' (array of letters, e.g., ["A", "C"]).
4. \'true_false_ng\' options must be ["True", "False", "Not Given"] and one correct answer in \'answer\'.
5. Every question must include sourceParagraph and evidence.
6. Keep explanations Chinese-first and concise.
7. Prefer paraphrased stems instead of copying a whole sentence from the passage.
8. Cover different evidence locations where reasonable; avoid asking the same idea twice.
9. Distractors must be plausible but textually wrong or unsupported, not silly.

Return JSON only:
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice | multiple_select | true_false_ng | matching | fill_blank_choice",
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "answers": ["A", "C"],
      "sourceParagraph": "2",
      "evidence": "...",
      "explanation": {
        "summary": "中文一句话结论",
        "reasoning": "中文解题思路",
        "trap": "中文易错点（可选）"
      }
    }
  ]
}`,
    };
}

export function buildCatInstruction(params: {
    score: number;
    questionCount: number;
    distribution: Record<CatObjectiveQuestionType, number>;
    allowedTypes: CatObjectiveQuestionType[];
}) {
    const { score, questionCount, distribution, allowedTypes } = params;
    const allowedTypeText = allowedTypes
        .map((type) => `${TYPE_LABELS[type]} (${type})`)
        .join("、");
    const multipleSelectAllowed = allowedTypes.includes("multiple_select");
    const examStyleGuide = getCatExamStyleGuide(score);

    return `Generate exactly ${questionCount} objective CAT adaptive reading questions.
Learner CAT score: ${score}
Allowed question types: ${allowedTypeText}
${examStyleGuide}

Question type distribution:
${distributionText(distribution)}

CAT strict protocol:
1. Keep all questions objectively answerable from the article.
2. Only use allowed question types above. Do not output any other type.
3. ${multipleSelectAllowed
        ? "\'multiple_select\' may appear, with exactly 4 options and 2-3 correct answers in \'answers\'."
        : "Do not output \'multiple_select\' for this learner."}
4. \'matching\' and \'fill_blank_choice\' should still use 4 options.
5. \'true_false_ng\' must use options ["True", "False", "Not Given"].
6. Include sourceParagraph and evidence for every question.
7. Explanation must be Chinese-first and concise.
8. Order questions from easier to harder.
9. Prefer paraphrase over surface copying in stems and options.
10. Distractors should be close enough to force reading, but still be falsifiable from the passage.
11. Keep the whole set feeling like one coherent exam paper for this learner band.

Return JSON only:
{
  "questions": [
    {
      "id": 1,
      "type": "multiple_choice | multiple_select | true_false_ng | matching | fill_blank_choice",
      "question": "...",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "answer": "A",
      "answers": ["A", "C"],
      "sourceParagraph": "2",
      "evidence": "...",
      "explanation": {
        "summary": "中文一句话结论",
        "reasoning": "中文解题思路",
        "trap": "中文易错点（可选）"
      }
    }
  ]
}`;
}

function toPromptArticle(content: string) {
    const trimmed = content.trim();
    if (trimmed.length <= 8200) return trimmed;
    return `${trimmed.slice(0, 8200)}\n\n[Article truncated for faster quiz generation. Keep questions grounded in provided content.]`;
}

export async function POST(req: Request) {
    try {
        const {
            articleContent,
            difficulty = "ielts",
            title,
            quizMode = "standard",
            catBand,
            catScore,
            catQuizBlueprint,
        } = await req.json() as QuizRequestPayload;

        if (!articleContent) {
            return NextResponse.json(
                { error: "Article content is required" },
                { status: 400 },
            );
        }

        const isCatMode = quizMode === "cat";
        const normalizedDifficulty =
            difficulty === "cet4" || difficulty === "cet6" || difficulty === "ielts"
                ? difficulty
                : "ielts";

        const normalizedCatScore = normalizeCatScore(Number(catScore ?? 1000));
        const computedCatBlueprint = getCatQuizBlueprint(normalizedCatScore);
        const requestedCount = toPositiveInteger(catQuizBlueprint?.questionCount);
        const questionCount = requestedCount && requestedCount > 0
            ? requestedCount
            : computedCatBlueprint.questionCount;

        const catDistribution = sanitizeDistribution(
            catQuizBlueprint?.distribution,
            questionCount,
            computedCatBlueprint.distribution,
            {
                allowedTypes: catQuizBlueprint?.allowedTypes ?? computedCatBlueprint.allowedTypes,
            },
        );

        const standardInstruction = buildStandardInstruction(normalizedDifficulty);
        const instruction = isCatMode
            ? buildCatInstruction({
                score: normalizedCatScore,
                questionCount,
                distribution: catDistribution,
                allowedTypes: catQuizBlueprint?.allowedTypes ?? computedCatBlueprint.allowedTypes,
            })
            : standardInstruction.instruction;

        const quizLabel = isCatMode
            ? `CAT Adaptive Score ${normalizedCatScore}`
            : `Standard ${normalizedDifficulty.toUpperCase()}`;

        const promptArticle = toPromptArticle(articleContent);
        const cacheKey = createHash("sha1")
            .update(JSON.stringify({
                version: QUIZ_PROMPT_VERSION,
                mode: quizMode,
                difficulty: normalizedDifficulty,
                title: title || "",
                article: promptArticle,
                score: normalizedCatScore,
                questionCount,
                distribution: catDistribution,
            }))
            .digest("hex");

        const cacheStore = getQuizCacheStore();
        const now = Date.now();
        pruneQuizCache(cacheStore, now);
        const cached = cacheStore.get(cacheKey);
        if (cached && now - cached.createdAt <= QUIZ_CACHE_TTL_MS) {
            return NextResponse.json({
                ...cached.payload,
                cacheHit: true,
            });
        }

        const prompt = `
You are an expert English reading exam question writer for ${quizLabel}.
Based on the following article, generate reading comprehension questions.

ARTICLE TITLE: ${title || "Untitled"}

ARTICLE CONTENT:
${promptArticle}

INSTRUCTIONS:
${instruction}

IMPORTANT:
- All questions must be directly answerable from the article content.
- Return valid JSON only, no markdown fences.
- Keep question id sequential from 1.
`;

        const generationStart = Date.now();
        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 1800,
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content) as { questions?: unknown[] };
        const normalizedCatBandValue = Number.isFinite(Number(catBand)) ? Number(catBand) : null;
        const normalizedQuestions = normalizeGeneratedQuestions(
            Array.isArray(result.questions) ? result.questions : [],
            {
                quizMode,
                difficulty: normalizedDifficulty,
                score: normalizedCatScore,
                expectedCount: isCatMode ? questionCount : standardInstruction.questionCount,
                allowedTypes: isCatMode
                    ? (catQuizBlueprint?.allowedTypes ?? computedCatBlueprint.allowedTypes)
                    : CAT_OBJECTIVE_QUESTION_TYPES.filter((type) => standardInstruction.distribution[type] > 0),
            },
        );
        const payload = {
            questions: normalizedQuestions,
            difficulty: normalizedDifficulty,
            articleTitle: title,
            quizMode,
            catBand: isCatMode ? normalizedCatBandValue : null,
            catBlueprint: isCatMode
                ? {
                    score: normalizedCatScore,
                    questionCount,
                    distribution: catDistribution,
                }
                : null,
            standardBlueprint: isCatMode
                ? null
                : {
                    questionCount: standardInstruction.questionCount,
                    distribution: standardInstruction.distribution,
                },
            generationMs: Date.now() - generationStart,
        };

        cacheStore.set(cacheKey, {
            createdAt: Date.now(),
            payload,
        });

        return NextResponse.json({
            ...payload,
            cacheHit: false,
        });
    } catch (error) {
        if (isAiProviderRateLimitError(error)) {
            console.warn("Quiz generation provider rate limited:", error);
            const retryAfterSeconds = getAiProviderRetryAfterSeconds(error);
            return NextResponse.json(
                buildAiProviderRateLimitPayload("当前 AI 模型并发请求过多，测验稍后会自动重试。"),
                {
                    status: 429,
                    headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
                },
            );
        }

        console.error("Quiz Generation API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate quiz" },
            { status: 500 },
        );
    }
}
