import { describe, expect, it } from "vitest";

import { getAuthPageErrorMessage } from "./auth-errors";

describe("getAuthPageErrorMessage", () => {
    it("maps supported auth error codes to user-facing messages", () => {
        expect(getAuthPageErrorMessage("network")).toContain("Supabase");
        expect(getAuthPageErrorMessage("callback")).toContain("认证回调");
    });

    it("returns null for unknown auth error codes", () => {
        expect(getAuthPageErrorMessage("nope")).toBeNull();
        expect(getAuthPageErrorMessage(undefined)).toBeNull();
    });
});
