import { NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_PATHS = ["/", "/read", "/battle", "/dashboard", "/vocab"];
const PUBLIC_PATHS = ["/login", "/auth/callback"];

function isProtectedPath(pathname: string) {
    return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isPublicPath(pathname: string) {
    return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
    const { response, supabase } = await updateSession(request);
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (isProtectedPath(request.nextUrl.pathname) && !user) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = "/login";
        loginUrl.search = "";
        return NextResponse.redirect(loginUrl);
    }

    if (isPublicPath(request.nextUrl.pathname) && user) {
        const appUrl = request.nextUrl.clone();
        appUrl.pathname = "/read";
        appUrl.search = "";
        return NextResponse.redirect(appUrl);
    }

    return response;
}

export const config = {
    matcher: [
        "/",
        "/read/:path*",
        "/battle/:path*",
        "/dashboard/:path*",
        "/vocab/:path*",
        "/login",
        "/auth/callback",
        "/logout",
    ],
};
