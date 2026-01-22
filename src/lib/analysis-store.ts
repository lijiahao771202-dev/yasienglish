import { create } from 'zustand';
import { db } from './db';

interface AnalysisState {
    // We keep a small in-memory cache for immediate access, but primary source is DB
    translations: Record<string, string>;
    grammarAnalyses: Record<string, any>;

    setTranslation: (text: string, translation: string) => Promise<void>;
    setGrammarAnalysis: (text: string, analysis: any) => Promise<void>;

    // These now return Promises or we use a hook in the component
    loadFromDB: (text: string) => Promise<void>;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
    translations: {},
    grammarAnalyses: {},

    setTranslation: async (text, translation) => {
        // 1. Update memory
        set((state) => ({
            translations: { ...state.translations, [text]: translation }
        }));
        // 2. Update DB
        try {
            await db.ai_cache.put({
                key: text,
                type: 'translation',
                data: translation,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Failed to save translation to DB", e);
        }
    },

    setGrammarAnalysis: async (text, analysis) => {
        // 1. Update memory
        set((state) => ({
            grammarAnalyses: { ...state.grammarAnalyses, [text]: analysis }
        }));
        // 2. Update DB
        try {
            await db.ai_cache.put({
                key: text,
                type: 'grammar',
                data: analysis,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Failed to save grammar analysis to DB", e);
        }
    },

    loadFromDB: async (text) => {
        // Check if already in memory
        if (get().translations[text] && get().grammarAnalyses[text]) return;

        try {
            const translationItem = await db.ai_cache.where({ key: text, type: 'translation' }).first();
            const grammarItem = await db.ai_cache.where({ key: text, type: 'grammar' }).first();

            set((state) => ({
                translations: translationItem ? { ...state.translations, [text]: translationItem.data } : state.translations,
                grammarAnalyses: grammarItem ? { ...state.grammarAnalyses, [text]: grammarItem.data } : state.grammarAnalyses
            }));
        } catch (e) {
            console.error("Failed to load from DB", e);
        }
    }
}));
