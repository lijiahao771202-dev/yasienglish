"use client";

import { db } from "@/lib/db";
import type { ListeningCabinSession } from "@/lib/listening-cabin";
import { createBrowserClientSingleton } from "@/lib/supabase/browser";

type RemoteListeningCabinSessionRow = {
    id: string;
    user_id: string;
    title: string;
    source_prompt: string;
    script_mode: string;
    session_payload: ListeningCabinSession;
    created_at: string;
    updated_at: string;
    last_played_at: string | null;
};

const pendingCloudUpdateTimers = new Map<string, number>();

function parseIsoMs(value: string | null | undefined, fallbackMs: number) {
    if (!value) return fallbackMs;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : fallbackMs;
}

async function getCurrentUserId() {
    if (typeof window === "undefined") {
        return null;
    }

    const supabase = createBrowserClientSingleton();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
        return null;
    }
    return data.user?.id ?? null;
}

function toRemoteListeningCabinSessionRow(userId: string, session: ListeningCabinSession): Omit<RemoteListeningCabinSessionRow, "created_at" | "updated_at"> {
    return {
        id: session.id,
        user_id: userId,
        title: session.title,
        source_prompt: session.sourcePrompt,
        script_mode: session.scriptMode,
        session_payload: session,
        last_played_at: session.lastPlayedAt ? new Date(session.lastPlayedAt).toISOString() : null,
    };
}

async function upsertListeningCabinSessionToCloud(session: ListeningCabinSession) {
    const userId = await getCurrentUserId();
    if (!userId) {
        return;
    }

    const supabase = createBrowserClientSingleton();
    const payload = toRemoteListeningCabinSessionRow(userId, session);
    const { error } = await supabase
        .from("listening_cabin_sessions")
        .upsert(payload, { onConflict: "user_id,id" });

    if (error) {
        throw error;
    }
}

function scheduleListeningCabinCloudUpsert(sessionId: string) {
    const existingTimer = pendingCloudUpdateTimers.get(sessionId);
    if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
        pendingCloudUpdateTimers.delete(sessionId);

        void (async () => {
            try {
                const nextSession = await db.listening_cabin_sessions.get(sessionId);
                if (!nextSession) return;
                await upsertListeningCabinSessionToCloud(nextSession);
            } catch (error) {
                console.warn("Listening cabin cloud update skipped:", error);
            }
        })();
    }, 650);

    pendingCloudUpdateTimers.set(sessionId, timer);
}

export async function saveListeningCabinSession(session: ListeningCabinSession) {
    await db.listening_cabin_sessions.put(session);
    try {
        await upsertListeningCabinSessionToCloud(session);
    } catch (error) {
        console.warn("Listening cabin cloud save skipped:", error);
    }
    return session;
}

export async function updateListeningCabinSession(
    sessionId: string,
    patch: Partial<ListeningCabinSession>,
) {
    await db.listening_cabin_sessions.update(sessionId, {
        ...patch,
        updated_at: Date.now(),
    });

    if (typeof window !== "undefined") {
        scheduleListeningCabinCloudUpsert(sessionId);
    }
}

export async function toggleListeningCabinSentenceMastery(sessionId: string, sentenceIndex: number, isMastered: boolean) {
    await db.transaction("rw", db.listening_cabin_sessions, async () => {
        const session = await db.listening_cabin_sessions.get(sessionId);
        if (!session || !session.sentences[sentenceIndex]) return;
        
        session.sentences[sentenceIndex].isMastered = isMastered;
        session.updated_at = Date.now();
        await db.listening_cabin_sessions.put(session);
    });

    if (typeof window !== "undefined") {
        scheduleListeningCabinCloudUpsert(sessionId);
    }
}

