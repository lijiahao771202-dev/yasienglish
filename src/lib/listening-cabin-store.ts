import { db } from "@/lib/db";
import type { ListeningCabinSession } from "@/lib/listening-cabin";

export async function saveListeningCabinSession(session: ListeningCabinSession) {
    await db.listening_cabin_sessions.put(session);
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
}

export async function deleteListeningCabinSession(sessionId: string) {
    await db.listening_cabin_sessions.delete(sessionId);
}

export async function getListeningCabinSession(sessionId: string) {
    return db.listening_cabin_sessions.get(sessionId);
}
