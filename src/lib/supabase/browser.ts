"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createBrowserClientSingleton() {
    if (!browserClient) {
        browserClient = createBrowserClient(
            getSupabaseUrl(),
            getSupabasePublishableKey(),
        );
    }

    return browserClient;
}
