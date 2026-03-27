"use client";

import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { useSyncStatusStore } from "@/lib/sync-status";
import {
    db,
    type EloHistoryItem,
    type LocalUserProfile,
    type ReadArticleItem,
    type SyncOutboxItem,
    type VocabItem,
    type WritingEntry,
} from "@/lib/db";
import {
    buildProfilePatch,
    createDefaultLocalProfile,
    createLocalVocabularyItem,
    DEFAULT_AVATAR_PRESET,
    DEFAULT_BASE_ELO,
    DEFAULT_CAT_BAND,
    DEFAULT_CAT_LEVEL,
    DEFAULT_CAT_POINTS,
    DEFAULT_CAT_SCORE,
    DEFAULT_CAT_SE,
    DEFAULT_CAT_THETA,
    DEFAULT_FREE_THEME,
    DEFAULT_INVENTORY,
    DEFAULT_LEARNING_PREFERENCES,
    DEFAULT_PROFILE_USERNAME,
    DEFAULT_READING_COINS,
    DEFAULT_STARTING_COINS,
    normalizeInventory,
    normalizeWordKey,
    type RemoteProfileRow,
    toLocalEloHistoryItem,
    toLocalProfile,
    toLocalReadArticle,
    toLocalVocabularyItem,
    toLocalWritingEntry,
    toRemoteEloHistoryRow,
    toRemoteReadArticle,
    toRemoteVocabularyRow,
    toRemoteWritingEntry,
    upsertLocalProfile,
    normalizeAvatarPreset,
    normalizeLearningPreferences,
    normalizeProfileBio,
    normalizeProfileUsername,
    type RemoteEloHistoryRow,
    type RemoteReadArticleRow,
    type RemoteVocabularyRow,
    type RemoteWritingHistoryRow,
} from "@/lib/user-sync";

type SyncEntity = "profile" | "vocabulary" | "writing_history" | "read_articles" | "elo_history";

interface OutboxPayload {
    entity: SyncEntity;
    operation: "upsert" | "delete";
    recordKey: string;
    payload: unknown;
}

interface SupabaseMutationResult {
    error?: {
        message?: string;
    } | null;
}

interface RemoteSyncOptions {
    pullSnapshot?: boolean;
    forcePull?: boolean;
    throwOnError?: boolean;
}

interface BootstrapResult {
    usedLocalCache: boolean;
}

const REMOTE_PULL_INTERVAL_MS = 5 * 60 * 1000;
const LISTENING_SCORING_VERSION = 2;

let backgroundSyncPromise: Promise<void> | null = null;
let pendingBackgroundPull = false;
let pendingForcedPull = false;

function nowIso() {
    return new Date().toISOString();
}

export function getUserFacingSyncError(error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to sync your cloud backup.";
    const normalized = message.toLowerCase();

    if (
        normalized.includes("network connection required")
        || normalized.includes("failed to fetch")
        || normalized.includes("networkerror")
        || normalized.includes("load failed")
    ) {
        return "当前网络连接失败，云端备份暂时不可用。请检查网络后再试。";
    }

    if (
        normalized.includes("session expired")
        || normalized.includes("jwt")
        || normalized.includes("refresh token")
        || normalized.includes("invalid claim")
        || normalized.includes("401")
        || normalized.includes("403")
    ) {
        return "当前登录状态已失效，请重新登录后再同步。";
    }

    return message;
}

export function assertSupabaseMutationSucceeded(result: SupabaseMutationResult, context: string) {
    if (!result.error) return;
    throw new Error(`${context}: ${result.error.message || "Unknown Supabase error"}`);
}

function requireOnline() {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Network connection required to use Yasi.");
    }
}

async function getActiveUserId() {
    const activeUser = await db.sync_meta.get("active_user_id");
    return typeof activeUser?.value === "string" ? activeUser.value : null;
}

async function getAuthenticatedUserId() {
    const supabase = createBrowserClientSingleton();
    const {
        data: { session },
        error,
    } = await supabase.auth.getSession();

    if (error) {
        throw error;
    }

    const sessionUserId = session?.user?.id;
    if (!sessionUserId) {
        throw new Error("Your login session expired. Please sign in again.");
    }

    const activeUserId = await getActiveUserId();
    if (activeUserId !== sessionUserId) {
        await setActiveUserId(sessionUserId);
    }

    return sessionUserId;
}

async function setActiveUserId(userId: string) {
    await db.sync_meta.put({
        key: "active_user_id",
        value: userId,
        updated_at: Date.now(),
    });
}

async function clearCoreTables() {
    await db.transaction(
        "rw",
        [db.user_profile, db.vocabulary, db.writing_history, db.read_articles, db.elo_history, db.sync_outbox],
        async () => {
            await db.user_profile.clear();
            await db.vocabulary.clear();
            await db.writing_history.clear();
            await db.read_articles.clear();
            await db.elo_history.clear();
            await db.sync_outbox.clear();
        },
    );
}

async function hasLegacyLocalData() {
    const [profile, vocabCount, historyCount, readCount, eloCount] = await Promise.all([
        db.user_profile.orderBy("id").first(),
        db.vocabulary.count(),
        db.writing_history.count(),
        db.read_articles.count(),
        db.elo_history.count(),
    ]);

    return Boolean(profile || vocabCount || historyCount || readCount || eloCount);
}

