import Dexie, { Table } from 'dexie';
import type { LearningPreferences } from "@/lib/profile-settings";
import type { ListeningCabinSession } from "@/lib/listening-cabin";
import type { MeaningGroup } from "@/lib/vocab-meanings";

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
    type: 'grammar' | 'translation' | 'tts' | 'ask_ai' | 'quiz' | 'rebuild_candidate';
    data: any;
    timestamp: number;
}

export interface FeedCacheItem {
    category: string;
    items: any[]; // ArticleItem[]
    timestamp: number;
}

export interface GeneratedRebuildBankItem {
    content_key: string;
    candidate_id: string;
    topic: string;
    scene: string;
    effective_elo: number;
    band_position: string | null;
    reference_english: string;
    chinese: string;
    answer_tokens: string[];
    distractor_tokens: string[];
    source: 'ai';
    review_status: 'draft' | 'curated';
    created_at: number;
    updated_at: number;
}

export interface ReadArticleItem {
    url: string;
    timestamp: number;
    read_at?: number;
    article_key?: string;
    article_title?: string;
    article_payload?: CachedArticle;
    reading_notes_payload?: Array<Omit<ReadingNoteItem, "id">>;
    grammar_payload?: Array<{
        key: string;
        data: unknown;
        timestamp: number;
    }>;
    ask_payload?: Array<{
        key: string;
        data: unknown;
        timestamp: number;
    }>;
    remote_id?: string;
    updated_at?: string;
    sync_status?: SyncStatus;
    user_id?: string;
}

export type VocabSourceKind =
    | 'manual'
    | 'read'
    | 'rebuild'
    | 'translation'
    | 'listening'
    | 'dictation'
    | 'legacy_local';

export interface VocabItem extends SyncTracked {
    word: string;
    word_key?: string;
    definition: string;
    translation: string;
    context: string;
    example: string;
    phonetic?: string;
    meaning_groups?: MeaningGroup[];
    highlighted_meanings?: string[];
    word_breakdown?: string[];
    morphology_notes?: string[];
    source_kind?: VocabSourceKind;
    source_label?: string;
    source_sentence?: string;
    source_note?: string;
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
    difficulty?: 'cet4' | 'cet6' | 'ielts';
    isAIGenerated?: boolean;
    isCatMode?: boolean;
    catSessionId?: string;
    catBand?: number;
    catScoreSnapshot?: number;
    catThetaSnapshot?: number;
    catSeSnapshot?: number;
    catSessionBlueprint?: Record<string, unknown>;
    catQuizBlueprint?: Record<string, unknown>;
    quizCompleted?: boolean;
    quizCorrect?: number;
    quizTotal?: number;
    quizScorePercent?: number;
}

export type ReadingMarkType = 'highlight' | 'underline' | 'note' | 'ask';

export type SmartPlanExamTrack = 'cet4' | 'cet6' | 'ielts';
export type SmartPlanTaskType =
    | 'custom'
    | 'rebuild'
    | 'cat'
    | 'reading_ai'
    | 'listening_cabin'
    | 'dictation'
    | 'vocab'
    | 'writing'
    | 'reading'
    | 'listening';
export type DailyPlanSource = 'system' | 'ai' | 'manual';

export interface DailyPlanItem {
    id: string;
    text: string;
    completed: boolean;
    type?: SmartPlanTaskType;
    exam_track?: SmartPlanExamTrack;
    target?: number;
    current?: number;
    chunk_size?: number; // Size of each micro-step (e.g. 15 for a target of 100)
    source?: DailyPlanSource;
}

const SMART_PLAN_TASK_TYPE_SET = new Set<SmartPlanTaskType>([
    'custom',
    'rebuild',
    'cat',
    'reading_ai',
    'listening_cabin',
    'dictation',
    'vocab',
    'writing',
    'reading',
    'listening',
]);

