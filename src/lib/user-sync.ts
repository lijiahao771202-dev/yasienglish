import {
    db,
    type EloHistoryItem,
    type InventoryState,
    type LocalUserProfile,
    type ReadArticleItem,
    type SyncStatus,
    type VocabItem,
    type WritingEntry,
} from "./db";
import {
    DEFAULT_AVATAR_PRESET,
    DEFAULT_LEARNING_PREFERENCES,
    DEFAULT_PROFILE_USERNAME,
    type LearningPreferences,
    normalizeAvatarPreset,
    normalizeProfileDeepSeekApiKey,
    normalizeLearningPreferences,
    normalizeProfileBio,
    normalizeProfileUsername,
} from "./profile-settings";

export {
    DEFAULT_AVATAR_PRESET,
    DEFAULT_LEARNING_PREFERENCES,
    DEFAULT_PROFILE_USERNAME,
    normalizeAvatarPreset,
    normalizeProfileDeepSeekApiKey,
    normalizeLearningPreferences,
    normalizeProfileBio,
    normalizeProfileUsername,
} from "./profile-settings";

export interface RemoteProfileRow {
    user_id: string;
    translation_elo: number;
    listening_elo: number;
    rebuild_hidden_elo?: number;
    dictation_elo?: number;
    streak_count: number;
    listening_streak?: number;
    dictation_streak?: number;
    max_translation_elo: number;
    max_listening_elo: number;
    dictation_max_elo?: number;
    coins: number;
    inventory: InventoryState;
    owned_themes: string[];
    active_theme: string;
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
    cat_updated_at?: string | null;
    updated_at: string;
    last_practice_at: string;
}

export interface RemoteVocabularyRow {
    id?: string;
    user_id: string;
    word: string;
    word_key: string;
    definition: string;
    translation: string;
    context: string;
    example: string;
    timestamp_ms: number;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    state: number;
    last_review_ms: number;
    due_ms: number;
    created_at?: string;
    updated_at: string;
}

export interface RemoteWritingHistoryRow {
    id: string;
    user_id: string;
    article_title: string;
    content: string;
    score: number;
    timestamp_ms: number;
    created_at?: string;
    updated_at: string;
}

export interface RemoteReadArticleRow {
    id: string;
    user_id: string;
    url: string;
    read_at: string;
    timestamp_ms: number;
    updated_at: string;
}

export interface RemoteEloHistoryRow {
    id: string;
    user_id: string;
    mode: "translation" | "listening";
    elo: number;
    change: number;
    timestamp_ms: number;
    source: string;
    created_at?: string;
    updated_at: string;
}

export const DEFAULT_BASE_ELO = 400;
export const DEFAULT_STARTING_COINS = 500;
export const DEFAULT_FREE_THEME = "morning_coffee";
export const DEFAULT_READING_COINS = 40;
export const DEFAULT_CAT_SCORE = 1000;
export const DEFAULT_CAT_LEVEL = 1;
export const DEFAULT_CAT_THETA = 0;
export const DEFAULT_CAT_SE = 1.15;
export const DEFAULT_CAT_POINTS = 0;
export const DEFAULT_CAT_BAND = 3;
export const DEFAULT_INVENTORY: Required<InventoryState> = {
    capsule: 10,
    hint_ticket: 10,
    vocab_ticket: 10,
    audio_ticket: 10,
    refresh_ticket: 10,
};

export function normalizeWordKey(word: string) {
    return word.trim().toLowerCase();
}

export function normalizeInventory(inventory?: InventoryState, legacyCapsule?: number) {
    return {
        capsule: typeof inventory?.capsule === "number" ? inventory.capsule : (legacyCapsule ?? DEFAULT_INVENTORY.capsule),
        hint_ticket: typeof inventory?.hint_ticket === "number" ? inventory.hint_ticket : DEFAULT_INVENTORY.hint_ticket,
        vocab_ticket: typeof inventory?.vocab_ticket === "number" ? inventory.vocab_ticket : DEFAULT_INVENTORY.vocab_ticket,
        audio_ticket: typeof inventory?.audio_ticket === "number" ? inventory.audio_ticket : DEFAULT_INVENTORY.audio_ticket,
        refresh_ticket: typeof inventory?.refresh_ticket === "number" ? inventory.refresh_ticket : DEFAULT_INVENTORY.refresh_ticket,
    };
}

