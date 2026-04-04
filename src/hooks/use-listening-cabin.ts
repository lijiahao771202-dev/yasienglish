"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
    saveListeningCabinSession,
    deleteListeningCabinSession,
} from "@/lib/listening-cabin-store";
import {
    createListeningCabinSession,
    type ListeningCabinGenerationRequest,
    type ListeningCabinGenerationResponse,
} from "@/lib/listening-cabin";

export function useListeningCabin() {
    const sessions = useLiveQuery(
        () => db.listening_cabin_sessions.orderBy("updated_at").reverse().toArray(),
        []
    );

    const isLoading = sessions === undefined;

    const createSession = async (params: {
        response: ListeningCabinGenerationResponse;
        request: ListeningCabinGenerationRequest;
        showChineseSubtitle: boolean;
    }) => {
        const session = createListeningCabinSession(params);
        await saveListeningCabinSession(session);
        return session;
    };

    const handleDeleteSession = async (sessionId: string) => {
        await deleteListeningCabinSession(sessionId);
    };

    return {
        sessions: sessions || [],
        isLoading,
        createSession,
        deleteSession: handleDeleteSession,
    };
}
