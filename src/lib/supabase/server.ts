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
