import { beforeEach, describe, expect, it, vi } from "vitest";

function createSupabaseMock(responses: Record<string, { data: unknown; error: unknown }>) {
    const from = vi.fn((table: string) => {
        const response = responses[table] ?? { data: null, error: null };
        const builder = {
            select: vi.fn(() => builder),
            eq: vi.fn(() => builder),
            order: vi.fn(() => builder),
            limit: vi.fn(() => builder),
            maybeSingle: vi.fn(async () => response),
            single: vi.fn(async () => response),
            in: vi.fn(async () => response),
            delete: vi.fn(() => builder),
            upsert: vi.fn(async () => response),
            then: (onFulfilled: (value: typeof response) => unknown, onRejected?: (reason: unknown) => unknown) =>
                Promise.resolve(response).then(onFulfilled, onRejected),
        };
        return builder;
    });

    return {
        from,
        auth: {
            getSession: vi.fn(async () => ({
                data: { session: { user: { id: "user-1" } } },
                error: null,
            })),
            getUser: vi.fn(async () => ({
                data: { user: { user_metadata: {} } },
                error: null,
            })),
        },
    };
}

function createDbMock() {
    const userProfileFirst = vi.fn(async () => undefined);
    const syncOutboxToArray = vi.fn(async () => []);
    const aiCacheFirst = vi.fn(async () => undefined);

    return {
        db: {
            user_profile: {
                orderBy: vi.fn(() => ({ first: userProfileFirst })),
                clear: vi.fn(async () => undefined),
                add: vi.fn(async () => undefined),
                put: vi.fn(async () => undefined),
                update: vi.fn(async () => undefined),
            },
            vocabulary: {
                clear: vi.fn(async () => undefined),
                bulkPut: vi.fn(async () => undefined),
            },
            writing_history: {
                clear: vi.fn(async () => undefined),
                bulkAdd: vi.fn(async () => undefined),
            },
            read_articles: {
                clear: vi.fn(async () => undefined),
                bulkPut: vi.fn(async () => undefined),
                delete: vi.fn(async () => undefined),
            },
            articles: {
                bulkPut: vi.fn(async () => undefined),
                delete: vi.fn(async () => undefined),
            },
            reading_notes: {
                clear: vi.fn(async () => undefined),
                bulkAdd: vi.fn(async () => undefined),
            },
            ai_cache: {
                where: vi.fn(() => ({ equals: vi.fn(() => ({ first: aiCacheFirst })) })),
                put: vi.fn(async () => undefined),
            },
            elo_history: {
                clear: vi.fn(async () => undefined),
                bulkAdd: vi.fn(async () => undefined),
            },
            daily_plans: {
                clear: vi.fn(async () => undefined),
                bulkPut: vi.fn(async () => undefined),
                toArray: vi.fn(async () => []),
            },
            error_ledger: {
                clear: vi.fn(async () => undefined),
                bulkAdd: vi.fn(async () => undefined),
                put: vi.fn(async () => undefined),
            },
            rag_vectors: {
                clear: vi.fn(async () => undefined),
                where: vi.fn(() => ({
                    equals: vi.fn(() => ({
                        delete: vi.fn(async () => 0),
                    })),
                })),
            },
            sync_outbox: {
                toArray: syncOutboxToArray,
                where: vi.fn(() => ({
                    equals: vi.fn(() => ({
                        first: vi.fn(async () => undefined),
                    })),
                })),
                add: vi.fn(async () => undefined),
                update: vi.fn(async () => undefined),
            },
            sync_meta: {
                get: vi.fn(async (key: string) => (key === "active_user_id" ? { value: "user-1" } : undefined)),
                put: vi.fn(async () => undefined),
            },
            transaction: vi.fn(async (_mode: string, ...args: unknown[]) => {
                const callback = args.at(-1);
                if (typeof callback !== "function") {
                    throw new Error("Missing transaction callback");
                }
                await (callback as () => Promise<void>)();
            }),
        },
        userProfileFirst,
        syncOutboxToArray,
    };
}

async function loadUserRepository(options?: {
    responses?: Record<string, { data: unknown; error: unknown }>;
    dbMock?: ReturnType<typeof createDbMock>;
}) {
    vi.resetModules();

    const responses = options?.responses ?? {};
    const dbMock = options?.dbMock ?? createDbMock();
    const supabase = createSupabaseMock(responses);
    const syncState = {
        setPhase: vi.fn(),
        setReady: vi.fn(),
    };

    vi.doMock("@/lib/supabase/browser", () => ({
        createBrowserClientSingleton: () => supabase,
    }));
    vi.doMock("@/lib/db", () => dbMock);
    vi.doMock("@/lib/sync-status", () => ({
        useSyncStatusStore: {
            getState: () => syncState,
        },
    }));

    const mod = await import("./user-repository");

    return {
        mod,
        dbMock,
        supabase,
        syncState,
    };
}

