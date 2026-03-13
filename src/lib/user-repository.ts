"use client";

import { createBrowserClientSingleton } from "@/lib/supabase/browser";
import { useSyncStatusStore } from "@/lib/sync-status";
import {
    db,
    type EloHistoryItem,
    type LocalUserProfile,
    type ReadArticleItem,
    type VocabItem,
    type WritingEntry,
} from "@/lib/db";
import {
    buildProfilePatch,
    createDefaultLocalProfile,
    createLocalVocabularyItem,
    normalizeInventory,
    normalizeWordKey,
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
    type RemoteEloHistoryRow,
    type RemoteProfileRow,
    type RemoteReadArticleRow,
    type RemoteVocabularyRow,
    type RemoteWritingHistoryRow,
} from "@/lib/user-sync";

type SyncEntity = "profile" | "vocabulary" | "writing_history" | "read_articles";

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

function nowIso() {
    return new Date().toISOString();
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
    const nextProfile = localProfile
        ? {
            user_id: userId,
            translation_elo: localProfile.elo_rating,
            listening_elo: localProfile.listening_elo ?? 600,
            streak_count: localProfile.streak_count,
            listening_streak: localProfile.listening_streak ?? 0,
            max_translation_elo: localProfile.max_elo,
            max_listening_elo: localProfile.listening_max_elo ?? 600,
            coins: localProfile.coins ?? 0,
            inventory: normalizeInventory(localProfile.inventory, localProfile.hints),
            owned_themes: localProfile.owned_themes ?? ["morning_coffee"],
            active_theme: localProfile.active_theme ?? "morning_coffee",
            last_practice_at: new Date(localProfile.last_practice).toISOString(),
            updated_at: localProfile.updated_at || nowIso(),
        }
        : {
            user_id: userId,
            translation_elo: 600,
            listening_elo: 600,
            streak_count: 0,
            listening_streak: 0,
            max_translation_elo: 600,
            max_listening_elo: 600,
            coins: 0,
            inventory: normalizeInventory(),
            owned_themes: ["morning_coffee"],
            active_theme: "morning_coffee",
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

    const next = {
        entity,
        operation,
        payload,
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

    const localProfile = toLocalProfile(profileRes.data as RemoteProfileRow);
    const localVocabulary = (vocabRes.data as RemoteVocabularyRow[]).map(toLocalVocabularyItem);
    const localWriting = (writingRes.data as RemoteWritingHistoryRow[]).map(toLocalWritingEntry);
    const localRead = (readRes.data as RemoteReadArticleRow[]).map(toLocalReadArticle);
    const localElo = (eloRes.data as RemoteEloHistoryRow[]).map(toLocalEloHistoryItem);

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

    await db.sync_meta.put({
        key: `migration:${userId}`,
        value: true,
        updated_at: Date.now(),
    });
}

export async function flushOutbox() {
    requireOnline();
    const userId = await getActiveUserId();
    if (!userId) return;

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

            if (item.id) {
                await db.sync_outbox.delete(item.id);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown sync error";
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

    setPhase("synced");
}

export async function bootstrapUserSession(userId: string) {
    requireOnline();
    const syncStore = useSyncStatusStore.getState();
    syncStore.setPhase("bootstrapping");
    syncStore.setReady(false);

    const activeUserId = await getActiveUserId();
    if (activeUserId && activeUserId !== userId) {
        await clearCoreTables();
    }

    await setActiveUserId(userId);
    await ensureRemoteProfile(userId);

    const migrationMeta = await db.sync_meta.get(`migration:${userId}`);
    if (!migrationMeta?.value && await hasLegacyLocalData()) {
        await migrateLegacyData(userId);
    }

    await flushOutbox();
    await pullRemoteSnapshot(userId);

    await db.sync_meta.put({
        key: "last_bootstrap_at",
        value: Date.now(),
        updated_at: Date.now(),
    });

    syncStore.setPhase("synced");
    syncStore.setReady(true);
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

export async function loadLocalProfile() {
    return db.user_profile.orderBy("id").first();
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
    await flushOutbox();
    await db.vocabulary.update(nextItem.word, { sync_status: "synced" });
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
    await flushOutbox();
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
    await flushOutbox();
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
    await flushOutbox();
    await db.read_articles.update(url, { sync_status: "synced" });
}

export async function saveProfilePatch(patch: Partial<Pick<LocalUserProfile, "coins" | "inventory" | "owned_themes" | "active_theme">>) {
    const profile = await db.user_profile.orderBy("id").first();
    if (!profile?.id) throw new Error("Local profile not initialized.");

    const nextPatch = buildProfilePatch(patch);
    await db.user_profile.update(profile.id, {
        ...nextPatch,
        hints: patch.inventory?.capsule ?? profile.hints,
        updated_at: nowIso(),
        sync_status: "pending",
    });

    await queueOutboxItem({
        entity: "profile",
        operation: "upsert",
        recordKey: "profile",
        payload: nextPatch,
    });
    await flushOutbox();
    await db.user_profile.update(profile.id, { sync_status: "synced" });
}

export async function settleBattle(payload: {
    mode: "translation" | "listening";
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
    requireOnline();
    const profile = await db.user_profile.orderBy("id").first();
    if (!profile?.id) throw new Error("Local profile not initialized.");

    const response = await fetch("/api/profile/settle", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to settle battle.");
    }

    const { profile: remoteProfile } = await response.json() as { profile: RemoteProfileRow };
    const localProfile = toLocalProfile(remoteProfile);
    await db.user_profile.update(profile.id, {
        ...localProfile,
        id: profile.id,
    });

    const localHistory: EloHistoryItem = {
        remote_id: crypto.randomUUID(),
        user_id: localProfile.user_id,
        mode: payload.mode,
        elo: payload.eloAfter,
        change: payload.change,
        timestamp: Date.now(),
        source: payload.source || "battle",
        updated_at: nowIso(),
        sync_status: "synced",
    };

    await db.elo_history.add(localHistory);
    useSyncStatusStore.getState().setPhase("synced");
    return localProfile;
}
