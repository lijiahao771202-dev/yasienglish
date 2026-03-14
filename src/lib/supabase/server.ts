import type { User } from "@supabase/supabase-js";
import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

export async function createServerClient() {
    const cookieStore = await cookies();

    return createSupabaseServerClient(
        getSupabaseUrl(),
        getSupabasePublishableKey(),
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options);
                        });
                    } catch {
                        // Server Components may attempt to set cookies during render.
                    }
                },
            },
        },
    );
}

export async function getServerUserSafely(): Promise<{ user: User | null; error: Error | null }> {
    try {
        const supabase = await createServerClient();
        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        return {
            user,
            error: error ?? null,
        };
    } catch (error) {
        return {
            user: null,
            error: error instanceof Error ? error : new Error("Failed to read Supabase auth session."),
        };
    }
}