describe("user repository error-ledger sync regressions", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("includes error_ledger when checking the latest remote update timestamp", async () => {
        const { mod } = await loadUserRepository({
            responses: {
                profiles: { data: { updated_at: "2026-04-13T10:00:00.000Z" }, error: null },
                vocabulary: { data: { updated_at: "2026-04-13T10:01:00.000Z" }, error: null },
                writing_history: { data: { updated_at: "2026-04-13T10:02:00.000Z" }, error: null },
                read_articles: { data: { updated_at: "2026-04-13T10:03:00.000Z" }, error: null },
                elo_history: { data: { updated_at: "2026-04-13T10:04:00.000Z" }, error: null },
                daily_plans: { data: { updated_at: "2026-04-13T10:05:00.000Z" }, error: null },
                error_ledger: { data: { updated_at: "2026-04-13T10:06:00.000Z" }, error: null },
            },
        });

        const latest = await mod.getRemoteLatestUpdatedAt("user-1");

        expect(latest).toBe(Date.parse("2026-04-13T10:06:00.000Z"));
    });

    it("pulls error ledger rows once and schedules local vector hydration", async () => {
        const profile = {
            user_id: "user-1",
            translation_elo: 400,
            listening_elo: 400,
            streak_count: 0,
            max_translation_elo: 400,
            max_listening_elo: 400,
            coins: 10,
            inventory: {},
            owned_themes: ["morning_coffee"],
            active_theme: "morning_coffee",
            updated_at: "2026-04-13T10:00:00.000Z",
            last_practice_at: "2026-04-13T10:00:00.000Z",
        };
        const errorLedgerRow = {
            id: "remote-ledger-1",
            user_id: "user-1",
            text: "I goed there yesterday.",
            tag: "grammar",
            created_at: 1713000000000,
            updated_at: "2026-04-13T10:06:00.000Z",
        };

        const { mod, dbMock } = await loadUserRepository({
            responses: {
                profiles: { data: profile, error: null },
                vocabulary: { data: [], error: null },
                writing_history: { data: [], error: null },
                read_articles: { data: [], error: null },
                elo_history: { data: [], error: null },
                daily_plans: { data: [], error: null },
                error_ledger: { data: [errorLedgerRow], error: null },
            },
        });

        await mod.pullRemoteSnapshot("user-1");

        expect(dbMock.db.error_ledger.bulkAdd).toHaveBeenCalledTimes(1);
        expect(dbMock.db.error_ledger.bulkAdd).toHaveBeenCalledWith([
            expect.objectContaining({
                remote_id: "remote-ledger-1",
                text: "I goed there yesterday.",
                tag: "grammar",
                sync_status: "synced",
            }),
        ]);
    });

    it("saves a black-history entry with outbox sync payload", async () => {
        const { mod, dbMock } = await loadUserRepository();
        const randomUuidSpy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("error-ledger-uuid");
        const scheduleSync = vi.fn();

        await mod.saveErrorLedgerEntry(
            {
                text: "He go to school yesterday.",
                tag: "tense",
                created_at: 1713000000000,
            },
            {
                scheduleSync,
            },
        );

        expect(dbMock.db.error_ledger.put).toHaveBeenCalledWith(
            expect.objectContaining({
                remote_id: "error-ledger-uuid",
                user_id: "user-1",
                text: "He go to school yesterday.",
                tag: "tense",
                created_at: 1713000000000,
                sync_status: "pending",
            }),
        );
        expect(dbMock.db.sync_outbox.add).toHaveBeenCalledTimes(1);
        expect(dbMock.db.sync_outbox.add).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: "error_ledger",
                operation: "upsert",
                record_key: "error-ledger-uuid",
                payload: expect.objectContaining({
                    id: "error-ledger-uuid",
                    user_id: "user-1",
                    text: "He go to school yesterday.",
                    tag: "tense",
                }),
            }),
        );
        expect(scheduleSync).toHaveBeenCalledTimes(1);

        randomUuidSpy.mockRestore();
    });

    it("queues generated article deletes in the same transaction as local removal", async () => {
        const { mod, dbMock, syncState } = await loadUserRepository();

        await mod.deleteReadArticleSnapshot(" https://example.com/generated-lesson ");

        expect(dbMock.db.transaction).toHaveBeenCalledTimes(1);
        expect(dbMock.db.articles.delete).toHaveBeenCalledWith("https://example.com/generated-lesson");
        expect(dbMock.db.read_articles.delete).toHaveBeenCalledWith("https://example.com/generated-lesson");
        expect(dbMock.db.sync_outbox.add).toHaveBeenCalledWith(
            expect.objectContaining({
                entity: "read_articles",
                operation: "delete",
                record_key: "https://example.com/generated-lesson",
                payload: {
                    user_id: "user-1",
                    url: "https://example.com/generated-lesson",
                },
                sync_status: "pending",
            }),
        );
        expect(syncState.setPhase).toHaveBeenCalledWith("syncing");
    });
});
