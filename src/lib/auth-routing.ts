export const APP_HOME_PATH = "/";

const PUBLIC_AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"];
const GUEST_ONLY_AUTH_PATHS = ["/login", "/register", "/forgot-password"];
const PROTECTED_APP_PATHS = ["/", "/read", "/battle", "/dashboard", "/vocab", "/profile"];

function matchesPath(pathname: string, paths: string[]) {
    return paths.some((path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)));
}

export function isPublicAuthPath(pathname: string) {
    return matchesPath(pathname, PUBLIC_AUTH_PATHS);
}

export function isGuestOnlyAuthPath(pathname: string) {
    return matchesPath(pathname, GUEST_ONLY_AUTH_PATHS);
}

export function isProtectedAppPath(pathname: string) {
    return pathname === "/" || matchesPath(pathname, PROTECTED_APP_PATHS.filter((path) => path !== "/"));
}
