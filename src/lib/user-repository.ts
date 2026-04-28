"use client";

import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { useSyncStatusStore } from "@/lib/sync-status";
import {
    db,
    type AICacheItem,
    type CachedArticle,
    type EloHistoryItem,
    type LocalUserProfile,
    type ReadingNoteItem,
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
    DEFAULT_TRANSLATION_ELO,
    normalizeInventory,
    normalizeWordKey,
    type RemoteProfileRow,
    type RemoteDailyPlanRow,
    toLocalDailyPlanRecord,
    toLocalEloHistoryItem,
    toLocalProfile,
    toLocalReadArticle,
    toLocalVocabularyItem,
    toLocalWritingEntry,
    toLocalErrorLedgerItem,
    toRemoteDailyPlanRow,
    toRemoteEloHistoryRow,
    toRemoteReadArticle,
    toRemoteVocabularyRow,
    toRemoteWritingEntry,
    toRemoteErrorLedgerRow,
    upsertLocalProfile,
    normalizeAvatarPreset,
    normalizeLearningPreferences,
    normalizeProfileBio,
    normalizeProfileGlmModel,
    normalizeProfileGlmThinkingMode,
    normalizeProfileUsername,
    type RemoteEloHistoryRow,
    type RemoteReadArticleRow,
    type RemoteVocabularyRow,
    type RemoteWritingHistoryRow,
} from "@/lib/user-sync";

type SyncEntity = "profile" | "vocabulary" | "writing_history" | "read_articles" | "elo_history" | "error_ledger";

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

export interface ReadArticleSnapshotMetadata {
    articleKey?: string;
    articleTitle?: string;
    articlePayload?: CachedArticle;
    readingNotesPayload?: Array<Omit<ReadingNoteItem, "id">>;
    grammarPayload?: Array<{
        key: string;
        data: unknown;
        timestamp: number;
    }>;
    askPayload?: Array<{
        key: string;
        data: unknown;
        timestamp: number;
    }>;
}

const REMOTE_PULL_INTERVAL_MS = 5 * 60 * 1000;
const LISTENING_SCORING_VERSION = 2;

let backgroundSyncPromise: Promise<void> | null = null;
let pendingBackgroundPull = false;
let pendingForcedPull = false;

function nowIso() {
    return new Date().toISOString();
}

function safeJson(value: unknown) {
    try {
        return JSON.stringify(value ?? null);
    } catch {
        return "__SERIALIZE_ERROR__";
    }
}

