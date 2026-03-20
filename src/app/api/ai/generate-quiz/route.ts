import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { deepseek } from "@/lib/deepseek";
import {
    CAT_OBJECTIVE_QUESTION_TYPES,
    type CatObjectiveQuestionType,
    buildObjectiveDistribution,
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
) {
    const safeQuestionCount = Math.max(1, Math.round(questionCount));
    const candidate = CAT_OBJECTIVE_QUESTION_TYPES.reduce((acc, type) => {
        const parsed = toPositiveInteger(input?.[type]);
        acc[type] = parsed ?? 0;
        return acc;
    }, {} as Record<CatObjectiveQuestionType, number>);

    if (sumDistribution(candidate) !== safeQuestionCount || candidate.multiple_select < 1) {
        const fallbackTotal = sumDistribution(fallback);
        if (fallbackTotal === safeQuestionCount && fallback.multiple_select >= 1) {
            return fallback;
        }

        const fallbackRatios = CAT_OBJECTIVE_QUESTION_TYPES.reduce((acc, type) => {
            acc[type] = fallbackTotal > 0 ? fallback[type] / fallbackTotal : 0;
            return acc;
        }, {} as Record<CatObjectiveQuestionType, number>);

        return buildObjectiveDistribution(safeQuestionCount, fallbackRatios);
    }

    return candidate;
}

function distributionText(distribution: Record<CatObjectiveQuestionType, number>) {
    return CAT_OBJECTIVE_QUESTION_TYPES
        .map((type) => `- ${TYPE_LABELS[type]} (${type}): ${distribution[type]} 题`)
        .join("\n");
}

function buildStandardInstruction(difficulty: Difficulty) {
    const distribution = STANDARD_DISTRIBUTION[difficulty] ?? STANDARD_DISTRIBUTION.ielts;
    const questionCount = sumDistribution(distribution);

    return {
        questionCount,
        distribution,
        instruction: `Generate exactly ${questionCount} objective reading questions.
Question type distribution:
${distributionText(distribution)}

Question protocol (strict):
1. All questions must be objective; no short-answer questions.
2. \'multiple_choice\', \'matching\', \'fill_blank_choice\' use exactly 4 options and one correct answer in field \'answer\'.
3. \'multiple_select\' uses exactly 4 options and 2-3 correct options in field \'answers\' (array of letters, e.g., ["A", "C"]).
4. \'true_false_ng\' options must be ["True", "False", "Not Given"] and one correct answer in \'answer\'.
5. Every question must include sourceParagraph and evidence.
6. Keep explanations Chinese-first and concise.

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

function buildCatInstruction(params: {
    score: number;
    questionCount: number;
    distribution: Record<CatObjectiveQuestionType, number>;
}) {
    const { score, questionCount, distribution } = params;

    return `Generate exactly ${questionCount} objective CAT adaptive reading questions.
Learner CAT score: ${score}

Question type distribution:
${distributionText(distribution)}

CAT strict protocol:
1. Keep all questions objectively answerable from the article.
2. \'multiple_select\' must appear at least once, with exactly 4 options and 2-3 correct answers in \'answers\'.
3. For non-multiple-select types, provide one correct answer in field \'answer\'.
4. \'matching\' and \'fill_blank_choice\' should still use 4 options.
5. \'true_false_ng\' must use options ["True", "False", "Not Given"].
6. Include sourceParagraph and evidence for every question.
7. Explanation must be Chinese-first and concise.
8. Order questions from easier to harder.

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
        );

        const standardInstruction = buildStandardInstruction(normalizedDifficulty);
        const instruction = isCatMode
            ? buildCatInstruction({
                score: normalizedCatScore,
                questionCount,
                distribution: catDistribution,
            })
            : standardInstruction.instruction;

        const quizLabel = isCatMode
            ? `CAT Adaptive Score ${normalizedCatScore}`
            : `Standard ${normalizedDifficulty.toUpperCase()}`;

        const promptArticle = toPromptArticle(articleContent);
        const cacheKey = createHash("sha1")
            .update(JSON.stringify({
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
        const payload = {
            questions: Array.isArray(result.questions) ? result.questions : [],
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
        console.error("Quiz Generation API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate quiz" },
            { status: 500 },
        );
    }
}
