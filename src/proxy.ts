import { NextRequest, NextResponse } from "next/server";

import { APP_HOME_PATH, isGuestOnlyAuthPath } from "@/lib/auth-routing";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
    try {
        const { response, supabase } = await updateSession(request);
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (isGuestOnlyAuthPath(request.nextUrl.pathname) && user) {
            const appUrl = request.nextUrl.clone();
            appUrl.pathname = APP_HOME_PATH;
            appUrl.search = "";
            return NextResponse.redirect(appUrl);
        }

        return response;
    } catch {
        return NextResponse.next();
    }
}

export const config = {
    matcher: [
        "/login",
        "/register",
        "/forgot-password",
    ],
};
