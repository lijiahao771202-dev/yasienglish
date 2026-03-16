import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

function buildLoginRedirect(request: Request) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
    return buildLoginRedirect(request);
}

export async function POST(request: Request) {
    try {
        const supabase = await createServerClient();
        await supabase.auth.signOut();
    } catch {
        // Ignore sign-out transport failures and return to the auth shell.
    }
    return buildLoginRedirect(request);
}
