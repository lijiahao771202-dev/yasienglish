"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

let browserClient: SupabaseClient | null = null;

function getStorageKey() {
    try {
        const projectRef = new URL(getSupabaseUrl()).hostname.split(".")[0] || "default";
        return `yasi-auth-${projectRef}`;
    } catch {
        return "yasi-auth";
    }
}

function getBrowserStorage() {
    if (typeof window === "undefined") {
        return undefined;
    }

    return {
        getItem: (key: string) => window.localStorage.getItem(key),
        setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
        removeItem: (key: string) => window.localStorage.removeItem(key),
    };
}

export function createBrowserClientSingleton() {
    if (!browserClient) {
        browserClient = createClient(
            getSupabaseUrl(),
            getSupabasePublishableKey(),
            {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    storageKey: getStorageKey(),
                    storage: getBrowserStorage(),
                },
            },
        );
    }

    return browserClient;
}
