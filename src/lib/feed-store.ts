import { create } from 'zustand';
import { ArticleItem } from '@/components/reading/RecommendedArticles';
import { db } from './db';

interface FeedState {
    feeds: Record<string, ArticleItem[]>;
    setFeed: (category: string, articles: ArticleItem[]) => Promise<void>;
    getFeed: (category: string) => ArticleItem[] | undefined;
    loadFeedFromDB: (category: string) => Promise<void>;
    deleteArticle: (category: string, link: string) => Promise<void>;
}

export const useFeedStore = create<FeedState>((set, get) => ({
    feeds: {},
    setFeed: async (category, articles) => {
        // 1. Update memory
        set((state) => ({
            feeds: { ...state.feeds, [category]: articles }
        }));
        // 2. Update DB
        try {
            await db.feeds.put({
                category,
                items: articles,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Failed to save feed to DB", e);
        }
    },
    getFeed: (category) => get().feeds[category],
    loadFeedFromDB: async (category) => {
        if (get().feeds[category]) return;
        try {
            const feed = await db.feeds.get(category);
            if (feed) {
                set((state) => ({
                    feeds: { ...state.feeds, [category]: feed.items }
                }));
            }
        } catch (e) {
            console.error("Failed to load feed from DB", e);
        }
    },
    deleteArticle: async (category, link) => {
        const currentArticles = get().feeds[category] || [];
        const newArticles = currentArticles.filter(item => item.link !== link);
        
        // 1. Update memory
        set((state) => ({
            feeds: { ...state.feeds, [category]: newArticles }
        }));

        // 2. Update DB
        try {
            await db.feeds.put({
                category,
                items: newArticles,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Failed to delete article from DB", e);
        }
    }
}));
