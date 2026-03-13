import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
    const { origin } = new URL(request.url);
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login`);
}
