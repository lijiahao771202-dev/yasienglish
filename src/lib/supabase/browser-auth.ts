"use client";

import { createBrowserClientSingleton } from "./browser";

export async function getBrowserSupabaseAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createBrowserClientSingleton();
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
        return {};
    }

    return {
        Authorization: `Bearer ${data.session.access_token}`,
    };
}
