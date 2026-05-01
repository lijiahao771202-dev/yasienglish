import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SupabaseMockResult = { data: unknown; error: unknown };
type SupabaseMockResponse = SupabaseMockResult | Promise<SupabaseMockResult>;
type SupabaseMockResponseConfig = SupabaseMockResponse | SupabaseMockResponse[];
type SupabaseBuilderMock = {
    upsert: ReturnType<typeof vi.fn>;
    [key: string]: unknown;
};

function createSupabaseMock(responses: Record<string, SupabaseMockResponseConfig>) {
    const buildersByTable = new Map<string, SupabaseBuilderMock[]>();
    const responseQueues = new Map<string, SupabaseMockResponse[]>();
    const from = vi.fn((table: string) => {
        const configuredResponse = responses[table] ?? { data: null, error: null };
        if (!responseQueues.has(table)) {
            responseQueues.set(table, Array.isArray(configuredResponse)
                ? [...configuredResponse] as SupabaseMockResponse[]
                : [configuredResponse]);
        }
        const resolveResponse = () => {
            const queue = responseQueues.get(table) ?? [{ data: null, error: null }];
            if (queue.length > 1) {
                return queue.shift() ?? { data: null, error: null };
            }
            return queue[0] ?? { data: null, error: null };
        };
        const builder = {
            select: vi.fn(() => builder),
            eq: vi.fn(() => builder),
            order: vi.fn(() => builder),
            limit: vi.fn(() => builder),
            maybeSingle: vi.fn(async () => resolveResponse()),
            single: vi.fn(async () => resolveResponse()),
            in: vi.fn(() => builder),
            delete: vi.fn(() => builder),
            upsert: vi.fn(() => builder),
            update: vi.fn(() => builder),
            then: (onFulfilled: (value: SupabaseMockResponse) => unknown, onRejected?: (reason: unknown) => unknown) =>
                Promise.resolve(resolveResponse()).then(onFulfilled, onRejected),
        };
        buildersByTable.set(table, [...(buildersByTable.get(table) ?? []), builder]);
        return builder;
    });

    return {
        from,
        buildersByTable,
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
    const userProfileFirst = vi.fn<() => Promise<unknown>>(async () => undefined);
    const vocabularyRows: Array<Record<string, unknown>> = [];
    const writingRows: Array<Record<string, unknown>> = [];
    const readRows: Array<Record<string, unknown>> = [];
    const eloRows: Array<Record<string, unknown>> = [];
    const errorLedgerRows: Array<Record<string, unknown>> = [];
    const counts = {
        vocabulary: vi.fn(async () => vocabularyRows.length),
        writing_history: vi.fn(async () => writingRows.length),
        read_articles: vi.fn(async () => readRows.length),
        elo_history: vi.fn(async () => eloRows.length),
    };
    const syncOutboxToArray = vi.fn<() => Promise<Array<Record<string, unknown>>>>(async () => []);
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
                put: vi.fn(async () => undefined),
                update: vi.fn(async () => undefined),
                toArray: vi.fn(async () => vocabularyRows),
                count: counts.vocabulary,
                where: vi.fn(() => ({
                    equals: vi.fn(() => ({
                        first: vi.fn(async () => undefined),
                        toArray: vi.fn(async () => vocabularyRows),
                    })),
                })),
            },
            writing_history: {
                clear: vi.fn(async () => undefined),
                bulkAdd: vi.fn(async () => undefined),
                add: vi.fn(async () => undefined),
                update: vi.fn(async () => undefined),
                toArray: vi.fn(async () => writingRows),
                count: counts.writing_history,
            },
            read_articles: {
                clear: vi.fn(async () => undefined),
                bulkPut: vi.fn(async () => undefined),
                put: vi.fn(async () => undefined),
                update: vi.fn(async () => undefined),
                get: vi.fn<() => Promise<Record<string, unknown> | undefined>>(async () => undefined),
                toArray: vi.fn(async () => readRows),
                count: counts.read_articles,
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
                add: vi.fn(async () => undefined),
                update: vi.fn(async () => undefined),
                toArray: vi.fn(async () => eloRows),
                count: counts.elo_history,
                where: vi.fn(() => ({
                    equals: vi.fn(() => ({
                        toArray: vi.fn(async () => []),
                    })),
                })),
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
                update: vi.fn(async () => undefined),
                toArray: vi.fn(async () => errorLedgerRows),
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
                orderBy: vi.fn(() => ({
                    toArray: syncOutboxToArray,
                })),
                where: vi.fn(() => ({
                    equals: vi.fn(() => ({
                        first: vi.fn(async () => undefined),
                    })),
                })),
                add: vi.fn(async () => undefined),
                update: vi.fn(async () => undefined),
                delete: vi.fn(async () => undefined),
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
        rows: {
            vocabulary: vocabularyRows,
            writing_history: writingRows,
            read_articles: readRows,
            elo_history: eloRows,
            error_ledger: errorLedgerRows,
        },
        counts,
        syncOutboxToArray,
    };
}

