import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const { origin } = new URL(request.url);
    try {
        const supabase = await createServerClient();
        await supabase.auth.signOut();
    } catch {
        // Ignore sign-out transport failures and return to the auth shell.
    }
    return NextResponse.redirect(`${origin}/login`);
}
