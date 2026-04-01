import { create } from 'zustand';
import { db } from './db';

interface AnalysisState {
    // We keep a small in-memory cache for immediate access, but primary source is DB
    translations: Record<string, string>;
    grammarAnalyses: Record<string, unknown>;

    setTranslation: (text: string, translation: string) => Promise<void>;
    setGrammarAnalysis: (cacheKey: string, analysis: unknown) => Promise<void>;

    // These now return Promises or we use a hook in the component
    loadFromDB: (text: string, grammarCacheKey?: string, grammarLegacyFallbackKey?: string) => Promise<void>;
    loadGrammarFromDB: (grammarCacheKey: string, legacyFallbackKey?: string) => Promise<void>;
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
            const existing = await db.ai_cache.where("[key+type]").equals([text, "translation"]).first();
            await db.ai_cache.put({
                id: existing?.id,
                key: text,
                type: 'translation',
                data: translation,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Failed to save translation to DB", e);
        }
    },

    setGrammarAnalysis: async (cacheKey, analysis) => {
        // 1. Update memory
        set((state) => ({
            grammarAnalyses: { ...state.grammarAnalyses, [cacheKey]: analysis }
        }));
        // 2. Update DB
        try {
            const existing = await db.ai_cache.where("[key+type]").equals([cacheKey, "grammar"]).first();
            await db.ai_cache.put({
                id: existing?.id,
                key: cacheKey,
                type: 'grammar',
                data: analysis,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Failed to save grammar analysis to DB", e);
        }
    },

    loadFromDB: async (text, grammarCacheKey = text, grammarLegacyFallbackKey) => {
        // Check if already in memory
        if (get().translations[text] && get().grammarAnalyses[grammarCacheKey]) return;

        try {
            const translationItem = await db.ai_cache.where("[key+type]").equals([text, "translation"]).first();
            let grammarItem = await db.ai_cache.where("[key+type]").equals([grammarCacheKey, "grammar"]).first();
            if (!grammarItem && grammarLegacyFallbackKey && grammarLegacyFallbackKey !== grammarCacheKey) {
                grammarItem = await db.ai_cache.where("[key+type]").equals([grammarLegacyFallbackKey, "grammar"]).first();
            }

            set((state) => ({
                translations: translationItem ? { ...state.translations, [text]: translationItem.data } : state.translations,
                grammarAnalyses: grammarItem ? { ...state.grammarAnalyses, [grammarCacheKey]: grammarItem.data } : state.grammarAnalyses
            }));
        } catch (e) {
            console.error("Failed to load from DB", e);
        }
    },

    loadGrammarFromDB: async (grammarCacheKey, legacyFallbackKey) => {
        if (get().grammarAnalyses[grammarCacheKey]) return;
        try {
            let grammarItem = await db.ai_cache.where("[key+type]").equals([grammarCacheKey, "grammar"]).first();
            if (!grammarItem && legacyFallbackKey && legacyFallbackKey !== grammarCacheKey) {
                grammarItem = await db.ai_cache.where("[key+type]").equals([legacyFallbackKey, "grammar"]).first();
            }

            if (!grammarItem) return;
            set((state) => ({
                grammarAnalyses: { ...state.grammarAnalyses, [grammarCacheKey]: grammarItem.data }
            }));
        } catch (e) {
            console.error("Failed to load grammar from DB", e);
        }
    },
}));