export function createDefaultLocalProfile(userId: string): LocalUserProfile {
    const inventory = normalizeInventory();
    const now = Date.now();

    return {
        user_id: userId,
        elo_rating: DEFAULT_BASE_ELO,
        streak_count: 0,
        max_elo: DEFAULT_BASE_ELO,
        last_practice: now,
        listening_scoring_version: 2,
        listening_elo: DEFAULT_BASE_ELO,
        rebuild_hidden_elo: DEFAULT_BASE_ELO,
        listening_streak: 0,
        listening_max_elo: DEFAULT_BASE_ELO,
        dictation_elo: DEFAULT_BASE_ELO,
        dictation_streak: 0,
        dictation_max_elo: DEFAULT_BASE_ELO,
        coins: DEFAULT_STARTING_COINS,
        hints: inventory.capsule,
        inventory,
        owned_themes: [DEFAULT_FREE_THEME],
        active_theme: DEFAULT_FREE_THEME,
        username: DEFAULT_PROFILE_USERNAME,
        avatar_preset: DEFAULT_AVATAR_PRESET,
        bio: "",
        deepseek_api_key: "",
        learning_preferences: DEFAULT_LEARNING_PREFERENCES,
        reading_coins: DEFAULT_READING_COINS,
        reading_streak: 0,
        reading_last_daily_grant_at: null,
        cat_score: DEFAULT_CAT_SCORE,
        cat_level: DEFAULT_CAT_LEVEL,
        cat_theta: DEFAULT_CAT_THETA,
        cat_se: DEFAULT_CAT_SE,
        cat_points: DEFAULT_CAT_POINTS,
        cat_current_band: DEFAULT_CAT_BAND,
        cat_updated_at: new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(),
        sync_status: "pending",
    };
}

