import { create } from 'zustand';
import { db, VocabItem } from './db';

// Removed local VocabularyItem interface in favor of db.ts export

export interface WritingHistoryItem {
    id?: number;
    articleTitle: string;
    content: string;
    score: number;
    timestamp: number;
}

interface UserState {
    vocabulary: VocabItem[];
    writingHistory: WritingHistoryItem[];
    readArticleUrls: string[]; // In-memory cache of read URLs

    addVocabulary: (item: VocabItem) => Promise<void>;
    addWritingHistory: (item: WritingHistoryItem) => Promise<void>;
    markArticleAsRead: (url: string) => Promise<void>;

    // Loaders
    loadUserData: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
    vocabulary: [],
    writingHistory: [],
    readArticleUrls: [],

    addVocabulary: async (item) => {
        set((state) => ({ vocabulary: [...state.vocabulary, item] }));
        try {
            await db.vocabulary.put(item);
        } catch (e) {
            console.error("Failed to save vocabulary", e);
        }
    },

    addWritingHistory: async (item) => {
        // Optimistic update (we might need the ID from DB though, but for now push)
        set((state) => ({ writingHistory: [item, ...state.writingHistory] }));
        try {
            await db.writing_history.add(item);
        } catch (e) {
            console.error("Failed to save writing history", e);
        }
    },

    markArticleAsRead: async (url) => {
        if (get().readArticleUrls.includes(url)) return;

        set((state) => ({ readArticleUrls: [...state.readArticleUrls, url] }));
        try {
            await db.read_articles.put({ url, timestamp: Date.now() });
        } catch (e) {
            console.error("Failed to mark article as read", e);
        }
    },

    loadUserData: async () => {
        try {
            const [vocab, history, readArticles] = await Promise.all([
                db.vocabulary.toArray(),
                db.writing_history.orderBy('timestamp').reverse().toArray(),
                db.read_articles.toArray()
            ]);

            set({
                vocabulary: vocab,
                writingHistory: history,
                readArticleUrls: readArticles.map(r => r.url)
            });
        } catch (e) {
            console.error("Failed to load user data", e);
        }
    }
}));
