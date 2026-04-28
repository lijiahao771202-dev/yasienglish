import type { User } from "@supabase/supabase-js";

import { createServerClient } from "./server";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

export function getRequestBearerToken(request: Request) {
    const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    return token || null;
}

export async function resolveRequestUser(request: Request, supabase: ServerSupabaseClient): Promise<User | null> {
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (user) {
        return user;
    }

    const bearerToken = getRequestBearerToken(request);
    if (!bearerToken) {
        return null;
    }

    const {
        data: { user: bearerUser },
    } = await supabase.auth.getUser(bearerToken);

    return bearerUser ?? null;
}
