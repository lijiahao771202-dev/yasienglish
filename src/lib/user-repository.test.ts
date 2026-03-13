import { describe, expect, it } from "vitest";

import { assertSupabaseMutationSucceeded } from "./user-repository";

describe("assertSupabaseMutationSucceeded", () => {
    it("throws when Supabase returns an application error", () => {
        expect(() => {
            assertSupabaseMutationSucceeded(
                { error: { message: "row level security blocked write" } },
                "writing_history migration",
            );
        }).toThrow("writing_history migration: row level security blocked write");
    });

    it("does nothing when the mutation succeeded", () => {
        expect(() => {
            assertSupabaseMutationSucceeded({ error: null }, "writing_history migration");
        }).not.toThrow();
    });
});
