import { describe, expect, it } from "vitest";

import {
    APP_HOME_PATH,
    isGuestOnlyAuthPath,
    isProtectedAppPath,
    isPublicAuthPath,
} from "./auth-routing";

describe("auth routing", () => {
    it("treats the full account system pages as public auth paths", () => {
        expect(isPublicAuthPath("/login")).toBe(true);
        expect(isPublicAuthPath("/register")).toBe(true);
        expect(isPublicAuthPath("/forgot-password")).toBe(true);
        expect(isPublicAuthPath("/reset-password")).toBe(true);
        expect(isPublicAuthPath("/auth/callback")).toBe(true);
    });

    it("keeps reset-password accessible even for authenticated recovery sessions", () => {
        expect(isGuestOnlyAuthPath("/login")).toBe(true);
        expect(isGuestOnlyAuthPath("/register")).toBe(true);
        expect(isGuestOnlyAuthPath("/forgot-password")).toBe(true);
        expect(isGuestOnlyAuthPath("/reset-password")).toBe(false);
    });

    it("protects the new home shell and profile pages", () => {
        expect(APP_HOME_PATH).toBe("/");
        expect(isProtectedAppPath("/")).toBe(true);
        expect(isProtectedAppPath("/profile")).toBe(true);
        expect(isProtectedAppPath("/read")).toBe(true);
        expect(isProtectedAppPath("/login")).toBe(false);
    });
});
