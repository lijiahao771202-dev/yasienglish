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
    }
}

export const db = new YasiDB();