const SMART_PLAN_EXAM_TRACK_SET = new Set<SmartPlanExamTrack>(['cet4', 'cet6', 'ielts']);

export function normalizeSmartPlanTaskType(type: unknown): SmartPlanTaskType | undefined {
    if (typeof type !== 'string') {
        return undefined;
    }

    if (type === 'reading') {
        return 'reading_ai';
    }

    if (type === 'listening') {
        return 'listening_cabin';
    }

    return SMART_PLAN_TASK_TYPE_SET.has(type as SmartPlanTaskType)
        ? (type as SmartPlanTaskType)
        : undefined;
}

export function normalizeSmartPlanExamTrack(track: unknown): SmartPlanExamTrack | undefined {
    if (typeof track !== 'string') {
        return undefined;
    }

    return SMART_PLAN_EXAM_TRACK_SET.has(track as SmartPlanExamTrack)
        ? (track as SmartPlanExamTrack)
        : undefined;
}

export function inferSmartPlanExamTrack(text: string): SmartPlanExamTrack | undefined {
    const normalized = text.toLowerCase();

    if (normalized.includes('cet-4') || normalized.includes('cet4') || text.includes('四级')) {
        return 'cet4';
    }

    if (normalized.includes('cet-6') || normalized.includes('cet6') || text.includes('六级')) {
        return 'cet6';
    }

    if (normalized.includes('ielts') || text.includes('雅思')) {
        return 'ielts';
    }

    return undefined;
}

export interface DailyPlanRecord {
    date: string; // 'YYYY-MM-DD'
    items: DailyPlanItem[];
    updated_at: number;
}

export interface ReadingNoteItem {
    id?: number;
    article_key: string;
    article_url?: string;
    article_title?: string;
    paragraph_order: number;
    paragraph_block_index: number;
    selected_text: string;
    note_text?: string;
    mark_type: ReadingMarkType;
    mark_color?: string;
    start_offset: number;
    end_offset: number;
    created_at: number;
    updated_at: number;
}

export interface EloHistoryItem {
    id?: number;
    remote_id?: string;
    user_id?: string;
    mode: 'translation' | 'listening' | 'dictation' | 'rebuild';
    elo: number;
    change: number;
    timestamp: number;
    source?: string;
    updated_at?: string;
    sync_status?: SyncStatus;
}

export interface LocalCatSessionRecord {
    id?: string;
    user_id?: string;
    topic?: string;
    difficulty?: 'cet4' | 'cet6' | 'ielts';
    band?: number;
    score_before?: number;
    score_after?: number;
    level_after?: number;
    theta_after?: number;
    se_before?: number;
    se_after?: number;
    stop_reason?: string;
    item_count?: number;
    quality_tier?: string;
    accuracy?: number;
    speed_score?: number;
    stability_score?: number;
    performance?: number;
    delta?: number;
    points_delta?: number;
    next_band?: number;
    quiz_correct?: number;
    quiz_total?: number;
    reading_ms?: number;
    status?: 'started' | 'completed';
    article_title?: string;
    article_url?: string;
    created_at?: string;
    completed_at?: string;
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
    listening_scoring_version?: number;
    listening_elo?: number;
    listening_streak?: number;
    listening_max_elo?: number;
    rebuild_hidden_elo?: number;
    rebuild_elo?: number;
    rebuild_streak?: number;
    rebuild_max_elo?: number;
    dictation_elo?: number;
    dictation_streak?: number;
    dictation_max_elo?: number;
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
    reading_coins?: number;
    reading_streak?: number;
    reading_last_daily_grant_at?: string | null;
    cat_score?: number;
    cat_level?: number;
    cat_theta?: number;
    cat_se?: number;
    cat_points?: number;
    cat_current_band?: number;
    cat_updated_at?: string;
    exam_date?: string;
    exam_type?: 'cet4' | 'cet6' | 'postgrad' | 'ielts';
    exam_goal_score?: number;
    daily_plan_snapshots?: DailyPlanRecord[];
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
    rebuild_bank_generated!: Table<GeneratedRebuildBankItem, string>;
    feeds!: Table<FeedCacheItem>;
    read_articles!: Table<ReadArticleItem>;
    vocabulary!: Table<VocabItem>;
    writing_history!: Table<WritingEntry>;
    articles!: Table<CachedArticle>;
    reading_notes!: Table<ReadingNoteItem, number>;
    elo_history!: Table<EloHistoryItem, number>;
    cat_sessions!: Table<LocalCatSessionRecord, string>;
    user_profile!: Table<LocalUserProfile>;
    sync_outbox!: Table<SyncOutboxItem, number>;
    sync_meta!: Table<SyncMetaItem, string>;
    listening_cabin_sessions!: Table<ListeningCabinSession, string>;
    daily_plans!: Table<DailyPlanRecord, string>;

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