function parseUpdatedAtMs(value?: string | null) {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function shouldPushLocalRecord(localUpdatedAt?: string | null, remoteUpdatedAt?: string | null, localSyncStatus?: "synced" | "pending" | "error") {
    if (localSyncStatus === "pending" || localSyncStatus === "error") {
        return true;
    }

    const localMs = parseUpdatedAtMs(localUpdatedAt);
    const remoteMs = parseUpdatedAtMs(remoteUpdatedAt);
    if (remoteMs === null) return true;
    if (localMs === null) return false;
    return localMs > remoteMs;
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
        [db.user_profile, db.vocabulary, db.writing_history, db.read_articles, db.articles, db.reading_notes, db.ai_cache, db.elo_history, db.daily_plans, db.error_ledger, db.rag_vectors, db.sync_outbox],
        async () => {
            await db.user_profile.clear();
            await db.vocabulary.clear();
            await db.writing_history.clear();
            await db.read_articles.clear();
            await db.articles.clear();
            await db.reading_notes.clear();
            await db.ai_cache.clear();
            await db.elo_history.clear();
            await db.daily_plans.clear();
            await db.error_ledger.clear();
            await db.rag_vectors.clear();
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

export async function getRemoteLatestUpdatedAt(userId: string) {
    const supabase = createBrowserClientSingleton();
    const responses = await Promise.all([
        supabase.from("profiles").select("updated_at").eq("user_id", userId).single(),
        supabase.from("vocabulary").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("writing_history").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("read_articles").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("elo_history").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("daily_plans").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("error_ledger").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
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
        return;
    }

    if (item.entity === "error_ledger") {
        const errorLedger = await db.error_ledger.where("remote_id").equals(item.record_key).first();
        if (errorLedger?.id) {
            await db.error_ledger.update(errorLedger.id, syncedPatch);
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
            ai_provider: localProfile.ai_provider ?? "deepseek",
            deepseek_api_key: localProfile.deepseek_api_key ?? "",
            deepseek_model: localProfile.deepseek_model ?? "deepseek-v4-flash",
            deepseek_thinking_mode: localProfile.deepseek_thinking_mode ?? "off",
            deepseek_reasoning_effort: localProfile.deepseek_reasoning_effort ?? "high",
            glm_api_key: localProfile.glm_api_key ?? "",
            nvidia_api_key: localProfile.nvidia_api_key ?? "",
            nvidia_model: localProfile.nvidia_model ?? "z-ai/glm5",
            github_api_key: localProfile.github_api_key ?? "",
            github_model: localProfile.github_model ?? "openai/gpt-4.1",
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
            exam_date: localProfile.exam_date ?? null,
            exam_type: localProfile.exam_type ?? null,
            exam_goal_score: localProfile.exam_goal_score ?? null,
            daily_plan_snapshots: localProfile.daily_plan_snapshots ?? [],
            last_practice_at: new Date(localProfile.last_practice).toISOString(),
            updated_at: localProfile.updated_at || nowIso(),
        }
        : {
            user_id: userId,
            translation_elo: DEFAULT_TRANSLATION_ELO,
            listening_elo: DEFAULT_BASE_ELO,
            rebuild_hidden_elo: DEFAULT_BASE_ELO,
            rebuild_elo: DEFAULT_BASE_ELO,
            dictation_elo: DEFAULT_BASE_ELO,
            streak_count: 0,
            listening_streak: 0,
            rebuild_streak: 0,
            dictation_streak: 0,
            max_translation_elo: DEFAULT_TRANSLATION_ELO,
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
            ai_provider: "deepseek",
            deepseek_api_key: "",
            deepseek_model: "deepseek-v4-flash",
            deepseek_thinking_mode: "off",
            deepseek_reasoning_effort: "high",
            glm_api_key: "",
            nvidia_api_key: "",
            nvidia_model: "z-ai/glm5",
            github_api_key: "",
            github_model: "openai/gpt-4.1",
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
            exam_date: null,
            exam_type: null,
            exam_goal_score: null,
            daily_plan_snapshots: [],
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

async function pushLocalNewerRecords(userId: string, remoteProfile: RemoteProfileRow) {
    const supabase = createBrowserClientSingleton();

    const localProfile = await db.user_profile.orderBy("id").first();
    if (localProfile?.id) {
        const shouldPushProfile = shouldPushLocalRecord(
            localProfile.updated_at,
            remoteProfile.updated_at,
            localProfile.sync_status,
        );

        if (shouldPushProfile) {
            const payload = {
                translation_elo: localProfile.elo_rating,
                listening_elo: localProfile.listening_elo ?? DEFAULT_BASE_ELO,
                rebuild_hidden_elo: localProfile.rebuild_hidden_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
                rebuild_elo: localProfile.rebuild_elo ?? localProfile.rebuild_hidden_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
                dictation_elo: localProfile.dictation_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
                streak_count: localProfile.streak_count,
                listening_streak: localProfile.listening_streak ?? 0,
                rebuild_streak: localProfile.rebuild_streak ?? 0,
                dictation_streak: localProfile.dictation_streak ?? 0,
                max_translation_elo: localProfile.max_elo,
                max_listening_elo: localProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
                rebuild_max_elo: localProfile.rebuild_max_elo ?? localProfile.rebuild_elo ?? localProfile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO,
                dictation_max_elo: localProfile.dictation_max_elo ?? localProfile.dictation_elo ?? localProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
                coins: localProfile.coins ?? DEFAULT_STARTING_COINS,
                inventory: normalizeInventory(localProfile.inventory, localProfile.hints),
                owned_themes: localProfile.owned_themes ?? [DEFAULT_FREE_THEME],
                active_theme: localProfile.active_theme ?? DEFAULT_FREE_THEME,
                username: normalizeProfileUsername(localProfile.username),
                avatar_preset: normalizeAvatarPreset(localProfile.avatar_preset),
                bio: normalizeProfileBio(localProfile.bio),
                ai_provider: localProfile.ai_provider ?? "deepseek",
                deepseek_api_key: localProfile.deepseek_api_key ?? "",
                deepseek_model: localProfile.deepseek_model ?? "deepseek-v4-flash",
                deepseek_thinking_mode: localProfile.deepseek_thinking_mode ?? "off",
                deepseek_reasoning_effort: localProfile.deepseek_reasoning_effort ?? "high",
                glm_api_key: localProfile.glm_api_key ?? "",
                nvidia_api_key: localProfile.nvidia_api_key ?? "",
                nvidia_model: localProfile.nvidia_model ?? "z-ai/glm5",
                github_api_key: localProfile.github_api_key ?? "",
                github_model: localProfile.github_model ?? "openai/gpt-4.1",
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
                exam_date: localProfile.exam_date ?? null,
                exam_type: localProfile.exam_type ?? null,
                exam_goal_score: localProfile.exam_goal_score ?? null,
                daily_plan_snapshots: localProfile.daily_plan_snapshots ?? [],
                last_practice_at: new Date(localProfile.last_practice).toISOString(),
                updated_at: localProfile.updated_at || nowIso(),
            };

            const profileResult = await supabase
                .from("profiles")
                .update(payload)
                .eq("user_id", userId);
            assertSupabaseMutationSucceeded(profileResult, "profile push-newer");

            await db.user_profile.update(localProfile.id, {
                user_id: userId,
                sync_status: "synced",
                updated_at: payload.updated_at,
            });
        }
    }

    const [localVocabulary, remoteVocabularyRes] = await Promise.all([
        db.vocabulary.toArray(),
        supabase
            .from("vocabulary")
            .select("id, word_key, updated_at")
            .eq("user_id", userId),
    ]);
    if (remoteVocabularyRes.error) throw remoteVocabularyRes.error;
    const remoteVocabularyByWordKey = new Map<string, Pick<RemoteVocabularyRow, "id" | "word_key" | "updated_at">>();
    for (const row of (remoteVocabularyRes.data ?? []) as Array<Pick<RemoteVocabularyRow, "id" | "word_key" | "updated_at">>) {
        remoteVocabularyByWordKey.set(row.word_key, row);
    }

    for (const item of localVocabulary) {
        const wordKey = item.word_key || normalizeWordKey(item.word);
        const remote = remoteVocabularyByWordKey.get(wordKey);
        if (!shouldPushLocalRecord(item.updated_at, remote?.updated_at, item.sync_status)) {
            continue;
        }

        const remoteId = item.remote_id || remote?.id || crypto.randomUUID();
        const updatedAt = item.updated_at || nowIso();
        const payload = toRemoteVocabularyRow(userId, {
            ...item,
            remote_id: remoteId,
            user_id: userId,
            word_key: wordKey,
            updated_at: updatedAt,
            sync_status: "pending",
        });

        const vocabResult = await supabase
            .from("vocabulary")
            .upsert(payload, { onConflict: "user_id,word_key" });
        assertSupabaseMutationSucceeded(vocabResult, "vocabulary push-newer");

        await db.vocabulary.update(item.word, {
            user_id: userId,
            remote_id: remoteId,
            word_key: wordKey,
            updated_at: updatedAt,
            sync_status: "synced",
        });
    }

    const [localWritingHistory, remoteWritingRes] = await Promise.all([
        db.writing_history.toArray(),
        supabase
            .from("writing_history")
            .select("id, updated_at")
            .eq("user_id", userId),
    ]);
    if (remoteWritingRes.error) throw remoteWritingRes.error;
    const remoteWritingById = new Map<string, Pick<RemoteWritingHistoryRow, "id" | "updated_at">>();
    for (const row of (remoteWritingRes.data ?? []) as Array<Pick<RemoteWritingHistoryRow, "id" | "updated_at">>) {
        remoteWritingById.set(row.id, row);
    }

    for (const entry of localWritingHistory) {
        if (!entry.id) continue;
        const remoteId = entry.remote_id || crypto.randomUUID();
        const remote = remoteWritingById.get(remoteId);
        if (!shouldPushLocalRecord(entry.updated_at, remote?.updated_at, entry.sync_status)) {
            continue;
        }

        const updatedAt = entry.updated_at || nowIso();
        const payload = toRemoteWritingEntry(userId, {
            ...entry,
            remote_id: remoteId,
            user_id: userId,
            updated_at: updatedAt,
            sync_status: "pending",
        });
        const writingResult = await supabase
            .from("writing_history")
            .upsert(payload);
        assertSupabaseMutationSucceeded(writingResult, "writing_history push-newer");

        await db.writing_history.update(entry.id, {
            user_id: userId,
            remote_id: remoteId,
            updated_at: updatedAt,
            sync_status: "synced",
        });
    }

    const [localReadArticles, remoteReadRes] = await Promise.all([
        db.read_articles.toArray(),
        supabase
            .from("read_articles")
            .select("url, updated_at")
            .eq("user_id", userId),
    ]);
    if (remoteReadRes.error) throw remoteReadRes.error;
    const remoteReadByUrl = new Map<string, Pick<RemoteReadArticleRow, "url" | "updated_at">>();
    for (const row of (remoteReadRes.data ?? []) as Array<Pick<RemoteReadArticleRow, "url" | "updated_at">>) {
        remoteReadByUrl.set(row.url, row);
    }

    for (const item of localReadArticles) {
        const remote = remoteReadByUrl.get(item.url);
        if (!shouldPushLocalRecord(item.updated_at, remote?.updated_at, item.sync_status)) {
            continue;
        }

        const remoteId = item.remote_id || crypto.randomUUID();
        const updatedAt = item.updated_at || nowIso();
        const payload = toRemoteReadArticle(userId, {
            ...item,
            remote_id: remoteId,
            user_id: userId,
            read_at: item.read_at || item.timestamp,
            updated_at: updatedAt,
            sync_status: "pending",
        });
        const readResult = await supabase
            .from("read_articles")
            .upsert(payload, { onConflict: "user_id,url" });
        assertSupabaseMutationSucceeded(readResult, "read_articles push-newer");

        await db.read_articles.update(item.url, {
            user_id: userId,
            remote_id: remoteId,
            updated_at: updatedAt,
            sync_status: "synced",
        });
    }

    const [localEloHistory, remoteEloRes] = await Promise.all([
        db.elo_history.toArray(),
        supabase
            .from("elo_history")
            .select("id, updated_at")
            .eq("user_id", userId),
    ]);
    if (remoteEloRes.error) throw remoteEloRes.error;
    const remoteEloById = new Map<string, Pick<RemoteEloHistoryRow, "id" | "updated_at">>();
    for (const row of (remoteEloRes.data ?? []) as Array<Pick<RemoteEloHistoryRow, "id" | "updated_at">>) {
        remoteEloById.set(row.id, row);
    }

    for (const item of localEloHistory) {
        if (!item.id) continue;
        const remoteId = item.remote_id || crypto.randomUUID();
        const remote = remoteEloById.get(remoteId);
        if (!shouldPushLocalRecord(item.updated_at, remote?.updated_at, item.sync_status)) {
            continue;
        }

        const updatedAt = item.updated_at || nowIso();
        const payload = toRemoteEloHistoryRow(userId, {
            ...item,
            remote_id: remoteId,
            user_id: userId,
            updated_at: updatedAt,
            sync_status: "pending",
        });
        const eloResult = await supabase
            .from("elo_history")
            .upsert(payload);
        assertSupabaseMutationSucceeded(eloResult, "elo_history push-newer");

        await db.elo_history.update(item.id, {
            user_id: userId,
            remote_id: remoteId,
            updated_at: updatedAt,
            sync_status: "synced",
        });
    }

    const [localErrorLedger, remoteErrorLedgerRes] = await Promise.all([
        db.error_ledger.toArray(),
        supabase
            .from("error_ledger")
            .select("id, updated_at")
            .eq("user_id", userId),
    ]);
    if (remoteErrorLedgerRes.error) throw remoteErrorLedgerRes.error;
    const remoteErrorLedgerById = new Map<string, Pick<import("./user-sync").RemoteErrorLedgerRow, "id" | "updated_at">>();
    for (const row of (remoteErrorLedgerRes.data ?? []) as Array<Pick<import("./user-sync").RemoteErrorLedgerRow, "id" | "updated_at">>) {
        remoteErrorLedgerById.set(row.id, row);
    }

    for (const item of localErrorLedger) {
        if (!item.id) continue;
        const remoteId = item.remote_id || crypto.randomUUID();
        const remote = remoteErrorLedgerById.get(remoteId);
        if (!shouldPushLocalRecord(item.updated_at, remote?.updated_at, item.sync_status)) {
            continue;
        }

        const updatedAt = item.updated_at || nowIso();
        const payload = toRemoteErrorLedgerRow(userId, {
            ...item,
            remote_id: remoteId,
            user_id: userId,
            updated_at: updatedAt,
            sync_status: "pending",
        });
        const errorLedgerResult = await supabase
            .from("error_ledger")
            .upsert(payload);
        assertSupabaseMutationSucceeded(errorLedgerResult, "error_ledger push-newer");

        await db.error_ledger.update(item.id, {
            user_id: userId,
            remote_id: remoteId,
            updated_at: updatedAt,
            sync_status: "synced",
        });
    }
}


export async function queueOutboxItem({ entity, operation, recordKey, payload }: OutboxPayload) {
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

async function syncDailyPlanMirror(userId: string) {
    const supabase = createBrowserClientSingleton();
    const [localPlans, remoteRes] = await Promise.all([
        db.daily_plans.toArray(),
        supabase.from("daily_plans").select("date, items, updated_at, created_at").eq("user_id", userId),
    ]);

    if (remoteRes.error) {
        throw remoteRes.error;
    }

    const remotePlans = (remoteRes.data as RemoteDailyPlanRow[] | null) ?? [];
    const remoteByDate = new Map(remotePlans.map((plan) => [plan.date, plan]));
    const localByDate = new Map(localPlans.map((plan) => [plan.date, plan]));

    const upserts = localPlans
        .filter((localPlan) => {
            const remotePlan = remoteByDate.get(localPlan.date);
            if (!remotePlan) {
                return true;
            }

            const remoteUpdatedAt = Date.parse(remotePlan.updated_at);
            return !Number.isFinite(remoteUpdatedAt) || localPlan.updated_at >= remoteUpdatedAt;
        })
        .map((plan) => toRemoteDailyPlanRow(userId, plan));

    if (upserts.length > 0) {
        const result = await supabase
            .from("daily_plans")
            .upsert(upserts, { onConflict: "user_id,date" });
        assertSupabaseMutationSucceeded(result, "daily_plans push");
    }

    const staleRemoteDates = remotePlans
        .map((plan) => plan.date)
        .filter((date) => !localByDate.has(date));

    if (staleRemoteDates.length > 0) {
        const result = await supabase
            .from("daily_plans")
            .delete()
            .eq("user_id", userId)
            .in("date", staleRemoteDates);
        assertSupabaseMutationSucceeded(result, "daily_plans delete");
    }
}

export async function pullRemoteSnapshot(
    userId: string,
) {
    const supabase = createBrowserClientSingleton();
    const existingLocalProfile = await db.user_profile.orderBy("id").first();
    const pendingReadArticleDeletes = new Set(
        (await db.sync_outbox.toArray())
            .filter((item) => item.entity === "read_articles" && item.operation === "delete")
            .map((item) => item.record_key),
    );

    const [
        profileRes,
        vocabRes,
        writingRes,
        readRes,
        eloRes,
        dailyPlansRes,
        errorLedgerRes,
    ] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("vocabulary").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        supabase.from("writing_history").select("*").eq("user_id", userId).order("timestamp_ms", { ascending: false }),
        supabase.from("read_articles").select("*").eq("user_id", userId).order("timestamp_ms", { ascending: false }),
        supabase.from("elo_history").select("*").eq("user_id", userId).order("timestamp_ms", { ascending: true }),
        supabase.from("daily_plans").select("user_id,date,items,updated_at,created_at").eq("user_id", userId).order("date", { ascending: true }),
        supabase.from("error_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (vocabRes.error) throw vocabRes.error;
    if (writingRes.error) throw writingRes.error;
    if (readRes.error) throw readRes.error;
    if (eloRes.error) throw eloRes.error;
    if (dailyPlansRes.error) throw dailyPlansRes.error;
    if (errorLedgerRes.error) throw errorLedgerRes.error;

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
    const localDailyPlans = Array.isArray(localProfile.daily_plan_snapshots)
        ? localProfile.daily_plan_snapshots
        : [];
    const remoteDailyPlans = ((dailyPlansRes.data as RemoteDailyPlanRow[] | null) ?? []).map(toLocalDailyPlanRecord);
    const effectiveDailyPlans = remoteDailyPlans.length > 0 ? remoteDailyPlans : localDailyPlans;
    const effectiveLocalProfile: LocalUserProfile = {
        ...localProfile,
        daily_plan_snapshots: effectiveDailyPlans,
    };
    const localVocabulary = (vocabRes.data as RemoteVocabularyRow[]).map(toLocalVocabularyItem);
    const localWriting = (writingRes.data as RemoteWritingHistoryRow[]).map(toLocalWritingEntry);
    const localRead = (readRes.data as RemoteReadArticleRow[])
        .map(toLocalReadArticle)
        .filter((item) => !pendingReadArticleDeletes.has(item.url));
    const localElo = (eloRes.data as RemoteEloHistoryRow[]).map(toLocalEloHistoryItem);
    const localErrorLedger = (errorLedgerRes.data as import("./user-sync").RemoteErrorLedgerRow[]).map(toLocalErrorLedgerItem);
    const restoredArticlesByUrl = new Map<string, CachedArticle>();
    const restoredNotesByKey = new Map<string, Omit<ReadingNoteItem, "id">>();
    const restoredGrammarCacheByKey = new Map<string, AICacheItem>();
    const restoredAskCacheByKey = new Map<string, AICacheItem>();
    const allowedMarkTypes = new Set(["highlight", "underline", "note", "ask"]);

    for (const readItem of localRead) {
        if (pendingReadArticleDeletes.has(readItem.url)) {
            continue;
        }
        if (readItem.article_payload && typeof readItem.article_payload === "object") {
            const payload = readItem.article_payload as CachedArticle;
            const restoredArticle: CachedArticle = {
                ...payload,
                url: readItem.url,
                title: payload.title || readItem.article_title || "Untitled",
                content: payload.content || "",
                textContent: payload.textContent || payload.content || "",
                timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : readItem.timestamp,
            };
            restoredArticlesByUrl.set(readItem.url, restoredArticle);
        }

        const noteRows = Array.isArray(readItem.reading_notes_payload)
            ? readItem.reading_notes_payload
            : [];
        for (const rawNote of noteRows) {
            if (!rawNote || typeof rawNote !== "object") continue;
            const note = rawNote as Omit<ReadingNoteItem, "id">;
            const articleKey = typeof note.article_key === "string" && note.article_key.trim()
                ? note.article_key.trim()
                : (readItem.article_key || readItem.url);
            const paragraphOrder = Number.isFinite(note.paragraph_order) ? Number(note.paragraph_order) : 0;
            const paragraphBlockIndex = Number.isFinite(note.paragraph_block_index) ? Number(note.paragraph_block_index) : 0;
            const startOffset = Number.isFinite(note.start_offset) ? Number(note.start_offset) : 0;
            const endOffset = Number.isFinite(note.end_offset) ? Number(note.end_offset) : startOffset;
            const markType = typeof note.mark_type === "string" ? note.mark_type : "highlight";
            const selectedText = typeof note.selected_text === "string" ? note.selected_text : "";
            if (!allowedMarkTypes.has(markType) || endOffset <= startOffset || !selectedText.trim()) {
                continue;
            }

            const createdAt = Number.isFinite(note.created_at) ? Number(note.created_at) : Date.now();
            const updatedAt = Number.isFinite(note.updated_at) ? Number(note.updated_at) : createdAt;
            const dedupeKey = [
                articleKey,
                paragraphOrder,
                markType,
                startOffset,
                endOffset,
                selectedText,
            ].join("|");

            restoredNotesByKey.set(dedupeKey, {
                ...note,
                article_key: articleKey,
                article_url: note.article_url || readItem.url,
                article_title: note.article_title || readItem.article_title || "",
                paragraph_order: paragraphOrder,
                paragraph_block_index: paragraphBlockIndex,
                selected_text: selectedText,
                mark_type: markType as ReadingNoteItem["mark_type"],
                start_offset: startOffset,
                end_offset: endOffset,
                created_at: createdAt,
                updated_at: updatedAt,
            });
        }

        const grammarRows = Array.isArray(readItem.grammar_payload)
            ? readItem.grammar_payload
            : [];
        for (const entry of grammarRows) {
            if (!entry || typeof entry !== "object" || typeof entry.key !== "string") continue;
            const cacheKey = entry.key.trim();
            if (!cacheKey) continue;
            restoredGrammarCacheByKey.set(cacheKey, {
                key: cacheKey,
                type: "grammar",
                data: entry.data,
                timestamp: Number.isFinite(entry.timestamp) ? Number(entry.timestamp) : Date.now(),
            });
        }

        const askRows = Array.isArray(readItem.ask_payload)
            ? readItem.ask_payload
            : [];
        for (const entry of askRows) {
            if (!entry || typeof entry !== "object" || typeof entry.key !== "string") continue;
            const cacheKey = entry.key.trim();
            if (!cacheKey) continue;
            restoredAskCacheByKey.set(cacheKey, {
                key: cacheKey,
                type: "ask_ai",
                data: entry.data,
                timestamp: Number.isFinite(entry.timestamp) ? Number(entry.timestamp) : Date.now(),
            });
        }
    }

    await db.transaction(
        "rw",
        [db.user_profile, db.vocabulary, db.writing_history, db.read_articles, db.articles, db.reading_notes, db.ai_cache, db.elo_history, db.daily_plans, db.error_ledger, db.rag_vectors],
        async () => {
            await db.user_profile.clear();
            await db.vocabulary.clear();
            await db.writing_history.clear();
            await db.read_articles.clear();
            await db.reading_notes.clear();
            await db.elo_history.clear();
            await db.daily_plans.clear();
            await db.error_ledger.clear();
            await db.rag_vectors.where("source").equals("error_ledger").delete();

            await db.user_profile.add(effectiveLocalProfile);
            if (effectiveDailyPlans.length) await db.daily_plans.bulkPut(effectiveDailyPlans);
            if (localVocabulary.length) await db.vocabulary.bulkPut(localVocabulary);
            if (localWriting.length) await db.writing_history.bulkAdd(localWriting);
            if (localRead.length) await db.read_articles.bulkPut(localRead);
            if (localElo.length) await db.elo_history.bulkAdd(localElo);
            if (localErrorLedger.length) await db.error_ledger.bulkAdd(localErrorLedger);
            if (restoredArticlesByUrl.size > 0) {
                await db.articles.bulkPut(Array.from(restoredArticlesByUrl.values()));
            }
            if (restoredNotesByKey.size > 0) {
                await db.reading_notes.bulkAdd(Array.from(restoredNotesByKey.values()));
            }
            for (const cacheEntry of restoredGrammarCacheByKey.values()) {
                const existing = await db.ai_cache.where("[key+type]").equals([cacheEntry.key, cacheEntry.type]).first();
                await db.ai_cache.put({
                    ...cacheEntry,
                    id: existing?.id,
                });
            }
            for (const cacheEntry of restoredAskCacheByKey.values()) {
                const existing = await db.ai_cache.where("[key+type]").equals([cacheEntry.key, cacheEntry.type]).first();
                await db.ai_cache.put({
                    ...cacheEntry,
                    id: existing?.id,
                });
            }
        },
    );

}

async function migrateLegacyData(userId: string) {
    const supabase = createBrowserClientSingleton();
    await ensureRemoteProfile(userId);

    const [profile, vocabulary, writingHistory, readArticles, eloHistory, errorLedger] = await Promise.all([
        db.user_profile.orderBy("id").first(),
        db.vocabulary.toArray(),
        db.writing_history.toArray(),
        db.read_articles.toArray(),
        db.elo_history.toArray(),
        db.error_ledger.toArray(),
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
            ai_provider: profile.ai_provider,
            deepseek_api_key: profile.deepseek_api_key,
            deepseek_model: profile.deepseek_model,
            deepseek_thinking_mode: profile.deepseek_thinking_mode,
            deepseek_reasoning_effort: profile.deepseek_reasoning_effort,
            glm_api_key: profile.glm_api_key,
            nvidia_api_key: profile.nvidia_api_key,
            nvidia_model: profile.nvidia_model,
            github_api_key: profile.github_api_key,
            github_model: profile.github_model,
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

    for (const item of errorLedger) {
        const remoteId = item.remote_id || crypto.randomUUID();
        if (item.id) {
            await db.error_ledger.update(item.id, {
                ...item,
                remote_id: remoteId,
                user_id: userId,
                updated_at: item.updated_at || nowIso(),
                sync_status: "pending",
            });
        }
        const errorLedgerResult = await supabase
            .from("error_ledger")
            .upsert(toRemoteErrorLedgerRow(userId, {
                ...item,
                remote_id: remoteId,
                user_id: userId,
                updated_at: item.updated_at || nowIso(),
                sync_status: "pending",
            }));
        assertSupabaseMutationSucceeded(errorLedgerResult, "error_ledger migration");
    }

    await db.sync_meta.put({
        key: `migration:${userId}`,
        value: true,
        updated_at: Date.now(),
    });
}

async function enqueueLegacyDictationEloForSync(userId: string) {
    const backfillMetaKey = `dictation_elo_backfill:${userId}`;
    const backfillMeta = await db.sync_meta.get(backfillMetaKey);
    if (backfillMeta?.value) {
        return;
    }

    const legacyItems = await db.elo_history.where("mode").equals("dictation").toArray();
    for (const item of legacyItems) {
        const remoteId = item.remote_id || crypto.randomUUID();
        const updatedAt = item.updated_at || nowIso();

        if (item.id) {
            await db.elo_history.update(item.id, {
                remote_id: remoteId,
                user_id: userId,
                updated_at: updatedAt,
                sync_status: "pending",
            });
        }

        await queueOutboxItem({
            entity: "elo_history",
            operation: "upsert",
            recordKey: remoteId,
            payload: toRemoteEloHistoryRow(userId, {
                ...item,
                remote_id: remoteId,
                user_id: userId,
                updated_at: updatedAt,
                sync_status: "pending",
            }),
        });
    }

    await db.sync_meta.put({
        key: backfillMetaKey,
        value: true,
        updated_at: Date.now(),
    });
}

async function enqueueVocabularyFsrsResetForSync(userId: string) {
    const resetMeta = await db.sync_meta.get("migration:vocabulary_fsrs_reset");
    if (!resetMeta?.value) {
        return;
    }

    const appliedMetaKey = `migration:vocabulary_fsrs_reset:${userId}`;
    const appliedMeta = await db.sync_meta.get(appliedMetaKey);
    if (appliedMeta?.value === resetMeta.value) {
        return;
    }

    const vocabulary = await db.vocabulary.toArray();
    for (const item of vocabulary) {
        const remoteId = item.remote_id || crypto.randomUUID();
        const updatedAt = nowIso();
        const nextItem = {
            ...item,
            remote_id: remoteId,
            user_id: userId,
            updated_at: updatedAt,
            sync_status: "pending" as const,
        };

        await db.vocabulary.update(item.word, {
            remote_id: remoteId,
            user_id: userId,
            updated_at: updatedAt,
            sync_status: "pending",
        });
        await queueOutboxItem({
            entity: "vocabulary",
            operation: "upsert",
            recordKey: nextItem.word_key || normalizeWordKey(nextItem.word),
            payload: toRemoteVocabularyRow(userId, nextItem),
        });
    }

    await db.sync_meta.put({
        key: appliedMetaKey,
        value: resetMeta.value,
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
                const result = item.operation === "delete"
                    ? await supabase
                        .from("read_articles")
                        .delete()
                        .eq("user_id", userId)
                        .eq("url", item.record_key)
                    : await supabase
                        .from("read_articles")
                        .upsert(item.payload, { onConflict: "user_id,url" });
                const { error } = result;
                if (error) throw error;
            }

            if (item.entity === "elo_history") {
                const { error } = await supabase
                    .from("elo_history")
                    .upsert(item.payload);
                if (error) throw error;
            }

            if (item.entity === "error_ledger") {
                const { error } = await supabase
                    .from("error_ledger")
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

    const remoteProfile = await ensureRemoteProfile(userId);

    const migrationMeta = await db.sync_meta.get(`migration:${userId}`);
    if (!migrationMeta?.value && await hasLegacyLocalData()) {
        await migrateLegacyData(userId);
    }
    await enqueueLegacyDictationEloForSync(userId);
    await enqueueVocabularyFsrsResetForSync(userId);
    await pushLocalNewerRecords(userId, remoteProfile);
    await syncDailyPlanMirror(userId);
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
        void scheduleBackgroundSync({ pullSnapshot: true, forcePull: true });
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

export async function updateVocabularyEntry(previousWord: string, item: VocabItem) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error("Missing active user.");

    const previousWordKey = normalizeWordKey(previousWord);
    const nextWordKey = normalizeWordKey(item.word);
    const wordChanged = previousWord !== item.word;
    const wordKeyChanged = previousWordKey !== nextWordKey;
    const duplicate = wordKeyChanged
        ? await db.vocabulary.where("word_key").equals(nextWordKey).first()
        : null;

    if (duplicate && duplicate.word !== previousWord) {
        throw new Error("DUPLICATE_VOCAB_WORD");
    }

    const nextItem = createLocalVocabularyItem(userId, {
        ...item,
        remote_id: item.remote_id || crypto.randomUUID(),
    });

    await db.transaction("rw", db.vocabulary, db.sync_outbox, async () => {
        if (wordChanged) {
            await db.vocabulary.delete(previousWord);
        }

        if (wordKeyChanged) {
            await queueOutboxItem({
                entity: "vocabulary",
                operation: "delete",
                recordKey: previousWordKey,
                payload: { user_id: userId, word_key: previousWordKey },
            });
        }

        await db.vocabulary.put(nextItem);
        await queueOutboxItem({
            entity: "vocabulary",
            operation: "upsert",
            recordKey: nextItem.word_key || nextWordKey,
            payload: toRemoteVocabularyRow(userId, nextItem),
        });
    });

    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
    return nextItem;
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

export async function saveErrorLedgerEntry(
    entry: {
        text: string;
        tag?: string;
        created_at?: number;
    },
    options: {
        scheduleSync?: () => unknown;
    } = {},
) {
    const text = entry.text.trim();
    if (!text) {
        throw new Error("Missing error ledger text.");
    }

    const userId = await getActiveUserId();
    const remoteId = crypto.randomUUID();
    const updatedAt = nowIso();
    const createdAt = entry.created_at ?? Date.now();
    const nextEntry = {
        remote_id: remoteId,
        user_id: userId || undefined,
        text,
        tag: entry.tag,
        created_at: createdAt,
        updated_at: updatedAt,
        sync_status: "pending" as const,
    };

    await db.error_ledger.put(nextEntry);

    if (userId) {
        await queueOutboxItem({
            entity: "error_ledger",
            operation: "upsert",
            recordKey: remoteId,
            payload: toRemoteErrorLedgerRow(userId, nextEntry),
        });
        useSyncStatusStore.getState().setPhase("syncing");
        void Promise.resolve((options.scheduleSync ?? scheduleBackgroundSync)());
    }

    return nextEntry;
}

export async function markArticleAsRead(url: string, metadata?: ReadArticleSnapshotMetadata) {
    const userId = await getActiveUserId();
    if (!userId) throw new Error("Missing active user.");

    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
        throw new Error("Missing article url.");
    }

    const normalizedMetadata = metadata
        ? {
            article_key: metadata.articleKey?.trim() || undefined,
            article_title: metadata.articleTitle?.trim() || undefined,
            article_payload: metadata.articlePayload,
            reading_notes_payload: metadata.readingNotesPayload,
            grammar_payload: metadata.grammarPayload,
            ask_payload: metadata.askPayload,
        }
        : null;

    const existing = await db.read_articles.get(normalizedUrl);
    if (existing) {
        if (!normalizedMetadata) return;

        const hasSnapshotChanges = (
            existing.article_key !== normalizedMetadata.article_key
            || existing.article_title !== normalizedMetadata.article_title
            || safeJson(existing.article_payload) !== safeJson(normalizedMetadata.article_payload)
            || safeJson(existing.reading_notes_payload) !== safeJson(normalizedMetadata.reading_notes_payload)
            || safeJson(existing.grammar_payload) !== safeJson(normalizedMetadata.grammar_payload)
            || safeJson(existing.ask_payload) !== safeJson(normalizedMetadata.ask_payload)
        );

        if (!hasSnapshotChanges) return;

        const updatedAt = nowIso();
        const remoteId = existing.remote_id || crypto.randomUUID();
        const nextItem: ReadArticleItem = {
            ...existing,
            remote_id: remoteId,
            user_id: userId,
            updated_at: updatedAt,
            sync_status: "pending",
            ...normalizedMetadata,
        };

        await db.read_articles.put(nextItem);
        await queueOutboxItem({
            entity: "read_articles",
            operation: "upsert",
            recordKey: normalizedUrl,
            payload: toRemoteReadArticle(userId, nextItem),
        });
        useSyncStatusStore.getState().setPhase("syncing");
        void scheduleBackgroundSync();
        return;
    }

    const nextItem: ReadArticleItem = {
        url: normalizedUrl,
        timestamp: Date.now(),
        read_at: Date.now(),
        remote_id: crypto.randomUUID(),
        user_id: userId,
        updated_at: nowIso(),
        sync_status: "pending",
        ...(normalizedMetadata || {}),
    };

    await db.read_articles.put(nextItem);
    await queueOutboxItem({
        entity: "read_articles",
        operation: "upsert",
        recordKey: normalizedUrl,
        payload: toRemoteReadArticle(userId, nextItem),
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function deleteReadArticleSnapshot(url: string) {
    const normalizedUrl = url.trim();
    if (!normalizedUrl) {
        throw new Error("Missing article url.");
    }

    const userId = await getActiveUserId();

    await db.transaction("rw", db.articles, db.read_articles, db.sync_outbox, async () => {
        await db.articles.delete(normalizedUrl);
        await db.read_articles.delete(normalizedUrl);
    });

    if (!userId) {
        return;
    }

    await queueOutboxItem({
        entity: "read_articles",
        operation: "delete",
        recordKey: normalizedUrl,
        payload: { user_id: userId, url: normalizedUrl },
    });
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function saveProfilePatch(
    patch: Partial<
        Pick<
            LocalUserProfile,
            "coins" | "inventory" | "owned_themes" | "active_theme" | "username" | "avatar_preset" | "bio" | "learning_preferences"
            | "ai_provider" | "deepseek_api_key" | "deepseek_model" | "deepseek_thinking_mode" | "deepseek_reasoning_effort" | "glm_api_key" | "glm_model" | "glm_thinking_mode" | "nvidia_api_key" | "nvidia_model" | "github_api_key" | "github_model" | "reading_coins" | "reading_streak" | "reading_last_daily_grant_at"
            | "cat_score" | "cat_level" | "cat_theta" | "cat_points" | "cat_current_band" | "cat_updated_at"
            | "cat_se" | "dictation_elo" | "dictation_streak" | "dictation_max_elo"
            | "rebuild_hidden_elo" | "rebuild_elo" | "rebuild_streak" | "rebuild_max_elo"
            | "exam_date" | "exam_type" | "exam_goal_score" | "daily_plan_snapshots"
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
        glm_model: patch.glm_model !== undefined ? normalizeProfileGlmModel(patch.glm_model) : profile.glm_model,
        glm_thinking_mode: patch.glm_thinking_mode !== undefined ? normalizeProfileGlmThinkingMode(patch.glm_thinking_mode) : profile.glm_thinking_mode,
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
    if (typeof document !== "undefined") {
        const nextAiProvider = String(nextPatch.ai_provider ?? profile.ai_provider ?? "deepseek");
        const nextDeepSeekModel = String(nextPatch.deepseek_model ?? profile.deepseek_model ?? "deepseek-v4-flash");
        const nextDeepSeekThinkingMode = String(nextPatch.deepseek_thinking_mode ?? profile.deepseek_thinking_mode ?? "off");
        const nextDeepSeekReasoningEffort = String(nextPatch.deepseek_reasoning_effort ?? profile.deepseek_reasoning_effort ?? "high");
        const nextGlmModel = String(patch.glm_model !== undefined ? normalizeProfileGlmModel(patch.glm_model) : (profile.glm_model ?? "glm-5.1"));
        const nextGlmThinkingMode = String(patch.glm_thinking_mode !== undefined ? normalizeProfileGlmThinkingMode(patch.glm_thinking_mode) : (profile.glm_thinking_mode ?? "off"));
        const nextNvidiaModel = String(nextPatch.nvidia_model ?? profile.nvidia_model ?? "z-ai/glm5");
        const nextGithubModel = String(nextPatch.github_model ?? profile.github_model ?? "openai/gpt-4.1");
        document.cookie = `yasi_ai_provider=${encodeURIComponent(nextAiProvider)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_deepseek_model=${encodeURIComponent(nextDeepSeekModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_deepseek_thinking_mode=${encodeURIComponent(nextDeepSeekThinkingMode)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_deepseek_reasoning_effort=${encodeURIComponent(nextDeepSeekReasoningEffort)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_glm_model=${encodeURIComponent(nextGlmModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_glm_thinking_mode=${encodeURIComponent(nextGlmThinkingMode)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_nvidia_model=${encodeURIComponent(nextNvidiaModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_github_model=${encodeURIComponent(nextGithubModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
    useSyncStatusStore.getState().setPhase("syncing");
    void scheduleBackgroundSync();
}

export async function applyServerProfilePatchToLocal(
    patch: Partial<
        Pick<
            LocalUserProfile,
            "coins" | "inventory" | "owned_themes" | "active_theme" | "username" | "avatar_preset" | "bio" | "learning_preferences"
            | "ai_provider" | "deepseek_api_key" | "deepseek_model" | "deepseek_thinking_mode" | "deepseek_reasoning_effort" | "glm_api_key" | "glm_model" | "glm_thinking_mode" | "nvidia_api_key" | "nvidia_model" | "github_api_key" | "github_model" | "reading_coins" | "reading_streak" | "reading_last_daily_grant_at"
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
        glm_model: patch.glm_model !== undefined ? normalizeProfileGlmModel(patch.glm_model) : profile.glm_model,
        glm_thinking_mode: patch.glm_thinking_mode !== undefined ? normalizeProfileGlmThinkingMode(patch.glm_thinking_mode) : profile.glm_thinking_mode,
        hints: patch.inventory?.capsule ?? profile.hints,
        last_practice: Number.isFinite(nextLastPractice) ? nextLastPractice : profile.last_practice,
        updated_at: nowIso(),
        sync_status: "synced",
    });
    if (typeof document !== "undefined") {
        const nextAiProvider = String(normalized.ai_provider ?? profile.ai_provider ?? "deepseek");
        const nextDeepSeekModel = String(normalized.deepseek_model ?? profile.deepseek_model ?? "deepseek-v4-flash");
        const nextDeepSeekThinkingMode = String(normalized.deepseek_thinking_mode ?? profile.deepseek_thinking_mode ?? "off");
        const nextDeepSeekReasoningEffort = String(normalized.deepseek_reasoning_effort ?? profile.deepseek_reasoning_effort ?? "high");
        const nextGlmModel = String(patch.glm_model !== undefined ? normalizeProfileGlmModel(patch.glm_model) : (profile.glm_model ?? "glm-5.1"));
        const nextGlmThinkingMode = String(patch.glm_thinking_mode !== undefined ? normalizeProfileGlmThinkingMode(patch.glm_thinking_mode) : (profile.glm_thinking_mode ?? "off"));
        const nextNvidiaModel = String(normalized.nvidia_model ?? profile.nvidia_model ?? "z-ai/glm5");
        const nextGithubModel = String(normalized.github_model ?? profile.github_model ?? "openai/gpt-4.1");
        document.cookie = `yasi_ai_provider=${encodeURIComponent(nextAiProvider)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_deepseek_model=${encodeURIComponent(nextDeepSeekModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_deepseek_thinking_mode=${encodeURIComponent(nextDeepSeekThinkingMode)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_deepseek_reasoning_effort=${encodeURIComponent(nextDeepSeekReasoningEffort)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_glm_model=${encodeURIComponent(nextGlmModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_glm_thinking_mode=${encodeURIComponent(nextGlmThinkingMode)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_nvidia_model=${encodeURIComponent(nextNvidiaModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
        document.cookie = `yasi_github_model=${encodeURIComponent(nextGithubModel)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
}

export async function settleBattle(payload: {
    mode: "translation" | "listening" | "rebuild" | "dictation";
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
    const isTranslation = payload.mode === "translation";
    const isListening = payload.mode === "listening";
    const isRebuild = payload.mode === "rebuild";
    const isDictation = payload.mode === "dictation";

    const localProfile: LocalUserProfile = {
        ...profile,
        user_id: userId,
        remote_id: userId,
        elo_rating: isTranslation ? payload.eloAfter : profile.elo_rating,
        streak_count: isTranslation ? payload.streak : profile.streak_count,
        max_elo: isTranslation ? payload.maxElo : profile.max_elo,
        listening_scoring_version: LISTENING_SCORING_VERSION,
        listening_elo: isListening ? payload.eloAfter : (profile.listening_elo ?? DEFAULT_BASE_ELO),
        listening_streak: isListening ? payload.streak : (profile.listening_streak ?? 0),
        listening_max_elo: isListening ? payload.maxElo : (profile.listening_max_elo ?? DEFAULT_BASE_ELO),
        rebuild_elo: isRebuild ? payload.eloAfter : (profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO),
        rebuild_streak: isRebuild ? payload.streak : (profile.rebuild_streak ?? 0),
        rebuild_max_elo: isRebuild
            ? payload.maxElo
            : (profile.rebuild_max_elo ?? profile.rebuild_elo ?? profile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO),
        dictation_elo: isDictation ? payload.eloAfter : (profile.dictation_elo ?? profile.listening_elo ?? DEFAULT_BASE_ELO),
        dictation_streak: isDictation ? payload.streak : (profile.dictation_streak ?? 0),
        dictation_max_elo: isDictation
            ? payload.maxElo
            : (profile.dictation_max_elo ?? profile.dictation_elo ?? profile.listening_max_elo ?? DEFAULT_BASE_ELO),
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
            dictation_elo: localProfile.dictation_elo ?? localProfile.listening_elo ?? DEFAULT_BASE_ELO,
            dictation_streak: localProfile.dictation_streak ?? 0,
            max_translation_elo: localProfile.max_elo,
            max_listening_elo: localProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
            rebuild_max_elo: localProfile.rebuild_max_elo ?? localProfile.rebuild_elo ?? localProfile.rebuild_hidden_elo ?? DEFAULT_BASE_ELO,
            dictation_max_elo: localProfile.dictation_max_elo ?? localProfile.dictation_elo ?? localProfile.listening_max_elo ?? DEFAULT_BASE_ELO,
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
