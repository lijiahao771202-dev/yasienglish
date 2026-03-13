import { create } from 'zustand';
import { VocabItem } from './db';
import {
    loadLocalUserData,
    markArticleAsRead,
    saveVocabulary,
    saveWritingHistory,
} from './user-repository';

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
            await saveVocabulary(item);
        } catch (e) {
            console.error("Failed to save vocabulary", e);
        }
    },

    addWritingHistory: async (item) => {
        // Optimistic update (we might need the ID from DB though, but for now push)
        set((state) => ({ writingHistory: [item, ...state.writingHistory] }));
        try {
            await saveWritingHistory(item);
        } catch (e) {
            console.error("Failed to save writing history", e);
        }
    },

    markArticleAsRead: async (url) => {
        if (get().readArticleUrls.includes(url)) return;

        set((state) => ({ readArticleUrls: [...state.readArticleUrls, url] }));
        try {
            await markArticleAsRead(url);
        } catch (e) {
            console.error("Failed to mark article as read", e);
        }
    },

    loadUserData: async () => {
        try {
            const { vocabulary, writingHistory, readArticleUrls } = await loadLocalUserData();

            set({
                vocabulary,
                writingHistory,
                readArticleUrls,
            });
        } catch (e) {
            console.error("Failed to load user data", e);
        }
    }
}));