export async function updateListeningCabinSentenceNote(sessionId: string, sentenceIndex: number, note: string) {
    await db.transaction("rw", db.listening_cabin_sessions, async () => {
        const session = await db.listening_cabin_sessions.get(sessionId);
        if (!session || !session.sentences[sentenceIndex]) return;
        
        session.sentences[sentenceIndex].note = note;
        session.updated_at = Date.now();
        await db.listening_cabin_sessions.put(session);
    });

    if (typeof window !== "undefined") {
        scheduleListeningCabinCloudUpsert(sessionId);
    }
}

export async function deleteListeningCabinSession(sessionId: string) {
    await db.listening_cabin_sessions.delete(sessionId);
    const existingTimer = pendingCloudUpdateTimers.get(sessionId);
    if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
        pendingCloudUpdateTimers.delete(sessionId);
    }

    const userId = await getCurrentUserId();
    if (!userId) {
        return;
    }

    try {
        const supabase = createBrowserClientSingleton();
        const { error } = await supabase
            .from("listening_cabin_sessions")
            .delete()
            .eq("user_id", userId)
            .eq("id", sessionId);
        if (error) {
            throw error;
        }
    } catch (error) {
        console.warn("Listening cabin cloud delete skipped:", error);
    }
}

export async function getListeningCabinSession(sessionId: string) {
    return db.listening_cabin_sessions.get(sessionId);
}

export async function pullListeningCabinSessionsFromCloud() {
    const userId = await getCurrentUserId();
    if (!userId) {
        return 0;
    }

    const supabase = createBrowserClientSingleton();
    const { data: remoteMetaRows, error: remoteMetaError } = await supabase
        .from("listening_cabin_sessions")
        .select("id, updated_at")
        .eq("user_id", userId);

    if (remoteMetaError) {
        throw remoteMetaError;
    }

    const remoteUpdatedAtById = new Map<string, number>();
    for (const row of (remoteMetaRows ?? []) as Array<{ id: string; updated_at: string }>) {
        remoteUpdatedAtById.set(row.id, parseIsoMs(row.updated_at, 0));
    }

    const localSessions = await db.listening_cabin_sessions.toArray();
    for (const localSession of localSessions) {
        const remoteUpdatedMs = remoteUpdatedAtById.get(localSession.id) ?? 0;
        if (localSession.updated_at > remoteUpdatedMs) {
            await upsertListeningCabinSessionToCloud(localSession);
        }
    }

    const { data, error } = await supabase
        .from("listening_cabin_sessions")
        .select("id, user_id, title, source_prompt, script_mode, session_payload, created_at, updated_at, last_played_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

    if (error) {
        throw error;
    }

    const rows = (data ?? []) as RemoteListeningCabinSessionRow[];
    let mergedCount = 0;

    await db.transaction("rw", db.listening_cabin_sessions, async () => {
        for (const row of rows) {
            const payload = row.session_payload;
            if (!payload || typeof payload !== "object" || typeof payload.id !== "string") {
                continue;
            }

            const remoteUpdatedMs = parseIsoMs(row.updated_at, Date.now());
            const remoteCreatedMs = parseIsoMs(row.created_at, remoteUpdatedMs);
            const remoteLastPlayedMs = parseIsoMs(row.last_played_at, NaN);
            const remoteSession: ListeningCabinSession = {
                ...payload,
                id: row.id,
                title: row.title || payload.title,
                sourcePrompt: row.source_prompt || payload.sourcePrompt,
                scriptMode: (row.script_mode as ListeningCabinSession["scriptMode"]) || payload.scriptMode,
                created_at: Number.isFinite(payload.created_at) ? payload.created_at : remoteCreatedMs,
                updated_at: remoteUpdatedMs,
                lastPlayedAt: Number.isFinite(remoteLastPlayedMs)
                    ? remoteLastPlayedMs
                    : (typeof payload.lastPlayedAt === "number" ? payload.lastPlayedAt : null),
            };

            const localSession = await db.listening_cabin_sessions.get(row.id);
            if (!localSession || localSession.updated_at < remoteUpdatedMs) {
                await db.listening_cabin_sessions.put(remoteSession);
                mergedCount += 1;
            }
        }
    });

    return mergedCount;
}
