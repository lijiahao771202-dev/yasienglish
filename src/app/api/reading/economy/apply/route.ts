import { NextResponse } from "next/server";
import { getServerUserSafely } from "@/lib/supabase/server";
import {
    getReadingCoinCost,
    type ReadingEconomyAction,
} from "@/lib/reading-economy";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    rewardReadingCoins,
} from "@/lib/reading-economy-server";

interface ReadingEconomyApplyPayload {
    action?: ReadingEconomyAction;
    dedupeKey?: string;
    articleUrl?: string;
    delta?: number;
    meta?: Record<string, unknown>;
}

export async function POST(request: Request) {
    const { user, error } = await getServerUserSafely();
    if (error || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as ReadingEconomyApplyPayload;
    const action = body.action;

    if (!action) {
        return NextResponse.json({ error: "action is required" }, { status: 400 });
    }

    const meta: Record<string, unknown> = {
        ...(body.meta ?? {}),
        articleUrl: body.articleUrl ?? null,
    };

    const dedupeKey = typeof body.dedupeKey === "string" ? body.dedupeKey : undefined;
    const chargeCost = getReadingCoinCost(action);

    if (chargeCost > 0) {
        const charge = await chargeReadingCoins({
            action,
            dedupeKey,
            meta,
        });

        if (!charge.ok && charge.insufficient) {
            return NextResponse.json(
                insufficientReadingCoinsPayload(action, charge.required ?? chargeCost, charge.balance),
                { status: 402 },
            );
        }

        return NextResponse.json({ result: charge });
    }

    const reward = await rewardReadingCoins({
        action,
        dedupeKey,
        delta: typeof body.delta === "number" ? body.delta : undefined,
        meta,
    });

    return NextResponse.json({ result: reward });
}