async function loadUserRepository(options?: {
    responses?: Record<string, SupabaseMockResponseConfig>;
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
        vi.stubGlobal("navigator", { onLine: true });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
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

    it("archives generated articles locally without queuing a remote schema write", async () => {
        const { mod, dbMock, syncState } = await loadUserRepository();
        dbMock.db.read_articles.get.mockResolvedValue({ url: "https://example.com/read", timestamp: 123 });

        await mod.setReadArticleArchived(" https://example.com/read ", true);

        expect(dbMock.db.read_articles.update).toHaveBeenCalledWith(
            "https://example.com/read",
            expect.objectContaining({
                archived_at: expect.any(Number),
            }),
        );
        expect(dbMock.db.read_articles.put).not.toHaveBeenCalled();
        expect(dbMock.db.sync_outbox.add).not.toHaveBeenCalled();
        expect(syncState.setPhase).not.toHaveBeenCalled();
    });

    it("can restore locally archived generated articles", async () => {
        const { mod, dbMock } = await loadUserRepository();
        dbMock.db.read_articles.get.mockResolvedValue({
            url: "https://example.com/read",
            timestamp: 123,
            archived_at: 456,
        });

        await mod.setReadArticleArchived("https://example.com/read", false);

        expect(dbMock.db.read_articles.update).toHaveBeenCalledWith(
            "https://example.com/read",
            { archived_at: undefined },
        );
        expect(dbMock.db.sync_outbox.add).not.toHaveBeenCalled();
    });

    it("retries profile outbox sync without columns missing from the remote schema cache", async () => {
        const dbMock = createDbMock();
        dbMock.syncOutboxToArray.mockResolvedValue([
            {
                id: 12,
                entity: "profile",
                operation: "upsert",
                record_key: "profile",
                payload: {
                    ai_provider: "mimo",
                    mimo_model: "mimo-v2.5-pro",
                },
                attempts: 0,
                created_at: 1713000000000,
                updated_at: 1713000000000,
                sync_status: "pending",
            },
        ]);

        const { mod, dbMock: loadedDbMock, supabase } = await loadUserRepository({
            dbMock,
            responses: {
                profiles: [
                    {
                        data: null,
                        error: {
                            message: "Could not find the 'mimo_model' column of 'profiles' in the schema cache",
                        },
                    },
                    { data: null, error: null },
                ],
            },
        });

        await mod.flushOutbox();

        const profileUpdates = supabase.buildersByTable.get("profiles") ?? [];
        expect(profileUpdates).toHaveLength(2);
        expect(profileUpdates[0].update).toHaveBeenCalledWith(expect.objectContaining({
            ai_provider: "mimo",
            mimo_model: "mimo-v2.5-pro",
        }));
        expect(profileUpdates[1].update).toHaveBeenCalledWith(expect.not.objectContaining({
            mimo_model: expect.anything(),
        }));
        expect(loadedDbMock.db.sync_outbox.delete).toHaveBeenCalledWith(12);
    });

    it("marks local cache ready before starting remote bootstrap work", async () => {
        const never = new Promise<{ data: unknown; error: unknown }>(() => undefined);
        const dbMock = createDbMock();
        dbMock.userProfileFirst.mockResolvedValue({
            id: 1,
            user_id: "user-1",
            elo_rating: 400,
            streak_count: 0,
            max_elo: 400,
            last_practice: 1713000000000,
        });
        dbMock.counts.vocabulary.mockResolvedValue(1);
        const { mod, syncState } = await loadUserRepository({
            dbMock,
            responses: {
                profiles: never,
            },
        });

        const result = await mod.bootstrapUserSession("user-1");

        expect(result).toEqual({ usedLocalCache: true });
        expect(syncState.setReady).toHaveBeenCalledWith(true);
        expect(syncState.setPhase).toHaveBeenCalledWith("syncing");
    });

    it("creates a local default profile and opens the app when no local cache exists", async () => {
        const never = new Promise<{ data: unknown; error: unknown }>(() => undefined);
        const dbMock = createDbMock();
        const { mod, syncState } = await loadUserRepository({
            dbMock,
            responses: {
                profiles: never,
            },
        });

        const result = await mod.bootstrapUserSession("user-1");

        expect(result).toEqual({ usedLocalCache: false });
        expect(dbMock.db.user_profile.add).toHaveBeenCalledWith(expect.objectContaining({
            user_id: "user-1",
            sync_status: "pending",
        }));
        expect(syncState.setReady).toHaveBeenCalledWith(true);
        expect(syncState.setPhase).toHaveBeenCalledWith("syncing");
    });

    it("times out a stuck background sync and releases the scheduler", async () => {
        vi.useFakeTimers();
        const never = new Promise<{ data: unknown; error: unknown }>(() => undefined);
        const { mod, syncState } = await loadUserRepository({
            responses: {
                profiles: never,
            },
        });

        const firstSync = mod.scheduleBackgroundSync({ throwOnError: true });
        const firstStatusPromise = firstSync.then(() => "resolved", () => "rejected");
        await vi.advanceTimersByTimeAsync(8_500);
        const firstStatus = await firstStatusPromise;

        const secondSync = mod.scheduleBackgroundSync({ throwOnError: true });
        const secondStatusPromise = secondSync.then(() => "resolved", () => "rejected");
        await vi.advanceTimersByTimeAsync(8_500);
        const secondStatus = await secondStatusPromise;

        expect(firstStatus).toBe("rejected");
        expect(secondStatus).toBe("rejected");
        expect(syncState.setPhase).toHaveBeenCalledWith("error", expect.stringContaining("云端备份暂时不可用"));
    });

    it("keeps pending local vocabulary records when applying a remote snapshot", async () => {
        const dbMock = createDbMock();
        dbMock.rows.vocabulary.push({
            word: "local-only",
            word_key: "local-only",
            definition: "local",
            translation: "本地",
            context: "",
            example: "",
            timestamp: 1713000000000,
            stability: 0,
            difficulty: 0,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            learning_steps: 0,
            state: 0,
            last_review: 0,
            due: 1713000000000,
            updated_at: "2026-04-13T10:10:00.000Z",
            sync_status: "pending",
        });
        dbMock.syncOutboxToArray.mockResolvedValue([
            {
                entity: "vocabulary",
                operation: "upsert",
                record_key: "local-only",
                payload: {},
            },
        ]);

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
        const { mod } = await loadUserRepository({
            dbMock,
            responses: {
                profiles: { data: profile, error: null },
                vocabulary: { data: [], error: null },
                writing_history: { data: [], error: null },
                read_articles: { data: [], error: null },
                elo_history: { data: [], error: null },
                daily_plans: { data: [], error: null },
                error_ledger: { data: [], error: null },
            },
        });

        await mod.pullRemoteSnapshot("user-1");

        expect(dbMock.db.vocabulary.bulkPut).toHaveBeenCalledWith([
            expect.objectContaining({
                word: "local-only",
                sync_status: "pending",
            }),
        ]);
    });

    it("bulk upserts pending vocabulary during background push", async () => {
        const dbMock = createDbMock();
        dbMock.rows.vocabulary.push(
            {
                word: "alpha",
                word_key: "alpha",
                definition: "a",
                translation: "甲",
                context: "",
                example: "",
                timestamp: 1713000000000,
                stability: 0,
                difficulty: 0,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                learning_steps: 0,
                state: 0,
                last_review: 0,
                due: 1713000000000,
                updated_at: "2026-04-13T10:10:00.000Z",
                sync_status: "pending",
            },
            {
                word: "beta",
                word_key: "beta",
                definition: "b",
                translation: "乙",
                context: "",
                example: "",
                timestamp: 1713000000001,
                stability: 0,
                difficulty: 0,
                elapsed_days: 0,
                scheduled_days: 0,
                reps: 0,
                lapses: 0,
                learning_steps: 0,
                state: 0,
                last_review: 0,
                due: 1713000000000,
                updated_at: "2026-04-13T10:11:00.000Z",
                sync_status: "pending",
            },
        );
        const { mod, supabase } = await loadUserRepository({
            dbMock,
            responses: {
                profiles: {
                    data: {
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
                    },
                    error: null,
                },
                vocabulary: { data: [], error: null },
                writing_history: { data: [], error: null },
                read_articles: { data: [], error: null },
                elo_history: { data: [], error: null },
                daily_plans: { data: [], error: null },
                error_ledger: { data: [], error: null },
            },
        });

        await mod.scheduleBackgroundSync();

        const vocabularyUpserts = (supabase.buildersByTable.get("vocabulary") ?? [])
            .flatMap((builder) => builder.upsert.mock.calls);
        expect(vocabularyUpserts).toContainEqual([
            expect.arrayContaining([
                expect.objectContaining({ word: "alpha" }),
                expect.objectContaining({ word: "beta" }),
            ]),
            { onConflict: "user_id,word_key" },
        ]);
    });
});
