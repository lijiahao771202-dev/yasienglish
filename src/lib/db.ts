import Dexie, { Table } from 'dexie';
import type { LearningPreferences } from "@/lib/profile-settings";

export type SyncStatus = 'synced' | 'pending' | 'error';

export interface SyncTracked {
    user_id?: string;
    remote_id?: string;
    updated_at?: string;
    sync_status?: SyncStatus;
}

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
    read_at?: number;
    remote_id?: string;
    updated_at?: string;
    sync_status?: SyncStatus;
    user_id?: string;
}

export interface VocabItem extends SyncTracked {
    word: string;
    word_key?: string;
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

export interface WritingEntry extends SyncTracked {
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
    remote_id?: string;
    user_id?: string;
    mode: 'translation' | 'listening';
    elo: number;
    change: number;
    timestamp: number;
    source?: string;
    updated_at?: string;
    sync_status?: SyncStatus;
}

export interface InventoryState {
    capsule?: number;
    hint_ticket?: number;
    vocab_ticket?: number;
    audio_ticket?: number;
    refresh_ticket?: number;
}

export interface LocalUserProfile extends SyncTracked {
    id?: number;
    elo_rating: number;
    streak_count: number;
    max_elo: number;
    last_practice: number;
    listening_elo?: number;
    listening_streak?: number;
    listening_max_elo?: number;
    coins?: number;
    hints?: number;
    inventory?: InventoryState;
    owned_themes?: string[];
    active_theme?: string;
    username?: string;
    avatar_preset?: string;
    bio?: string;
    deepseek_api_key?: string;
    learning_preferences?: LearningPreferences;
}

export interface SyncOutboxItem {
    id?: number;
    entity: 'profile' | 'vocabulary' | 'writing_history' | 'read_articles' | 'elo_history';
    operation: 'upsert' | 'delete' | 'settle';
    payload: any;
    record_key: string;
    created_at: number;
    updated_at: number;
    attempts: number;
    last_error?: string;
    sync_status: SyncStatus;
}

export interface SyncMetaItem {
    key: string;
    value: any;
    updated_at: number;
}

export class YasiDB extends Dexie {
    ai_cache!: Table<AICacheItem>;
    feeds!: Table<FeedCacheItem>;
    read_articles!: Table<ReadArticleItem>;
    vocabulary!: Table<VocabItem>;
    writing_history!: Table<WritingEntry>;
    articles!: Table<CachedArticle>;
    elo_history!: Table<EloHistoryItem, number>;
    user_profile!: Table<LocalUserProfile>;
    sync_outbox!: Table<SyncOutboxItem, number>;
    sync_meta!: Table<SyncMetaItem, string>;

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

