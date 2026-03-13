export function getSupabaseUrl() {
    const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (publicUrl) return publicUrl;

    if (typeof window === "undefined") {
        const serverUrl = process.env.SUPABASE_URL;
        if (serverUrl) return serverUrl;
    }

    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
}

export function getSupabasePublishableKey() {
    const publicPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (publicPublishableKey) return publicPublishableKey;

    const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (publicAnonKey) return publicAnonKey;

    if (typeof window === "undefined") {
        const serverPublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (serverPublishableKey) return serverPublishableKey;

        const serverAnonKey = process.env.SUPABASE_ANON_KEY;
        if (serverAnonKey) return serverAnonKey;
    }

    throw new Error(
        "Missing required environment variable: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
}
