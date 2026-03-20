"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

let browserClient: SupabaseClient | null = null;

export function createBrowserClientSingleton() {
    if (!browserClient) {
        browserClient = createBrowserClient(
            getSupabaseUrl(),
            getSupabasePublishableKey(),
        );
    }

    return browserClient;
}