        // Version 7: Add Coins and Hints to User Profile
        this.version(7).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                if (profile.coins === undefined) {
                    profile.coins = 0;
                    profile.hints = 5; // Legacy default before v8
                }
            });
        });

        // Version 8: Raise default hints to 15 for fresh/default profiles
        this.version(8).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                if (profile.hints === undefined) {
                    profile.hints = 15;
                    return;
                }

                // Upgrade untouched legacy defaults without overwriting earned/spent balances.
                if (profile.hints === 5 && (profile.coins ?? 0) === 0) {
                    profile.hints = 15;
                }
            });
        });

        // Version 9: Backfill legacy accounts that had already spent from the old 5-hint default.
        this.version(9).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                if (profile.hints !== undefined && profile.hints <= 5) {
                    profile.hints += 10;
                }
            });
        });

        // Version 10: Unified inventory model for extensible shop items.
        this.version(10).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                const legacyCapsule = typeof profile.hints === 'number' ? profile.hints : 15;
                const existingInventory = (profile.inventory && typeof profile.inventory === 'object')
                    ? profile.inventory
                    : {};

                const capsule = typeof existingInventory.capsule === 'number'
                    ? existingInventory.capsule
                    : legacyCapsule;
                const hintTicket = typeof existingInventory.hint_ticket === 'number'
                    ? existingInventory.hint_ticket
                    : 3;

                profile.inventory = {
                    ...existingInventory,
                    capsule: Math.max(0, capsule),
                    hint_ticket: Math.max(0, hintTicket),
                };
                profile.hints = Math.max(0, capsule); // compatibility mirror
                if (profile.coins === undefined) profile.coins = 0;
            });
        });

        // Version 11: Add vocab ticket inventory for keyword reveal tool.
        this.version(11).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                const legacyCapsule = typeof profile.hints === 'number' ? profile.hints : 15;
                const existingInventory = (profile.inventory && typeof profile.inventory === 'object')
                    ? profile.inventory
                    : {};

                const capsule = typeof existingInventory.capsule === 'number'
                    ? existingInventory.capsule
                    : legacyCapsule;
                const hintTicket = typeof existingInventory.hint_ticket === 'number'
                    ? existingInventory.hint_ticket
                    : 3;
                const vocabTicket = typeof existingInventory.vocab_ticket === 'number'
                    ? existingInventory.vocab_ticket
                    : 2;

                profile.inventory = {
                    ...existingInventory,
                    capsule: Math.max(0, capsule),
                    hint_ticket: Math.max(0, hintTicket),
                    vocab_ticket: Math.max(0, vocabTicket),
                };
                profile.hints = Math.max(0, capsule); // compatibility mirror
                if (profile.coins === undefined) profile.coins = 0;
            });
        });

        // Version 12: Cosmetic themes support
        this.version(12).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                if (!Array.isArray(profile.owned_themes)) {
                    profile.owned_themes = ['morning_coffee']; // Default free theme
                }
                if (!profile.active_theme) {
                    profile.active_theme = 'morning_coffee';
                }
            });
        });

        // Version 14: Unlock the new ultra-premium themes for testing
        this.version(14).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                profile.owned_themes = ['morning_coffee', 'sakura', 'golden_hour', 'obsidian_gold', 'holo_pearl', 'crimson_velvet'];
            });
        });

        // Version 15: Swap out dark themes for high-contrast light themes testing
        this.version(15).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                profile.owned_themes = ['morning_coffee', 'sakura', 'golden_hour', 'holo_pearl', 'cloud_nine', 'lilac_dream'];
            });
        });

        // Version 16: Add audio ticket inventory for translation reference playback.
        this.version(16).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                const existingInventory = (profile.inventory && typeof profile.inventory === 'object')
                    ? profile.inventory
                    : {};

                const audioTicket = typeof existingInventory.audio_ticket === 'number'
                    ? existingInventory.audio_ticket
                    : 2;

                profile.inventory = {
                    ...existingInventory,
                    audio_ticket: Math.max(0, audioTicket),
                };
            });
        });

        // Version 17: Add refresh ticket inventory for rerolling the current drill.
        this.version(17).stores({
            user_profile: '++id'
        }).upgrade(tx => {
            return tx.table('user_profile').toCollection().modify(profile => {
                const existingInventory = (profile.inventory && typeof profile.inventory === 'object')
                    ? profile.inventory
                    : {};

                const refreshTicket = typeof existingInventory.refresh_ticket === 'number'
                    ? existingInventory.refresh_ticket
                    : 2;

                profile.inventory = {
                    ...existingInventory,
                    refresh_ticket: Math.max(0, refreshTicket),
                };
            });
        });

        // Version 18: Add sync metadata and outbox for Supabase persistence.
        this.version(18).stores({
            ai_cache: '++id, &key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            const now = new Date().toISOString();

            await tx.table('vocabulary').toCollection().modify((item: VocabItem) => {
                item.word_key = item.word_key || item.word.trim().toLowerCase();
                item.updated_at = item.updated_at || now;
                item.sync_status = item.sync_status || 'pending';
            });

            await tx.table('writing_history').toCollection().modify((item: WritingEntry) => {
                item.updated_at = item.updated_at || now;
                item.sync_status = item.sync_status || 'pending';
            });

            await tx.table('read_articles').toCollection().modify((item: ReadArticleItem) => {
                item.read_at = item.read_at || item.timestamp;
                item.updated_at = item.updated_at || now;
                item.sync_status = item.sync_status || 'pending';
            });

            await tx.table('elo_history').toCollection().modify((item: EloHistoryItem) => {
                item.updated_at = item.updated_at || now;
                item.sync_status = item.sync_status || 'pending';
                item.source = item.source || 'legacy_local';
            });

            await tx.table('user_profile').toCollection().modify((item: LocalUserProfile) => {
                item.updated_at = item.updated_at || now;
                item.sync_status = item.sync_status || 'pending';
            });
        });

        // Version 19: Add profile identity and learning preference fields.
        this.version(19).stores({
            ai_cache: '++id, &key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            const {
                DEFAULT_AVATAR_PRESET,
                DEFAULT_LEARNING_PREFERENCES,
                DEFAULT_PROFILE_USERNAME,
            } = await import("@/lib/profile-settings");

            await tx.table('user_profile').toCollection().modify((item: LocalUserProfile) => {
                item.username = item.username || DEFAULT_PROFILE_USERNAME;
                item.avatar_preset = item.avatar_preset || DEFAULT_AVATAR_PRESET;
                item.bio = item.bio || '';
                item.learning_preferences = item.learning_preferences || DEFAULT_LEARNING_PREFERENCES;
            });
        });

        // Version 20: allow one cache entry per text+analysis type instead of per text only.
        this.version(20).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        });

        // Version 21: reset Elo/economy defaults and remove legacy premium theme unlocks.
        this.version(21).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            const nowMs = Date.now();
            const nowIso = new Date(nowMs).toISOString();
            const resetInventory = {
                capsule: 10,
                hint_ticket: 10,
                vocab_ticket: 10,
                audio_ticket: 10,
                refresh_ticket: 10,
            };

            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                profile.elo_rating = 400;
                profile.streak_count = 0;
                profile.max_elo = 400;
                profile.listening_elo = 400;
                profile.listening_streak = 0;
                profile.listening_max_elo = 400;
                profile.coins = 500;
                profile.hints = resetInventory.capsule;
                profile.inventory = { ...resetInventory };
                profile.owned_themes = ['morning_coffee'];
                profile.active_theme = 'morning_coffee';
                profile.updated_at = nowIso;
                profile.sync_status = 'pending';
            });

            await tx.table('elo_history').clear();
            await tx.table('sync_outbox').filter((item: SyncOutboxItem) => item.entity === 'profile' || item.entity === 'elo_history').delete();
            await tx.table('sync_meta').put({
                key: 'economy_reset_2026_03_14',
                value: true,
                updated_at: nowMs,
            });
        });

        // Version 22: add per-user DeepSeek API key storage for profile sync.
        this.version(22).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                if (typeof profile.deepseek_api_key !== 'string') {
                    profile.deepseek_api_key = '';
                }
            });
        });
    }
}

export const db = new YasiDB();
