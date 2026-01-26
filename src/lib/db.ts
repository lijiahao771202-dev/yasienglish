import Dexie, { Table } from 'dexie';

export interface AICacheItem {
    id?: number;
    key: string; // Unique identifier (e.g., text content or hash)
    type: 'grammar' | 'translation' | 'tts' | 'ask_ai';
    data: any;
    timestamp: number;
}

export interface FeedCacheItem {
    category: string;
    items: any[]; // ArticleItem[]
    timestamp: number;
}

export interface ReadArticleItem {
    url: string;
    timestamp: number;
}

export interface VocabItem {
    word: string;
    definition: string;
    translation: string;
    context: string;
    example: string;
    timestamp: number;
    // FSRS Fields
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    state: number; // 0: New, 1: Learning, 2: Review, 3: Relearning
    last_review: number;
    due: number;
}

export interface WritingEntry {
    id?: number;
    articleTitle: string;
    content: string;
    score: number;
    timestamp: number;
}

export interface CachedArticle {
    url: string;
    title: string;
    content: string; // Full HTML or Blocks JSON
    textContent: string;
    byline?: string;
    siteName?: string;
    blocks?: any[];
    image?: string | null;
    timestamp: number;
}

export class YasiDB extends Dexie {
    ai_cache!: Table<AICacheItem>;
    feeds!: Table<FeedCacheItem>;
    read_articles!: Table<ReadArticleItem>;
    vocabulary!: Table<VocabItem>;
    writing_history!: Table<WritingEntry>;
    articles!: Table<CachedArticle>;

    constructor() {
        super('YasiDB');

        // Version 1
        this.version(1).stores({
            ai_cache: '++id, &key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp',
            vocabulary: '&word, timestamp',
            writing_history: '++id, articleTitle, timestamp'
        });

        // Version 2: Add articles table
        this.version(2).stores({
            ai_cache: '++id, &key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp',
            vocabulary: '&word, timestamp',
            writing_history: '++id, articleTitle, timestamp',
            articles: '&url, title, timestamp'
        });

        // Version 3: Add FSRS fields to vocabulary (indexing 'due' for review queries)
        this.version(3).stores({
            vocabulary: '&word, timestamp, due, state'
        }).upgrade(tx => {
            // Migration logic if needed, usually Dexie handles adding new props lazily, 
            // but we might want to initialize existing items. 
            // For now, let's assume we can lazily migrate when accessing data or just let new fields be undefined initially.
            // But strict typing suggests we should probably have defaults. 
            // Dexie upgrade is robust.
            return tx.table('vocabulary').toCollection().modify(item => {
                if (item.stability === undefined) {
                    item.stability = 0;
                    item.difficulty = 0;
                    item.elapsed_days = 0;
                    item.scheduled_days = 0;
                    item.reps = 0;
                    item.state = 0; // New
                    item.last_review = 0;
                    item.due = Date.now();
                }
            });
        });
    }
}

export const db = new YasiDB();
