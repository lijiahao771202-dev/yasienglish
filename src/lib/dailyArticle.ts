export interface DailyArticleFeedItem {
    link?: string | null;
    url?: string | null;
}

export interface DailyArticleResolution<TArticle> {
    url: string;
    articleData: TArticle;
    source: "cached" | "parsed";
}

interface ResolveDailyArticleCandidateOptions<TArticle> {
    items: DailyArticleFeedItem[];
    getExistingArticle: (url: string) => Promise<TArticle | undefined>;
    parseArticle: (url: string) => Promise<TArticle>;
    onParseFailure?: (url: string, error: unknown) => void;
}

export async function resolveDailyArticleCandidate<TArticle>({
    items,
    getExistingArticle,
    parseArticle,
    onParseFailure,
}: ResolveDailyArticleCandidateOptions<TArticle>): Promise<DailyArticleResolution<TArticle> | null> {
    for (const item of items) {
        const url = item.link || item.url;
        if (!url) continue;

        const existing = await getExistingArticle(url);
        if (existing) {
            return {
                url,
                articleData: existing,
                source: "cached",
            };
        }

        try {
            const articleData = await parseArticle(url);
            return {
                url,
                articleData,
                source: "parsed",
            };
        } catch (error) {
            onParseFailure?.(url, error);
        }
    }

    return null;
}
