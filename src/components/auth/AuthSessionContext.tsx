"use client";

import { createContext, useContext } from "react";

export interface SessionUserSummary {
    id: string;
    email: string | null;
}

export const AuthSessionContext = createContext<SessionUserSummary | null>(null);

export function useAuthSessionUser() {
    return useContext(AuthSessionContext);
}