export async function hasUsableLocalCache(userId: string) {
    const activeUserId = await getActiveUserId();
    if (activeUserId && activeUserId !== userId) {
        return false;
    }

    return hasLegacyLocalData();
}

async function getRemoteLatestUpdatedAt(userId: string) {
    const supabase = createBrowserClientSingleton();
    const responses = await Promise.all([
        supabase.from("profiles").select("updated_at").eq("user_id", userId).single(),
        supabase.from("vocabulary").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("writing_history").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("read_articles").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("elo_history").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const timestamps = responses.flatMap((response) => {
        if (response.error || !response.data) {
            return [];
        }

        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        const updatedAt = typeof row?.updated_at === "string" ? Date.parse(row.updated_at) : Number.NaN;
        return Number.isFinite(updatedAt) ? [updatedAt] : [];
    });

    return timestamps.length ? Math.max(...timestamps) : null;
}

async function shouldPullRemoteSnapshot(userId: string, forcePull = false) {
    if (forcePull) return true;

    const remoteLatestAt = await getRemoteLatestUpdatedAt(userId);
    await db.sync_meta.put({
        key: "last_remote_seen_at",
        value: remoteLatestAt,
        updated_at: Date.now(),
    });

    if (!remoteLatestAt) {
        return false;
    }

    const lastPullMeta = await db.sync_meta.get("last_remote_pull_at");
    const lastPullAt = typeof lastPullMeta?.value === "number" ? lastPullMeta.value : null;

    if (!lastPullAt) return true;
    if (remoteLatestAt > lastPullAt) return true;
    return Date.now() - lastPullAt >= REMOTE_PULL_INTERVAL_MS;
}

async function markLocalOutboxItemSynced(item: Pick<SyncOutboxItem, "entity" | "operation" | "record_key">) {
    const syncedPatch = {
        sync_status: "synced" as const,
        updated_at: nowIso(),
    };

    if (item.entity === "profile") {
        const profile = await db.user_profile.orderBy("id").first();
        if (profile?.id) {
            await db.user_profile.update(profile.id, syncedPatch);
        }
        return;
    }

    if (item.entity === "vocabulary" && item.operation !== "delete") {
        const vocab = await db.vocabulary.where("word_key").equals(item.record_key).first();
        if (vocab) {
            await db.vocabulary.update(vocab.word, syncedPatch);
        }
        return;
    }

    if (item.entity === "writing_history") {
        const entry = await db.writing_history.where("remote_id").equals(item.record_key).first();
        if (entry?.id) {
            await db.writing_history.update(entry.id, syncedPatch);
        }
        return;
    }

    if (item.entity === "read_articles") {
        await db.read_articles.update(item.record_key, syncedPatch);
        return;
    }

    if (item.entity === "elo_history") {
        const history = await db.elo_history.where("remote_id").equals(item.record_key).first();
        if (history?.id) {
            await db.elo_history.update(history.id, syncedPatch);
        }
    }
}

async function ensureRemoteProfile(userId: string) {
    const supabase = createBrowserClientSingleton();
    const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

    if (data) {
        return data as RemoteProfileRow;
    }

    const localProfile = await db.user_profile.orderBy("id").first();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    const metadata = user?.user_metadata ?? {};
    const nextProfile = localProfile
        ? {
            user_id: userId,
            translation_elo: localProfile.elo_rating,
            listening_elo: localProfile.listening_elo ?? DEFAULT_BASE_ELO,
            rebuild_hidden_elo: localProfile.rebuild_hidden_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
            rebuild_elo: localProfile.rebuild_elo ?? localProfile.rebuild_hidden_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
            dictation_elo: localProfile.dictation_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
            streak_count: localProfile.streak_count,
            listening_streak: localProfile.listening_streak ?? 0,
            rebuild_streak: localProfile.rebuild_streak ?? 0,
            dictation_streak: localProfile.dictation_streak ?? localProfile.listening_streak ?? 0,
            max_translation_elo: localProfile.max_elo,
            max_listening_elo: localProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
            rebuild_max_elo: localProfile.rebuild_max_elo ?? localProfile.rebuild_elo ?? localProfile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO,
            dictation_max_elo: localProfile.dictation_max_elo ?? localProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
            coins: localProfile.coins ?? DEFAULT_STARTING_COINS,
            inventory: normalizeInventory(localProfile.inventory, localProfile.hints),
            owned_themes: localProfile.owned_themes ?? [DEFAULT_FREE_THEME],
            active_theme: localProfile.active_theme ?? DEFAULT_FREE_THEME,
            username: normalizeProfileUsername(localProfile.username ?? (typeof metadata.username === "string" ? metadata.username : DEFAULT_PROFILE_USERNAME)),
            avatar_preset: normalizeAvatarPreset(localProfile.avatar_preset ?? (typeof metadata.avatar_preset === "string" ? metadata.avatar_preset : DEFAULT_AVATAR_PRESET)),
            bio: normalizeProfileBio(localProfile.bio),
            deepseek_api_key: localProfile.deepseek_api_key ?? "",
            learning_preferences: normalizeLearningPreferences(localProfile.learning_preferences ?? DEFAULT_LEARNING_PREFERENCES),
            reading_coins: localProfile.reading_coins ?? DEFAULT_READING_COINS,
            reading_streak: localProfile.reading_streak ?? 0,
            reading_last_daily_grant_at: localProfile.reading_last_daily_grant_at ?? null,
            cat_score: localProfile.cat_score ?? DEFAULT_CAT_SCORE,
            cat_level: localProfile.cat_level ?? DEFAULT_CAT_LEVEL,
            cat_theta: localProfile.cat_theta ?? DEFAULT_CAT_THETA,
            cat_se: localProfile.cat_se ?? DEFAULT_CAT_SE,
            cat_points: localProfile.cat_points ?? DEFAULT_CAT_POINTS,
            cat_current_band: localProfile.cat_current_band ?? DEFAULT_CAT_BAND,
            cat_updated_at: localProfile.cat_updated_at ?? nowIso(),
            last_practice_at: new Date(localProfile.last_practice).toISOString(),
            updated_at: localProfile.updated_at || nowIso(),
        }
        : {
            user_id: userId,
            translation_elo: DEFAULT_BASE_ELO,
            listening_elo: DEFAULT_BASE_ELO,
            rebuild_hidden_elo: DEFAULT_BASE_ELO,
            rebuild_elo: DEFAULT_BASE_ELO,
            dictation_elo: DEFAULT_BASE_ELO,
            streak_count: 0,
            listening_streak: 0,
            rebuild_streak: 0,
            dictation_streak: 0,
            max_translation_elo: DEFAULT_BASE_ELO,
            max_listening_elo: DEFAULT_BASE_ELO,
            rebuild_max_elo: DEFAULT_BASE_ELO,
            dictation_max_elo: DEFAULT_BASE_ELO,
            coins: DEFAULT_STARTING_COINS,
            inventory: { ...DEFAULT_INVENTORY },
            owned_themes: [DEFAULT_FREE_THEME],
            active_theme: DEFAULT_FREE_THEME,
            username: normalizeProfileUsername(typeof metadata.username === "string" ? metadata.username : DEFAULT_PROFILE_USERNAME),
            avatar_preset: normalizeAvatarPreset(typeof metadata.avatar_preset === "string" ? metadata.avatar_preset : DEFAULT_AVATAR_PRESET),
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
            cat_updated_at: nowIso(),
            last_practice_at: nowIso(),
            updated_at: nowIso(),
        };

    const { data: inserted, error } = await supabase
        .from("profiles")
        .upsert(nextProfile, { onConflict: "user_id" })
        .select()
        .single();

    if (error) throw error;

    return inserted as RemoteProfileRow;
}

async function queueOutboxItem({ entity, operation, recordKey, payload }: OutboxPayload) {
    const existing = await db.sync_outbox
        .where("[entity+record_key]")
        .equals([entity, recordKey] as [string, string])
        .first()
        .catch(() => undefined);

    const nextPayload = existing?.payload && entity === "profile" && operation !== "delete"
        ? {
            ...(typeof existing.payload === "object" && existing.payload !== null ? existing.payload as Record<string, unknown> : {}),
            ...(typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {}),
        }
        : payload;

    const next = {
        entity,
        operation,
        payload: nextPayload,
        record_key: recordKey,
        created_at: existing?.created_at ?? Date.now(),
        updated_at: Date.now(),
        attempts: existing?.attempts ?? 0,
        last_error: undefined,
        sync_status: "pending" as const,
    };

    if (existing?.id) {
        await db.sync_outbox.update(existing.id, next);
        return;
    }

    await db.sync_outbox.add(next);
}

async function pullRemoteSnapshot(userId: string) {
    const supabase = createBrowserClientSingleton();
    const [existingLocalProfile, existingDictationHistory] = await Promise.all([
        db.user_profile.orderBy("id").first(),
        db.elo_history.where("mode").equals("dictation").toArray(),
    ]);

    const [
        profileRes,
        vocabRes,
        writingRes,
        readRes,
        eloRes,
    ] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("vocabulary").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        supabase.from("writing_history").select("*").eq("user_id", userId).order("timestamp_ms", { ascending: false }),
        supabase.from("read_articles").select("*").eq("user_id", userId).order("timestamp_ms", { ascending: false }),
        supabase.from("elo_history").select("*").eq("user_id", userId).order("timestamp_ms", { ascending: true }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (vocabRes.error) throw vocabRes.error;
    if (writingRes.error) throw writingRes.error;
    if (readRes.error) throw readRes.error;
    if (eloRes.error) throw eloRes.error;

    const remoteProfileRow = profileRes.data as RemoteProfileRow & Record<string, unknown>;
    const remoteLocalProfile = toLocalProfile(profileRes.data as RemoteProfileRow);
    const localProfile: LocalUserProfile = {
        ...remoteLocalProfile,
        dictation_elo: typeof remoteProfileRow.dictation_elo === "number"
            ? remoteProfileRow.dictation_elo
            : (existingLocalProfile?.dictation_elo ?? remoteLocalProfile.dictation_elo ?? remoteLocalProfile.listening_elo ?? DEFAULT_BASE_ELO),
        rebuild_hidden_elo: typeof remoteProfileRow.rebuild_hidden_elo === "number"
            ? remoteProfileRow.rebuild_hidden_elo
            : (existingLocalProfile?.rebuild_hidden_elo ?? remoteLocalProfile.rebuild_hidden_elo ?? remoteLocalProfile.listening_elo ?? DEFAULT_BASE_ELO),
        rebuild_elo: typeof remoteProfileRow.rebuild_elo === "number"
            ? remoteProfileRow.rebuild_elo
            : (existingLocalProfile?.rebuild_elo ?? remoteLocalProfile.rebuild_elo ?? remoteLocalProfile.rebuild_hidden_elo ?? remoteLocalProfile.listening_elo ?? DEFAULT_BASE_ELO),
        rebuild_streak: typeof remoteProfileRow.rebuild_streak === "number"
            ? remoteProfileRow.rebuild_streak
            : (existingLocalProfile?.rebuild_streak ?? remoteLocalProfile.rebuild_streak ?? 0),
        rebuild_max_elo: typeof remoteProfileRow.rebuild_max_elo === "number"
            ? remoteProfileRow.rebuild_max_elo
            : (existingLocalProfile?.rebuild_max_elo ?? remoteLocalProfile.rebuild_max_elo ?? remoteLocalProfile.rebuild_elo ?? remoteLocalProfile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO),
        dictation_streak: typeof remoteProfileRow.dictation_streak === "number"
            ? remoteProfileRow.dictation_streak
            : (existingLocalProfile?.dictation_streak ?? remoteLocalProfile.dictation_streak ?? remoteLocalProfile.listening_streak ?? 0),
        dictation_max_elo: typeof remoteProfileRow.dictation_max_elo === "number"
            ? remoteProfileRow.dictation_max_elo
            : (existingLocalProfile?.dictation_max_elo ?? remoteLocalProfile.dictation_max_elo ?? remoteLocalProfile.listening_max_elo ?? DEFAULT_BASE_ELO),
    };
    const localVocabulary = (vocabRes.data as RemoteVocabularyRow[]).map(toLocalVocabularyItem);
    const localWriting = (writingRes.data as RemoteWritingHistoryRow[]).map(toLocalWritingEntry);
    const localRead = (readRes.data as RemoteReadArticleRow[]).map(toLocalReadArticle);
    const syncedRemoteElo = (eloRes.data as RemoteEloHistoryRow[]).map(toLocalEloHistoryItem);
    const retainedLocalDictationElo = existingDictationHistory.map((item) => ({
        ...item,
        id: undefined,
        user_id: userId,
        sync_status: "synced" as const,
        updated_at: item.updated_at || nowIso(),
    }));
    const localElo = [...syncedRemoteElo, ...retainedLocalDictationElo];

    await db.transaction(
        "rw",
        [db.user_profile, db.vocabulary, db.writing_history, db.read_articles, db.elo_history],
        async () => {
            await db.user_profile.clear();
            await db.vocabulary.clear();
            await db.writing_history.clear();
            await db.read_articles.clear();
            await db.elo_history.clear();

            await db.user_profile.add(localProfile);
            if (localVocabulary.length) await db.vocabulary.bulkPut(localVocabulary);
            if (localWriting.length) await db.writing_history.bulkAdd(localWriting);
            if (localRead.length) await db.read_articles.bulkPut(localRead);
            if (localElo.length) await db.elo_history.bulkAdd(localElo);
        },
    );
}

async function migrateLegacyData(userId: string) {
    const supabase = createBrowserClientSingleton();
    await ensureRemoteProfile(userId);

    const [profile, vocabulary, writingHistory, readArticles, eloHistory] = await Promise.all([
        db.user_profile.orderBy("id").first(),
        db.vocabulary.toArray(),
        db.writing_history.toArray(),
        db.read_articles.toArray(),
        db.elo_history.toArray(),
    ]);

    if (profile) {
        await upsertLocalProfile({
            ...profile,
            user_id: userId,
            updated_at: profile.updated_at || nowIso(),
            sync_status: "pending",
        });

        const patch = buildProfilePatch({
            coins: profile.coins,
            inventory: normalizeInventory(profile.inventory, profile.hints),
            owned_themes: profile.owned_themes,
            active_theme: profile.active_theme,
            username: profile.username,
            avatar_preset: profile.avatar_preset,
            bio: profile.bio,
            deepseek_api_key: profile.deepseek_api_key,
            learning_preferences: profile.learning_preferences,
            reading_coins: profile.reading_coins,
            reading_streak: profile.reading_streak,
            reading_last_daily_grant_at: profile.reading_last_daily_grant_at,
            cat_score: profile.cat_score,
            cat_level: profile.cat_level,
            cat_theta: profile.cat_theta,
            cat_points: profile.cat_points,
            cat_current_band: profile.cat_current_band,
            cat_updated_at: profile.cat_updated_at,
            dictation_elo: profile.dictation_elo,
            dictation_streak: profile.dictation_streak,
            dictation_max_elo: profile.dictation_max_elo,
            rebuild_hidden_elo: profile.rebuild_hidden_elo,
            rebuild_elo: profile.rebuild_elo,
            rebuild_streak: profile.rebuild_streak,
            rebuild_max_elo: profile.rebuild_max_elo,
            last_practice_at: new Date(profile.last_practice).toISOString(),
        });

        if (Object.keys(patch).length > 0) {
            await queueOutboxItem({
                entity: "profile",
                operation: "upsert",
                recordKey: "profile",
                payload: patch,
            });
        }
    } else {
        await upsertLocalProfile(createDefaultLocalProfile(userId));
    }

    for (const item of vocabulary) {
        const nextItem = createLocalVocabularyItem(userId, {
            ...item,
            remote_id: item.remote_id || crypto.randomUUID(),
        });
        await db.vocabulary.put(nextItem);
        await queueOutboxItem({
            entity: "vocabulary",
            operation: "upsert",
            recordKey: nextItem.word_key || normalizeWordKey(nextItem.word),
            payload: toRemoteVocabularyRow(userId, nextItem),
        });
    }

    for (const entry of writingHistory) {
        const remoteId = entry.remote_id || crypto.randomUUID();
        await db.writing_history.put({
            ...entry,
            remote_id: remoteId,
            user_id: userId,
            updated_at: entry.updated_at || nowIso(),
            sync_status: "pending",
        });

        const writingResult = await supabase
            .from("writing_history")
            .upsert(toRemoteWritingEntry(userId, {
                ...entry,
                remote_id: remoteId,
                user_id: userId,
                updated_at: entry.updated_at || nowIso(),
                sync_status: "pending",
            }));
        assertSupabaseMutationSucceeded(writingResult, "writing_history migration");
    }

    for (const item of readArticles) {
        const remoteId = item.remote_id || crypto.randomUUID();
        await db.read_articles.put({
            ...item,
            remote_id: remoteId,
            user_id: userId,
            read_at: item.read_at || item.timestamp,
            updated_at: item.updated_at || nowIso(),
            sync_status: "pending",
        });

        await queueOutboxItem({
            entity: "read_articles",
            operation: "upsert",
            recordKey: item.url,
            payload: toRemoteReadArticle(userId, {
                ...item,
                remote_id: remoteId,
                user_id: userId,
                read_at: item.read_at || item.timestamp,
                updated_at: item.updated_at || nowIso(),
                sync_status: "pending",
            }),
        });
    }

    for (const item of eloHistory) {
        if (item.mode === "dictation") {
            await db.elo_history.put({
                ...item,
                user_id: userId,
                updated_at: item.updated_at || nowIso(),
                sync_status: "synced",
            });
            continue;
        }

        const remoteId = item.remote_id || crypto.randomUUID();
        await db.elo_history.put({
            ...item,
            remote_id: remoteId,
            user_id: userId,
            updated_at: item.updated_at || nowIso(),
            sync_status: "pending",
        });

        const eloResult = await supabase
            .from("elo_history")
            .upsert(toRemoteEloHistoryRow(userId, {
                ...item,
                remote_id: remoteId,
                user_id: userId,
                updated_at: item.updated_at || nowIso(),
                sync_status: "pending",
            }));
        assertSupabaseMutationSucceeded(eloResult, "elo_history migration");
    }

    await db.sync_meta.put({
        key: `migration:${userId}`,
        value: true,
        updated_at: Date.now(),
    });
}

export async function flushOutbox() {
    requireOnline();
    const userId = await getAuthenticatedUserId();

    const supabase = createBrowserClientSingleton();
    const setPhase = useSyncStatusStore.getState().setPhase;
    setPhase("syncing");

    const items = await db.sync_outbox.orderBy("created_at").toArray();
    for (const item of items) {
        try {
            if (item.entity === "profile") {
                const patch = item.payload;
                const { error } = await supabase
                    .from("profiles")
                    .update({
                        ...patch,
                        updated_at: nowIso(),
                    })
                    .eq("user_id", userId);
                if (error) throw error;
            }

            if (item.entity === "vocabulary") {
                if (item.operation === "delete") {
                    const { error } = await supabase
                        .from("vocabulary")
                        .delete()
                        .eq("user_id", userId)
                        .eq("word_key", item.record_key);
                    if (error) throw error;
                } else {
                    const { error } = await supabase
                        .from("vocabulary")
                        .upsert(item.payload, { onConflict: "user_id,word_key" });
                    if (error) throw error;
                }
            }

            if (item.entity === "writing_history") {
                const { error } = await supabase
                    .from("writing_history")
                    .upsert(item.payload);
                if (error) throw error;
            }

            if (item.entity === "read_articles") {
                const { error } = await supabase
                    .from("read_articles")
                    .upsert(item.payload, { onConflict: "user_id,url" });
                if (error) throw error;
            }

            if (item.entity === "elo_history") {
                const { error } = await supabase
                    .from("elo_history")
                    .upsert(item.payload);
                if (error) throw error;
            }

            if (item.id) {
                await db.sync_outbox.delete(item.id);
            }
            await markLocalOutboxItemSynced(item);
        } catch (error) {
            const message = getUserFacingSyncError(error);
            if (item.id) {
                await db.sync_outbox.update(item.id, {
                    attempts: item.attempts + 1,
                    updated_at: Date.now(),
                    last_error: message,
                    sync_status: "error",
                });
            }
            setPhase("error", message);
            throw error;
        }
    }

    await db.sync_meta.put({
        key: "last_successful_sync_at",
        value: Date.now(),
        updated_at: Date.now(),
    });

    setPhase("synced");
}

async function syncRemoteMirror(userId: string, options: RemoteSyncOptions = {}) {
    requireOnline();

    await ensureRemoteProfile(userId);

    const migrationMeta = await db.sync_meta.get(`migration:${userId}`);
    if (!migrationMeta?.value && await hasLegacyLocalData()) {
        await migrateLegacyData(userId);
    }

    await flushOutbox();

    const shouldAttemptPull = Boolean(options.forcePull || options.pullSnapshot);
    if (shouldAttemptPull && await shouldPullRemoteSnapshot(userId, Boolean(options.forcePull))) {
        await pullRemoteSnapshot(userId);
        await db.sync_meta.put({
            key: "last_remote_pull_at",
            value: Date.now(),
            updated_at: Date.now(),
        });
    }

    await db.sync_meta.put({
        key: "last_bootstrap_at",
        value: Date.now(),
        updated_at: Date.now(),
    });
    await db.sync_meta.put({
        key: "last_successful_sync_at",
        value: Date.now(),
        updated_at: Date.now(),
    });

    const syncStore = useSyncStatusStore.getState();
    syncStore.setPhase("synced");
    syncStore.setReady(true);
}

export function scheduleBackgroundSync(options: RemoteSyncOptions = {}) {
    pendingBackgroundPull = pendingBackgroundPull || Boolean(options.pullSnapshot);
    pendingForcedPull = pendingForcedPull || Boolean(options.forcePull);

    if (backgroundSyncPromise) {
        return backgroundSyncPromise;
    }

    backgroundSyncPromise = (async () => {
        try {
            while (true) {
                const pullSnapshot = pendingBackgroundPull;
                const forcePull = pendingForcedPull;
                pendingBackgroundPull = false;
                pendingForcedPull = false;

                const userId = await getActiveUserId();
                if (!userId) {
                    break;
                }

                await syncRemoteMirror(userId, { pullSnapshot, forcePull });

                if (!pendingBackgroundPull && !pendingForcedPull) {
                    break;
                }
            }
        } catch (error) {
            const message = getUserFacingSyncError(error);
            useSyncStatusStore.getState().setPhase("error", message);
            if (options.throwOnError) {
                throw new Error(message);
            }
        } finally {
            backgroundSyncPromise = null;
            if (pendingBackgroundPull || pendingForcedPull) {
                scheduleBackgroundSync();
            }
        }
    })();

    return backgroundSyncPromise;
}

export async function bootstrapUserSession(userId: string): Promise<BootstrapResult> {
    const syncStore = useSyncStatusStore.getState();

    const activeUserId = await getActiveUserId();
    if (activeUserId && activeUserId !== userId) {
        await clearCoreTables();
    }

    await setActiveUserId(userId);
    const canUseLocalCache = await hasUsableLocalCache(userId);

    syncStore.setPhase(canUseLocalCache ? "syncing" : "bootstrapping");
    syncStore.setReady(canUseLocalCache);

    if (canUseLocalCache) {
        void scheduleBackgroundSync({ pullSnapshot: true });
        return { usedLocalCache: true };
    }

    await syncRemoteMirror(userId, { pullSnapshot: true, forcePull: true });
    return { usedLocalCache: false };
}

export function syncNow() {
    useSyncStatusStore.getState().setPhase("syncing");
    return scheduleBackgroundSync({ pullSnapshot: true, forcePull: true, throwOnError: true });
}

export async function loadLocalUserData() {
    const [vocabulary, writingHistory, readArticles] = await Promise.all([
        db.vocabulary.toArray(),
        db.writing_history.orderBy("timestamp").reverse().toArray(),
        db.read_articles.toArray(),
    ]);

    return {
        vocabulary,
        writingHistory,
        readArticleUrls: readArticles.map((item) => item.url),
    };
}

async function ensureListeningScoringVersion(profile: LocalUserProfile | undefined) {
    if (!profile?.id) {
        return profile;
    }

    if ((profile.listening_scoring_version ?? 0) >= LISTENING_SCORING_VERSION) {
        return profile;
    }

    const nextUpdatedAt = nowIso();
    const nextProfile: LocalUserProfile = {
        ...profile,
        listening_scoring_version: LISTENING_SCORING_VERSION,
        listening_elo: DEFAULT_BASE_ELO,
        listening_streak: 0,
        listening_max_elo: DEFAULT_BASE_ELO,
        rebuild_hidden_elo: profile.rebuild_hidden_elo ?? profile.listening_elo ?? profile.elo_rating ?? DEFAULT_BASE_ELO,
        rebuild_elo: profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? profile.listening_elo ?? profile.elo_rating ?? DEFAULT_BASE_ELO,
        rebuild_streak: profile.rebuild_streak ?? 0,
        rebuild_max_elo: profile.rebuild_max_elo ?? profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? profile.listening_elo ?? profile.elo_rating ?? DEFAULT_BASE_ELO,
        updated_at: nextUpdatedAt,
        sync_status: "pending",
    };

    await db.user_profile.put(nextProfile);
    await db.sync_meta.put({
        key: "listening_scoring_version",
        value: LISTENING_SCORING_VERSION,
        updated_at: Date.now(),
    });

    if (nextProfile.user_id) {
        await queueOutboxItem({
            entity: "profile",
            operation: "upsert",
            recordKey: "profile",
            payload: {
                translation_elo: nextProfile.elo_rating,
                listening_elo: nextProfile.listening_elo ?? DEFAULT_BASE_ELO,
                rebuild_hidden_elo: nextProfile.rebuild_hidden_elo ?? nextProfile.listening_elo ?? DEFAULT_BASE_ELO,
                rebuild_elo: nextProfile.rebuild_elo ?? nextProfile.rebuild_hidden_elo ?? nextProfile.listening_elo ?? DEFAULT_BASE_ELO,
                streak_count: nextProfile.streak_count,
                listening_streak: nextProfile.listening_streak ?? 0,
                rebuild_streak: nextProfile.rebuild_streak ?? 0,
                max_translation_elo: nextProfile.max_elo,
                max_listening_elo: nextProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
                rebuild_max_elo: nextProfile.rebuild_max_elo ?? nextProfile.rebuild_elo ?? nextProfile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO,
                coins: nextProfile.coins ?? DEFAULT_STARTING_COINS,
                inventory: normalizeInventory(nextProfile.inventory, nextProfile.hints),
                owned_themes: nextProfile.owned_themes ?? [DEFAULT_FREE_THEME],
                active_theme: nextProfile.active_theme ?? DEFAULT_FREE_THEME,
                last_practice_at: new Date(nextProfile.last_practice).toISOString(),
            },
        });
        useSyncStatusStore.getState().setPhase("syncing");
        void scheduleBackgroundSync();
    }

    return nextProfile;
}

export async function loadLocalProfile() {
    const profile = await db.user_profile.orderBy("id").first();
    return ensureListeningScoringVersion(profile);
}

export async function saveVocabulary(item: VocabItem) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error("Missing active user.");

    const nextItem = createLocalVocabularyItem(userId, {
        ...item,
        remote_id: item.remote_id || crypto.randomUUID(),
    });

    await db.vocabulary.put(nextItem);
    await queueOutboxItem({
        entity: "vocabulary",
        operation: "upsert",
        recordKey: nextItem.word_key || normalizeWordKey(nextItem.word),
        payload: toRemoteVocabularyRow(userId, nextItem),
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function deleteVocabulary(word: string) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error("Missing active user.");

    const wordKey = normalizeWordKey(word);
    await db.vocabulary.delete(word);
    await queueOutboxItem({
        entity: "vocabulary",
        operation: "delete",
        recordKey: wordKey,
        payload: { user_id: userId, word_key: wordKey },
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function saveWritingHistory(entry: WritingEntry) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error("Missing active user.");

    const remoteId = entry.remote_id || crypto.randomUUID();
    const nextEntry: WritingEntry = {
        ...entry,
        remote_id: remoteId,
        user_id: userId,
        updated_at: entry.updated_at || nowIso(),
        sync_status: "pending",
    };

    await db.writing_history.add(nextEntry);
    await queueOutboxItem({
        entity: "writing_history",
        operation: "upsert",
        recordKey: remoteId,
        payload: toRemoteWritingEntry(userId, nextEntry),
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function markArticleAsRead(url: string) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error("Missing active user.");

    const existing = await db.read_articles.get(url);
    if (existing) return;

    const nextItem: ReadArticleItem = {
        url,
        timestamp: Date.now(),
        read_at: Date.now(),
        remote_id: crypto.randomUUID(),
        user_id: userId,
        updated_at: nowIso(),
        sync_status: "pending",
    };

    await db.read_articles.put(nextItem);
    await queueOutboxItem({
        entity: "read_articles",
        operation: "upsert",
        recordKey: url,
        payload: toRemoteReadArticle(userId, nextItem),
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function saveProfilePatch(
    patch: Partial<
        Pick<
            LocalUserProfile,
            "coins" | "inventory" | "owned_themes" | "active_theme" | "username" | "avatar_preset" | "bio" | "learning_preferences"
            | "deepseek_api_key" | "reading_coins" | "reading_streak" | "reading_last_daily_grant_at"
            | "cat_score" | "cat_level" | "cat_theta" | "cat_points" | "cat_current_band" | "cat_updated_at"
            | "cat_se" | "dictation_elo" | "dictation_streak" | "dictation_max_elo"
            | "rebuild_hidden_elo" | "rebuild_elo" | "rebuild_streak" | "rebuild_max_elo"
        >
    > & {
        last_practice_at?: string | number | null;
    },
) {
    const profile = await db.user_profile.orderBy("id").first();
    if (!profile?.id) throw new Error("Local profile not initialized.");

    const nextPatch = buildProfilePatch(patch);
    const nextLastPractice = patch.last_practice_at !== undefined && patch.last_practice_at !== null
        ? new Date(patch.last_practice_at).getTime()
        : profile.last_practice;
    await db.user_profile.update(profile.id, {
        ...nextPatch,
        hints: patch.inventory?.capsule ?? profile.hints,
        last_practice: Number.isFinite(nextLastPractice) ? nextLastPractice : profile.last_practice,
        updated_at: nowIso(),
        sync_status: "pending",
    });

    await queueOutboxItem({
        entity: "profile",
        operation: "upsert",
        recordKey: "profile",
        payload: nextPatch,
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function applyServerProfilePatchToLocal(
    patch: Partial<
        Pick<
            LocalUserProfile,
            "coins" | "inventory" | "owned_themes" | "active_theme" | "username" | "avatar_preset" | "bio" | "learning_preferences"
            | "deepseek_api_key" | "reading_coins" | "reading_streak" | "reading_last_daily_grant_at"
            | "cat_score" | "cat_level" | "cat_theta" | "cat_points" | "cat_current_band" | "cat_updated_at"
            | "cat_se" | "dictation_elo" | "dictation_streak" | "dictation_max_elo"
            | "rebuild_hidden_elo" | "rebuild_elo" | "rebuild_streak" | "rebuild_max_elo"
        >
    > & {
        last_practice_at?: string | number | null;
    },
) {
    const profile = await db.user_profile.orderBy("id").first();
    if (!profile?.id) return;

    const normalized = buildProfilePatch(patch);
    const nextLastPractice = patch.last_practice_at !== undefined && patch.last_practice_at !== null
        ? new Date(patch.last_practice_at).getTime()
        : profile.last_practice;
    await db.user_profile.update(profile.id, {
        ...normalized,
        hints: patch.inventory?.capsule ?? profile.hints,
        last_practice: Number.isFinite(nextLastPractice) ? nextLastPractice : profile.last_practice,
        updated_at: nowIso(),
        sync_status: "synced",
    });
}

export async function settleBattle(payload: {
    mode: "translation" | "listening" | "rebuild";
    eloAfter: number;
    change: number;
    streak: number;
    maxElo: number;
    coins?: number;
    inventory?: Record<string, number> | null;
    ownedThemes?: string[] | null;
    activeTheme?: string | null;
    source?: string;
}) {
    const userId = await getActiveUserId();
    const profile = await db.user_profile.orderBy("id").first();
    if (!profile?.id || !userId) throw new Error("Local profile not initialized.");

    const nextUpdatedAt = nowIso();
    const nextInventory = payload.inventory
        ? normalizeInventory(payload.inventory, profile.hints)
        : normalizeInventory(profile.inventory, profile.hints);
    const nextOwnedThemes = payload.ownedThemes ?? profile.owned_themes ?? [DEFAULT_FREE_THEME];
    const nextActiveTheme = payload.activeTheme ?? profile.active_theme ?? DEFAULT_FREE_THEME;
    const isListening = payload.mode === "listening";
    const isRebuild = payload.mode === "rebuild";

    const localProfile: LocalUserProfile = {
        ...profile,
        user_id: userId,
        remote_id: userId,
        elo_rating: isListening || isRebuild ? profile.elo_rating : payload.eloAfter,
        streak_count: isListening || isRebuild ? profile.streak_count : payload.streak,
        max_elo: isListening || isRebuild ? profile.max_elo : payload.maxElo,
        listening_scoring_version: LISTENING_SCORING_VERSION,
        listening_elo: isListening ? payload.eloAfter : (profile.listening_elo ?? DEFAULT_BASE_ELO),
        listening_streak: isListening ? payload.streak : (profile.listening_streak ?? 0),
        listening_max_elo: isListening ? payload.maxElo : (profile.listening_max_elo ?? DEFAULT_BASE_ELO),
        rebuild_elo: isRebuild ? payload.eloAfter : (profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO),
        rebuild_streak: isRebuild ? payload.streak : (profile.rebuild_streak ?? 0),
        rebuild_max_elo: isRebuild
            ? payload.maxElo
            : (profile.rebuild_max_elo ?? profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO),
        coins: payload.coins ?? profile.coins ?? DEFAULT_STARTING_COINS,
        inventory: nextInventory,
        hints: nextInventory.capsule,
        owned_themes: nextOwnedThemes,
        active_theme: nextActiveTheme,
        last_practice: Date.now(),
        updated_at: nextUpdatedAt,
        sync_status: "pending",
    };

    await db.user_profile.put({
        ...localProfile,
        id: profile.id,
    });

    const localHistory: EloHistoryItem = {
        remote_id: crypto.randomUUID(),
        user_id: userId,
        mode: payload.mode,
        elo: payload.eloAfter,
        change: payload.change,
        timestamp: Date.now(),
        source: payload.source || "battle",
        updated_at: nextUpdatedAt,
        sync_status: "pending",
    };

    await db.elo_history.add(localHistory);
    await queueOutboxItem({
        entity: "profile",
        operation: "upsert",
        recordKey: "profile",
        payload: {
            translation_elo: localProfile.elo_rating,
            listening_elo: localProfile.listening_elo ?? DEFAULT_BASE_ELO,
            rebuild_hidden_elo: localProfile.rebuild_hidden_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
            rebuild_elo: localProfile.rebuild_elo ?? localProfile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO,
            streak_count: localProfile.streak_count,
            listening_streak: localProfile.listening_streak ?? 0,
            rebuild_streak: localProfile.rebuild_streak ?? 0,
            max_translation_elo: localProfile.max_elo,
            max_listening_elo: localProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
            rebuild_max_elo: localProfile.rebuild_max_elo ?? localProfile.rebuild_elo ?? localProfile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO,
            coins: localProfile.coins ?? DEFAULT_STARTING_COINS,
            inventory: nextInventory,
            owned_themes: nextOwnedThemes,
            active_theme: nextActiveTheme,
            last_practice_at: new Date(localProfile.last_practice).toISOString(),
        },
    });
    await queueOutboxItem({
        entity: "elo_history",
        operation: "upsert",
        recordKey: localHistory.remote_id!,
        payload: toRemoteEloHistoryRow(userId, localHistory),
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
    return localProfile;
}