        // Version 23: Add AI-generated article metadata fields.
        this.version(23).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        });

        // Version 24: Add CAT profile fields + reading coin fields + local CAT sessions.
        this.version(24).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            const nowIso = new Date().toISOString();
            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                if (typeof profile.reading_coins !== 'number') profile.reading_coins = 40;
                if (typeof profile.reading_streak !== 'number') profile.reading_streak = 0;
                if (typeof profile.reading_last_daily_grant_at !== 'string') profile.reading_last_daily_grant_at = null;
                if (typeof profile.cat_score !== 'number') profile.cat_score = 1000;
                if (typeof profile.cat_level !== 'number') profile.cat_level = 1;
                if (typeof profile.cat_theta !== 'number') profile.cat_theta = 0;
                if (typeof profile.cat_se !== 'number') profile.cat_se = 1.15;
                if (typeof profile.cat_points !== 'number') profile.cat_points = 0;
                if (typeof profile.cat_current_band !== 'number') profile.cat_current_band = 3;
                if (typeof profile.cat_updated_at !== 'string') profile.cat_updated_at = nowIso;
            });
        });

        // Version 25: CAT precision fields.
        this.version(25).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                if (typeof profile.cat_se !== 'number') profile.cat_se = 1.15;
            });
        });

        // Version 26: add local-only dictation Elo/streak fields.
        this.version(26).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                const listeningElo = profile.listening_elo ?? profile.elo_rating ?? 400;
                const listeningStreak = profile.listening_streak ?? 0;
                const listeningMaxElo = profile.listening_max_elo ?? listeningElo;

                if (typeof profile.dictation_elo !== 'number') profile.dictation_elo = listeningElo;
                if (typeof profile.dictation_streak !== 'number') profile.dictation_streak = listeningStreak;
                if (typeof profile.dictation_max_elo !== 'number') profile.dictation_max_elo = listeningMaxElo;
            });
        });

        // Version 27: reset all battle Elo scores (translation/listening/dictation) to 400.
        this.version(27).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            const nowMs = Date.now();
            const nowIso = new Date(nowMs).toISOString();

            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                profile.elo_rating = 400;
                profile.max_elo = 400;
                profile.listening_elo = 400;
                profile.listening_max_elo = 400;
                profile.dictation_elo = 400;
                profile.dictation_max_elo = 400;
                profile.updated_at = nowIso;
                profile.sync_status = 'pending';
            });

            await tx.table('elo_history').clear();
            await tx.table('sync_outbox').filter((item: SyncOutboxItem) => item.entity === 'profile' || item.entity === 'elo_history').delete();
            await tx.table('sync_meta').put({
                key: 'elo_reset_2026_03_21',
                value: true,
                updated_at: nowMs,
            });
        });

        // Version 28: listening pronunciation scoring season reset.
        this.version(28).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            const nowMs = Date.now();
            const nowIso = new Date(nowMs).toISOString();

            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                profile.listening_scoring_version = 2;
                profile.listening_elo = 400;
                profile.listening_streak = 0;
                profile.listening_max_elo = 400;
                profile.updated_at = nowIso;
                profile.sync_status = 'pending';
            });

            await tx.table('elo_history')
                .filter((item: EloHistoryItem) => item.mode === 'listening')
                .delete();

            await tx.table('sync_meta').put({
                key: 'listening_scoring_version',
                value: 2,
                updated_at: nowMs,
            });
        });

        // Version 29: store AI-generated rebuild drills as a local draft bank.
        this.version(29).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        });

        // Version 30: persist rebuild hidden elo in the profile for cross-device sync.
        this.version(30).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                if (typeof profile.rebuild_hidden_elo !== 'number') {
                    profile.rebuild_hidden_elo = profile.listening_elo ?? profile.elo_rating ?? 400;
                }
            });
        });

        // Version 31: add official rebuild Elo/streak fields alongside hidden practice Elo.
        this.version(31).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
            }).upgrade(async tx => {
            await tx.table('user_profile').toCollection().modify((profile: LocalUserProfile) => {
                const rebuildBase = typeof profile.rebuild_hidden_elo === 'number'
                    ? profile.rebuild_hidden_elo
                    : (profile.listening_elo ?? profile.elo_rating ?? 400);
                if (typeof profile.rebuild_hidden_elo !== 'number') profile.rebuild_hidden_elo = rebuildBase;
                if (typeof profile.rebuild_elo !== 'number') profile.rebuild_elo = rebuildBase;
                if (typeof profile.rebuild_streak !== 'number') profile.rebuild_streak = 0;
                if (typeof profile.rebuild_max_elo !== 'number') profile.rebuild_max_elo = profile.rebuild_elo ?? rebuildBase;
            });
        });

        // Version 32: add vocab source metadata for provenance and editing.
        this.version(32).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            await tx.table('vocabulary').toCollection().modify((item: VocabItem) => {
                item.source_kind = item.source_kind || 'legacy_local';
                item.source_label = item.source_label || '本地旧卡片';
                if ((!item.source_sentence || !item.source_sentence.trim()) && item.context?.trim()) {
                    item.source_sentence = item.context.trim();
                }
                if (typeof item.source_note !== 'string') {
                    item.source_note = '';
                }
            });
        });

        // Version 33: add vocab phonetic and structured meaning metadata.
        this.version(33).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            await tx.table('vocabulary').toCollection().modify((item: VocabItem) => {
                if (typeof item.phonetic !== 'string') {
                    item.phonetic = '';
                }
                if (!Array.isArray(item.meaning_groups)) {
                    item.meaning_groups = [];
                }
                if (!Array.isArray(item.highlighted_meanings)) {
                    item.highlighted_meanings = [];
                }
            });
        });

        // Version 34: add AI-generated word breakdown and morphology notes.
        this.version(34).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        }).upgrade(async tx => {
            await tx.table('vocabulary').toCollection().modify((item: VocabItem) => {
                if (!Array.isArray(item.word_breakdown)) {
                    item.word_breakdown = [];
                }
                if (!Array.isArray(item.morphology_notes)) {
                    item.morphology_notes = [];
                }
            });
        });

        // Version 35: persist reading highlights/underlines/notes per article paragraph.
        this.version(35).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            reading_notes: '++id, article_key, [article_key+paragraph_order], paragraph_order, paragraph_block_index, created_at, updated_at, mark_type',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
        });

        // Version 36: add local listening cabin session history.
        this.version(36).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            reading_notes: '++id, article_key, [article_key+paragraph_order], paragraph_order, paragraph_block_index, created_at, updated_at, mark_type',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
            listening_cabin_sessions: '&id, created_at, updated_at, lastPlayedAt',
        });

        // Version 37: backfill listening cabin v2 fields for old local sessions.
        this.version(37).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            reading_notes: '++id, article_key, [article_key+paragraph_order], paragraph_order, paragraph_block_index, created_at, updated_at, mark_type',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
            listening_cabin_sessions: '&id, created_at, updated_at, lastPlayedAt',
        }).upgrade(async tx => {
            await tx.table('listening_cabin_sessions').toCollection().modify((item: Record<string, unknown>) => {
                const voice = typeof item.voice === 'string' ? item.voice : 'en-US-JennyNeural';

                item.topicMode = typeof item.topicMode === 'string' ? item.topicMode : 'manual';
                item.scriptMode = typeof item.scriptMode === 'string' ? item.scriptMode : 'monologue';
                item.lexicalDensity = typeof item.lexicalDensity === 'string' ? item.lexicalDensity : 'balanced';
                item.sentenceLength = typeof item.sentenceLength === 'string' ? item.sentenceLength : 'medium';
                item.scriptLength = typeof item.scriptLength === 'string' ? item.scriptLength : 'medium';
                item.speakerPlan = item.speakerPlan || {
                    strategy: 'fixed',
                    primaryVoice: voice,
                    assignments: [{ speaker: 'Narrator', voice }],
                };
                item.topicSeed = typeof item.topicSeed === 'string' ? item.topicSeed : null;
                item.sentenceCount = Number.isFinite(item.sentenceCount)
                    ? item.sentenceCount
                    : Array.isArray(item.sentences)
                        ? item.sentences.length
                        : 0;
                item.playbackRate = Number.isFinite(item.playbackRate) ? item.playbackRate : 1;
            });
        });

        // Version 38: backfill listening cabin v2.2 fields (thinking mode + sentence emotion/pace).
        this.version(38).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            reading_notes: '++id, article_key, [article_key+paragraph_order], paragraph_order, paragraph_block_index, created_at, updated_at, mark_type',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
            listening_cabin_sessions: '&id, created_at, updated_at, lastPlayedAt',
        }).upgrade(async tx => {
            await tx.table('listening_cabin_sessions').toCollection().modify((item: Record<string, unknown>) => {
                item.thinkingMode = typeof item.thinkingMode === 'string' ? item.thinkingMode : 'standard';

                if (Array.isArray(item.sentences)) {
                    item.sentences = item.sentences.map((sentence) => {
                        if (!sentence || typeof sentence !== 'object') {
                            return sentence;
                        }

                        const record = sentence as Record<string, unknown>;
                        return {
                            ...record,
                            emotion: typeof record.emotion === 'string' ? record.emotion : 'neutral',
                            pace: typeof record.pace === 'string' ? record.pace : 'normal',
                        };
                    });
                }
            });
        });

        // Version 39: Add daily plans table
        this.version(39).stores({
            ai_cache: '++id, &[key+type], key, type, timestamp',
            rebuild_bank_generated: '&content_key, candidate_id, topic, effective_elo, created_at, updated_at, review_status',
            feeds: '&category, timestamp',
            read_articles: '&url, timestamp, user_id, updated_at, sync_status',
            vocabulary: '&word, word_key, timestamp, due, state, updated_at, sync_status',
            writing_history: '++id, articleTitle, timestamp, remote_id, updated_at, sync_status',
            articles: '&url, title, timestamp, isAIGenerated',
            reading_notes: '++id, article_key, [article_key+paragraph_order], paragraph_order, paragraph_block_index, created_at, updated_at, mark_type',
            elo_history: '++id, remote_id, mode, timestamp, sync_status',
            cat_sessions: '&id, user_id, created_at, status',
            user_profile: '++id, user_id, updated_at, sync_status',
            sync_outbox: '++id, entity, operation, record_key, [entity+record_key], created_at, sync_status',
            sync_meta: '&key, updated_at',
            listening_cabin_sessions: '&id, created_at, updated_at, lastPlayedAt',
            daily_plans: '&date, updated_at',
        });
    }
}

export const db = new YasiDB();
