import { createServerClient } from "@/lib/supabase/server";
import {
    getReadingCoinCost,
    getReadingCoinReward,
    INSUFFICIENT_READING_COINS,
    type ReadingEconomyAction,
    READING_COIN_DAILY_GAIN_CAP,
} from "@/lib/reading-economy";

export interface ReadingEconomyContext {
    scene?: string;
    action?: ReadingEconomyAction;
    articleUrl?: string;
    dedupeKey?: string;
    meta?: Record<string, unknown>;
}

interface ReadingCoinRpcRow {
    ledger_id: string | null;
    applied: boolean;
    insufficient: boolean;
    balance_after: number;
    delta: number;
    action: string;
    dedupe_key: string | null;
}

export interface ReadingCoinMutationResult {
    ok: boolean;
    insufficient: boolean;
    balance: number;
    required?: number;
    action: ReadingEconomyAction;
    applied: boolean;
    delta: number;
    ledgerId: string | null;
    dedupeKey: string | null;
}

export function isReadEconomyContext(context?: ReadingEconomyContext | null) {
    return context?.scene === "read" && Boolean(context.action);
}

function isMissingRpcFunction(message: string, functionName: string) {
    const lower = message.toLowerCase();
    return lower.includes("schema cache") && message.includes(`public.${functionName}`);
}

function shouldFallbackReadingCoinRpc(message: string) {
    const lower = message.toLowerCase();
    return isMissingRpcFunction(message, "apply_reading_coin_event")
        || (lower.includes("column reference") && lower.includes("delta") && lower.includes("ambiguous"));
}

function normalizeRpcResult(data: unknown): ReadingCoinRpcRow {
    const row = Array.isArray(data) ? data[0] : data;
    return {
        ledger_id: typeof row?.ledger_id === "string" ? row.ledger_id : null,
        applied: Boolean(row?.applied),
        insufficient: Boolean(row?.insufficient),
        balance_after: Number(row?.balance_after ?? 0),
        delta: Number(row?.delta ?? 0),
        action: String(row?.action ?? ""),
        dedupe_key: typeof row?.dedupe_key === "string" ? row.dedupe_key : null,
    };
}

function dateKey(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

async function runFallbackReadingCoinEvent(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    params: {
        action: ReadingEconomyAction;
        delta: number;
        dedupeKey?: string;
        meta?: Record<string, unknown>;
        failIfInsufficient?: boolean;
        dailyGainCap?: number | null;
    },
): Promise<ReadingCoinRpcRow> {
    const dedupeKey = params.dedupeKey?.trim() ? params.dedupeKey.trim() : null;

    if (dedupeKey) {
        const { data: existingLedger, error: existingLedgerError } = await supabase
            .from("reading_coin_ledger")
            .select("id, balance_after")
            .eq("dedupe_key", dedupeKey)
            .maybeSingle();

        if (!existingLedgerError && existingLedger) {
            return {
                ledger_id: existingLedger.id ?? null,
                applied: false,
                insufficient: false,
                balance_after: Number(existingLedger.balance_after ?? 0),
                delta: 0,
                action: params.action,
                dedupe_key: dedupeKey,
            };
        }
    }

    let { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, reading_coins, reading_streak, reading_last_daily_grant_at")
        .single();

    if (profileError || !profile?.user_id) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            throw new Error(userError?.message || "Unauthorized");
        }

        const { data: insertedProfile, error: insertProfileError } = await supabase
            .from("profiles")
            .upsert({ user_id: user.id }, { onConflict: "user_id" })
            .select("user_id, reading_coins, reading_streak, reading_last_daily_grant_at")
            .single();

        if (insertProfileError || !insertedProfile?.user_id) {
            throw new Error(insertProfileError?.message || "Profile unavailable");
        }

        profile = insertedProfile;
        profileError = null;
    }

    const currentBalance = Number(profile.reading_coins ?? 40);
    let effectiveDelta = Number(params.delta ?? 0);
    const dailyGainCap = params.dailyGainCap;

    if (typeof dailyGainCap === "number" && dailyGainCap >= 0 && effectiveDelta > 0) {
        const dayStart = new Date();
        dayStart.setUTCHours(0, 0, 0, 0);
        const { data: gainRows, error: gainError } = await supabase
            .from("reading_coin_ledger")
            .select("delta")
            .gte("created_at", dayStart.toISOString());

        if (!gainError && Array.isArray(gainRows)) {
            const todayGain = gainRows.reduce((sum, row) => sum + Math.max(0, Number(row.delta ?? 0)), 0);
            if (todayGain >= dailyGainCap) {
                effectiveDelta = 0;
            } else {
                effectiveDelta = Math.min(effectiveDelta, dailyGainCap - todayGain);
            }
        }
    }

    if (params.failIfInsufficient && currentBalance + effectiveDelta < 0) {
        return {
            ledger_id: null,
            applied: false,
            insufficient: true,
            balance_after: currentBalance,
            delta: 0,
            action: params.action,
            dedupe_key: dedupeKey,
        };
    }

    const nextBalance = Math.max(0, currentBalance + effectiveDelta);
    const actualDelta = nextBalance - currentBalance;
    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);
    const yesterdayDate = new Date();
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    const grantActions = new Set<ReadingEconomyAction>(["daily_login", "read_complete", "quiz_complete", "reading_streak"]);
    const lastGrantKey = dateKey(profile.reading_last_daily_grant_at);
    let nextStreak = Number(profile.reading_streak ?? 0);
    let nextLastGrantAt = profile.reading_last_daily_grant_at ?? null;

    if (actualDelta > 0 && grantActions.has(params.action)) {
        if (!lastGrantKey) {
            nextStreak = 1;
        } else if (lastGrantKey === today) {
            nextStreak = Number(profile.reading_streak ?? 0);
        } else if (lastGrantKey === yesterday) {
            nextStreak = Number(profile.reading_streak ?? 0) + 1;
        } else {
            nextStreak = 1;
        }
        nextLastGrantAt = nowIso;
    }

    const { error: updateError } = await supabase
        .from("profiles")
        .update({
            reading_coins: nextBalance,
            reading_streak: nextStreak,
            reading_last_daily_grant_at: nextLastGrantAt,
        })
        .eq("user_id", profile.user_id);

    if (updateError) {
        throw new Error(updateError.message || "Failed to update reading coins");
    }

    let ledgerId: string | null = null;
    const { data: insertedLedger, error: insertLedgerError } = await supabase
        .from("reading_coin_ledger")
        .insert({
            user_id: profile.user_id,
            scene: "read",
            action: params.action,
            delta: actualDelta,
            dedupe_key: dedupeKey,
            balance_after: nextBalance,
            meta: params.meta ?? {},
        })
        .select("id")
        .single();

    if (!insertLedgerError && insertedLedger?.id) {
        ledgerId = insertedLedger.id;
    }

    return {
        ledger_id: ledgerId,
        applied: actualDelta !== 0,
        insufficient: false,
        balance_after: nextBalance,
        delta: actualDelta,
        action: params.action,
        dedupe_key: dedupeKey,
    };
}

