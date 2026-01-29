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

export interface EloHistoryItem {
    id?: number;
    mode: 'translation' | 'listening';
    elo: number;
    change: number;
    timestamp: number;
}

export class YasiDB extends Dexie {
    ai_cache!: Table<AICacheItem>;
    feeds!: Table<FeedCacheItem>;
    read_articles!: Table<ReadArticleItem>;
    vocabulary!: Table<VocabItem>;
    writing_history!: Table<WritingEntry>;
    articles!: Table<CachedArticle>;
    elo_history!: Table<EloHistoryItem, number>;
    user_profile!: Table<{
        id?: number;
        elo_rating: number;
        streak_count: number;
        max_elo: number;
        last_practice: number;
        // Listening Stats (Optional for backward compatibility)
        listening_elo?: number;
        listening_streak?: number;
        listening_max_elo?: number;
    }>;

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

        // Version 3: Add FSRS fields to vocabulary
        this.version(3).stores({
            vocabulary: '&word, timestamp, due, state'
        }).upgrade(tx => {
            return tx.table('vocabulary').toCollection().modify(item => {
                if (item.stability === undefined) {
                    item.stability = 0;
                    item.difficulty = 0;
                    item.elapsed_days = 0;
                    item.scheduled_days = 0;
                    item.reps = 0;
                    item.state = 0;
                    item.last_review = 0;
                    item.due = Date.now();
                }
            });
        });

        // Version 4: Add User Profile (Elo)
        this.version(4).stores({
            user_profile: '++id' // Singleton table essentially
        }).upgrade(async tx => {
            // Initialize default profile
            await tx.table('user_profile').add({
                elo_rating: 600,
                streak_count: 0,
                max_elo: 600,
                last_practice: Date.now()
            });
        });

        // Version 5: Add Listening Specific Stats
        this.version(5).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                if (profile.listening_elo === undefined) {
                    profile.listening_elo = 600;
                    profile.listening_streak = 0;
                    profile.listening_max_elo = 600;
                }
            });
        });

        // Version 6: Add Elo History
        this.version(6).stores({
            elo_history: '++id, mode, timestamp'
        });
    }
}

export const db = new YasiDB();
