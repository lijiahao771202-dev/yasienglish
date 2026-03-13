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

export interface RemoteProfileRow {
    user_id: string;
    translation_elo: number;
    listening_elo: number;
    streak_count: number;
    listening_streak?: number;
    max_translation_elo: number;
    max_listening_elo: number;
    coins: number;
    inventory: InventoryState;
    owned_themes: string[];
    active_theme: string;
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

const DEFAULT_INVENTORY: Required<InventoryState> = {
    capsule: 15,
    hint_ticket: 3,
    vocab_ticket: 2,
    audio_ticket: 2,
    refresh_ticket: 2,
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
        elo_rating: 600,
        streak_count: 0,
        max_elo: 600,
        last_practice: now,
        listening_elo: 600,
        listening_streak: 0,
        listening_max_elo: 600,
        coins: 0,
        hints: inventory.capsule,
        inventory,
        owned_themes: ["morning_coffee"],
        active_theme: "morning_coffee",
        updated_at: new Date(now).toISOString(),
        sync_status: "pending",
    };
}

export function toLocalProfile(remote: RemoteProfileRow): LocalUserProfile {
    const inventory = normalizeInventory(remote.inventory);

    return {
        user_id: remote.user_id,
        remote_id: remote.user_id,
        elo_rating: remote.translation_elo,
        streak_count: remote.streak_count,
        max_elo: remote.max_translation_elo,
        last_practice: Date.parse(remote.last_practice_at),
        listening_elo: remote.listening_elo,
        listening_streak: remote.listening_streak ?? 0,
        listening_max_elo: remote.max_listening_elo,
        coins: remote.coins,
        hints: inventory.capsule,
        inventory,
        owned_themes: remote.owned_themes,
        active_theme: remote.active_theme,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function buildProfilePatch(patch: Partial<Pick<LocalUserProfile, "coins" | "inventory" | "owned_themes" | "active_theme">>) {
    const nextPatch: Record<string, unknown> = {};

    if (patch.coins !== undefined) nextPatch.coins = patch.coins;
    if (patch.inventory !== undefined) nextPatch.inventory = patch.inventory;
    if (patch.owned_themes !== undefined) nextPatch.owned_themes = patch.owned_themes;
    if (patch.active_theme !== undefined) nextPatch.active_theme = patch.active_theme;

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
        await db.user_profile.update(existing.id, nextProfile);
        return;
    }

    await db.user_profile.add(nextProfile);
}
