import type { CachedArticle } from "@/lib/db";

export function buildReadArticleCloudPayload(
    article: Partial<CachedArticle> & {
        url?: string;
        title?: string;
        content?: string;
        textContent?: string;
    },
    timestamp: number,
): CachedArticle {
    return {
        url: article.url || "",
        title: article.title || "",
        content: article.content || "",
        textContent: article.textContent || article.content || "",
        byline: article.byline,
        siteName: article.siteName,
        videoUrl: article.videoUrl ?? null,
        image: article.image ?? null,
        blocks: article.blocks,
        timestamp,
        difficulty: article.difficulty,
        isAIGenerated: article.isAIGenerated,
        isCatMode: article.isCatMode,
        catSessionId: article.catSessionId,
        catBand: article.catBand,
        catScoreSnapshot: article.catScoreSnapshot,
        catThetaSnapshot: article.catThetaSnapshot,
        catSeSnapshot: article.catSeSnapshot,
        catSessionBlueprint: article.catSessionBlueprint,
        catQuizBlueprint: article.catQuizBlueprint,
        catSelfAssessed: article.catSelfAssessed,
        quizCompleted: article.quizCompleted,
        quizCorrect: article.quizCorrect,
        quizTotal: article.quizTotal,
        quizScorePercent: article.quizScorePercent,
        quizQuestions: article.quizQuestions,
        quizAnswers: article.quizAnswers,
        quizResponses: article.quizResponses,
        quizQualityTier: article.quizQualityTier,
    };
}