async function runReadingCoinEvent(params: {
    action: ReadingEconomyAction;
    delta: number;
    dedupeKey?: string;
    meta?: Record<string, unknown>;
    failIfInsufficient?: boolean;
    dailyGainCap?: number | null;
}) {
    const supabase = await createServerClient();
    const { data, error } = await supabase.rpc("apply_reading_coin_event", {
        p_action: params.action,
        p_delta: params.delta,
        p_scene: "read",
        p_dedupe_key: params.dedupeKey ?? null,
        p_meta: params.meta ?? {},
        p_fail_if_insufficient: Boolean(params.failIfInsufficient),
        p_daily_gain_cap: params.dailyGainCap ?? null,
    });

    if (error) {
        const message = error.message || "apply_reading_coin_event failed";
        if (shouldFallbackReadingCoinRpc(message)) {
            return runFallbackReadingCoinEvent(supabase, params);
        }
        throw new Error(message);
    }

    return normalizeRpcResult(data);
}

export async function chargeReadingCoins(params: {
    action: ReadingEconomyAction;
    dedupeKey?: string;
    meta?: Record<string, unknown>;
}) : Promise<ReadingCoinMutationResult> {
    const required = getReadingCoinCost(params.action);
    if (required <= 0) {
        return {
            ok: true,
            insufficient: false,
            balance: 0,
            action: params.action,
            applied: false,
            delta: 0,
            ledgerId: null,
            dedupeKey: params.dedupeKey ?? null,
        };
    }

    const row = await runReadingCoinEvent({
        action: params.action,
        delta: -required,
        dedupeKey: params.dedupeKey,
        meta: params.meta,
        failIfInsufficient: true,
    });

    if (row.insufficient) {
        return {
            ok: false,
            insufficient: true,
            balance: row.balance_after,
            required,
            action: params.action,
            applied: false,
            delta: 0,
            ledgerId: null,
            dedupeKey: params.dedupeKey ?? null,
        };
    }

    return {
        ok: true,
        insufficient: false,
        balance: row.balance_after,
        action: params.action,
        applied: row.applied,
        delta: row.delta,
        ledgerId: row.ledger_id,
        dedupeKey: row.dedupe_key,
    };
}

export async function rewardReadingCoins(params: {
    action: ReadingEconomyAction;
    dedupeKey?: string;
    delta?: number;
    meta?: Record<string, unknown>;
    dailyGainCap?: number;
}) : Promise<ReadingCoinMutationResult> {
    const reward = Math.max(0, params.delta ?? getReadingCoinReward(params.action));
    const row = await runReadingCoinEvent({
        action: params.action,
        delta: reward,
        dedupeKey: params.dedupeKey,
        meta: params.meta,
        failIfInsufficient: false,
        dailyGainCap: params.dailyGainCap ?? READING_COIN_DAILY_GAIN_CAP,
    });

    return {
        ok: true,
        insufficient: false,
        balance: row.balance_after,
        action: params.action,
        applied: row.applied,
        delta: row.delta,
        ledgerId: row.ledger_id,
        dedupeKey: row.dedupe_key,
    };
}

export function insufficientReadingCoinsPayload(action: ReadingEconomyAction, required: number, balance: number) {
    return {
        errorCode: INSUFFICIENT_READING_COINS,
        message: "阅读币不足，请先完成阅读/测验获取阅读币。",
        action,
        required,
        balance,
    };
}