export function toLocalProfile(remote: RemoteProfileRow): LocalUserProfile {
    const inventory = normalizeInventory(remote.inventory);
    const dictationElo = typeof remote.dictation_elo === "number" ? remote.dictation_elo : remote.listening_elo;
    const dictationStreak = typeof remote.dictation_streak === "number" ? remote.dictation_streak : remote.listening_streak ?? 0;
    const dictationMaxElo = typeof remote.dictation_max_elo === "number" ? remote.dictation_max_elo : remote.max_listening_elo;

    return {
        user_id: remote.user_id,
        remote_id: remote.user_id,
        elo_rating: remote.translation_elo,
        streak_count: remote.streak_count,
        max_elo: remote.max_translation_elo,
        last_practice: Date.parse(remote.last_practice_at),
        listening_scoring_version: 0,
        listening_elo: remote.listening_elo,
        rebuild_hidden_elo: typeof remote.rebuild_hidden_elo === "number" ? remote.rebuild_hidden_elo : remote.listening_elo,
        listening_streak: remote.listening_streak ?? 0,
        listening_max_elo: remote.max_listening_elo,
        dictation_elo: dictationElo,
        dictation_streak: dictationStreak,
        dictation_max_elo: dictationMaxElo,
        coins: remote.coins,
        hints: inventory.capsule,
        inventory,
        owned_themes: remote.owned_themes,
        active_theme: remote.active_theme,
        username: normalizeProfileUsername(remote.username),
        avatar_preset: normalizeAvatarPreset(remote.avatar_preset),
        bio: normalizeProfileBio(remote.bio),
        deepseek_api_key: normalizeProfileDeepSeekApiKey(remote.deepseek_api_key),
        learning_preferences: normalizeLearningPreferences(remote.learning_preferences),
        reading_coins: typeof remote.reading_coins === "number" ? remote.reading_coins : DEFAULT_READING_COINS,
        reading_streak: typeof remote.reading_streak === "number" ? remote.reading_streak : 0,
        reading_last_daily_grant_at: remote.reading_last_daily_grant_at || null,
        cat_score: typeof remote.cat_score === "number" ? remote.cat_score : DEFAULT_CAT_SCORE,
        cat_level: typeof remote.cat_level === "number" ? remote.cat_level : DEFAULT_CAT_LEVEL,
        cat_theta: typeof remote.cat_theta === "number" ? remote.cat_theta : DEFAULT_CAT_THETA,
        cat_se: typeof remote.cat_se === "number" ? remote.cat_se : DEFAULT_CAT_SE,
        cat_points: typeof remote.cat_points === "number" ? remote.cat_points : DEFAULT_CAT_POINTS,
        cat_current_band: typeof remote.cat_current_band === "number" ? remote.cat_current_band : DEFAULT_CAT_BAND,
        cat_updated_at: remote.cat_updated_at || remote.updated_at,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function buildProfilePatch(
    patch: Partial<
        Pick<
            LocalUserProfile,
            "coins" | "inventory" | "owned_themes" | "active_theme" | "username" | "avatar_preset" | "bio" | "learning_preferences"
            | "deepseek_api_key" | "reading_coins" | "reading_streak" | "reading_last_daily_grant_at"
            | "cat_score" | "cat_level" | "cat_theta" | "cat_points" | "cat_current_band" | "cat_updated_at"
            | "cat_se" | "dictation_elo" | "dictation_streak" | "dictation_max_elo"
            | "rebuild_hidden_elo"
        >
    > & {
        last_practice_at?: string | number | null;
    },
) {
    const nextPatch: Record<string, unknown> = {};

    if (patch.coins !== undefined) nextPatch.coins = patch.coins;
    if (patch.inventory !== undefined) nextPatch.inventory = patch.inventory;
    if (patch.owned_themes !== undefined) nextPatch.owned_themes = patch.owned_themes;
    if (patch.active_theme !== undefined) nextPatch.active_theme = patch.active_theme;
    if (patch.username !== undefined) nextPatch.username = normalizeProfileUsername(patch.username);
    if (patch.avatar_preset !== undefined) nextPatch.avatar_preset = normalizeAvatarPreset(patch.avatar_preset);
    if (patch.bio !== undefined) nextPatch.bio = normalizeProfileBio(patch.bio);
    if (patch.deepseek_api_key !== undefined) nextPatch.deepseek_api_key = normalizeProfileDeepSeekApiKey(patch.deepseek_api_key);
    if (patch.learning_preferences !== undefined) {
        nextPatch.learning_preferences = normalizeLearningPreferences(patch.learning_preferences);
    }
    if (patch.reading_coins !== undefined) nextPatch.reading_coins = patch.reading_coins;
    if (patch.reading_streak !== undefined) nextPatch.reading_streak = patch.reading_streak;
    if (patch.reading_last_daily_grant_at !== undefined) {
        nextPatch.reading_last_daily_grant_at = patch.reading_last_daily_grant_at || null;
    }
    if (patch.cat_score !== undefined) nextPatch.cat_score = patch.cat_score;
    if (patch.cat_level !== undefined) nextPatch.cat_level = patch.cat_level;
    if (patch.cat_theta !== undefined) nextPatch.cat_theta = patch.cat_theta;
    if (patch.cat_se !== undefined) nextPatch.cat_se = patch.cat_se;
    if (patch.cat_points !== undefined) nextPatch.cat_points = patch.cat_points;
    if (patch.cat_current_band !== undefined) nextPatch.cat_current_band = patch.cat_current_band;
    if (patch.cat_updated_at !== undefined) {
        nextPatch.cat_updated_at = patch.cat_updated_at ? new Date(patch.cat_updated_at).toISOString() : null;
    }
    if (patch.dictation_elo !== undefined) nextPatch.dictation_elo = patch.dictation_elo;
    if (patch.dictation_streak !== undefined) nextPatch.dictation_streak = patch.dictation_streak;
    if (patch.dictation_max_elo !== undefined) nextPatch.dictation_max_elo = patch.dictation_max_elo;
    if (patch.rebuild_hidden_elo !== undefined) nextPatch.rebuild_hidden_elo = patch.rebuild_hidden_elo;
    if (patch.last_practice_at !== undefined && patch.last_practice_at !== null) {
        nextPatch.last_practice_at = new Date(patch.last_practice_at).toISOString();
    }

    return nextPatch;
}

export function createLocalVocabularyItem(userId: string, item: VocabItem): VocabItem {
    return {
        ...item,
        user_id: userId,
        word_key: normalizeWordKey(item.word),
        updated_at: new Date().toISOString(),
        sync_status: "pending",
    };
}

export function toRemoteVocabularyRow(userId: string, item: VocabItem): RemoteVocabularyRow {
    return {
        id: item.remote_id,
        user_id: userId,
        word: item.word,
        word_key: item.word_key || normalizeWordKey(item.word),
        definition: item.definition,
        translation: item.translation,
        context: item.context,
        example: item.example,
        timestamp_ms: item.timestamp,
        stability: item.stability,
        difficulty: item.difficulty,
        elapsed_days: item.elapsed_days,
        scheduled_days: item.scheduled_days,
        reps: item.reps,
        state: item.state,
        last_review_ms: item.last_review,
        due_ms: item.due,
        updated_at: item.updated_at || new Date().toISOString(),
    };
}

export function toLocalVocabularyItem(remote: RemoteVocabularyRow): VocabItem {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        word: remote.word,
        word_key: remote.word_key,
        definition: remote.definition,
        translation: remote.translation,
        context: remote.context,
        example: remote.example,
        timestamp: remote.timestamp_ms,
        stability: remote.stability,
        difficulty: remote.difficulty,
        elapsed_days: remote.elapsed_days,
        scheduled_days: remote.scheduled_days,
        reps: remote.reps,
        state: remote.state,
        last_review: remote.last_review_ms,
        due: remote.due_ms,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function toRemoteWritingEntry(userId: string, entry: WritingEntry): RemoteWritingHistoryRow {
    return {
        id: entry.remote_id || crypto.randomUUID(),
        user_id: userId,
        article_title: entry.articleTitle,
        content: entry.content,
        score: entry.score,
        timestamp_ms: entry.timestamp,
        updated_at: entry.updated_at || new Date().toISOString(),
    };
}

export function toLocalWritingEntry(remote: RemoteWritingHistoryRow): WritingEntry {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        articleTitle: remote.article_title,
        content: remote.content,
        score: remote.score,
        timestamp: remote.timestamp_ms,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function toRemoteReadArticle(userId: string, item: ReadArticleItem): RemoteReadArticleRow {
    return {
        id: item.remote_id || crypto.randomUUID(),
        user_id: userId,
        url: item.url,
        read_at: new Date(item.read_at || item.timestamp).toISOString(),
        timestamp_ms: item.timestamp,
        updated_at: item.updated_at || new Date().toISOString(),
    };
}

export function toLocalReadArticle(remote: RemoteReadArticleRow): ReadArticleItem {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        url: remote.url,
        timestamp: remote.timestamp_ms,
        read_at: Date.parse(remote.read_at),
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function toRemoteEloHistoryRow(userId: string, item: EloHistoryItem): RemoteEloHistoryRow {
    if (item.mode === "dictation") {
        throw new Error("Dictation Elo history is local-only and should not be synced.");
    }

    return {
        id: item.remote_id || crypto.randomUUID(),
        user_id: userId,
        mode: item.mode,
        elo: item.elo,
        change: item.change,
        timestamp_ms: item.timestamp,
        source: item.source || "battle",
        updated_at: item.updated_at || new Date().toISOString(),
    };
}

export function toLocalEloHistoryItem(remote: RemoteEloHistoryRow): EloHistoryItem {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        mode: remote.mode,
        elo: remote.elo,
        change: remote.change,
        timestamp: remote.timestamp_ms,
        source: remote.source,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export async function replaceLocalCoreData({
    profile,
    vocabulary,
}: {
    profile: LocalUserProfile;
    vocabulary: VocabItem[];
}) {
    await db.transaction("rw", db.user_profile, db.vocabulary, async () => {
        await db.user_profile.clear();
        await db.vocabulary.clear();
        await db.user_profile.add(profile);
        if (vocabulary.length > 0) {
            await db.vocabulary.bulkPut(vocabulary);
        }
    });
}

export async function upsertLocalProfile(
    profile: LocalUserProfile,
    syncStatus: SyncStatus = "pending",
) {
    const existing = await db.user_profile.orderBy("id").first();
    const nextProfile = {
        ...existing,
        ...profile,
        updated_at: profile.updated_at || new Date().toISOString(),
        sync_status: syncStatus,
    };

    if (existing?.id) {
        await db.user_profile.put({
            ...nextProfile,
            id: existing.id,
        });
        return;
    }

    await db.user_profile.add(nextProfile);
}
