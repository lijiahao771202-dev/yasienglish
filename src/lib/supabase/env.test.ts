import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

describe("supabase env helpers", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("reads next public supabase variables when present", () => {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_123");

        expect(getSupabaseUrl()).toBe("https://example.supabase.co");
        expect(getSupabasePublishableKey()).toBe("sb_publishable_123");
    });

    it("falls back to server-side supabase variables when public ones are missing", () => {
        vi.stubEnv("SUPABASE_URL", "https://fallback.supabase.co");
        vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fallback");

        expect(getSupabaseUrl()).toBe("https://fallback.supabase.co");
        expect(getSupabasePublishableKey()).toBe("sb_publishable_fallback");
    });

    it("falls back to anon key for compatibility", () => {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");

        expect(getSupabasePublishableKey()).toBe("anon-key");
    });
});
