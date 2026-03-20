import { createClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase/env";

export function createAdminClient() {
    return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}
