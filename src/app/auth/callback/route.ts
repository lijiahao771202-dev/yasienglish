import { NextResponse } from "next/server";

import { APP_HOME_PATH } from "@/lib/auth-routing";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const next = searchParams.get("next");
    const destination = next && next.startsWith("/") ? next : APP_HOME_PATH;

    if (tokenHash && type) {
        const supabase = await createServerClient();
        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "recovery" | "email" | "signup" | "invite" | "magiclink" | "email_change",
        });

        if (error) {
            return NextResponse.redirect(`${origin}/login?error=callback`);
        }

        return NextResponse.redirect(`${origin}${type === "recovery" ? "/reset-password" : destination}`);
    }

    if (!code) {
        return NextResponse.redirect(`${origin}/login`);
    }

    const supabase = await createServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
        return NextResponse.redirect(`${origin}/login?error=callback`);
    }

    return NextResponse.redirect(`${origin}${destination}`);
}
