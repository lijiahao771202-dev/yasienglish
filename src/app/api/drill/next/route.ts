import { NextRequest, NextResponse } from "next/server";

import { POST as generateAiDrill } from "@/app/api/ai/generate_drill/route";
import {
    buildRebuildDrill,
    buildListeningBankDrill,
    type DrillSourceMode,
    selectListeningBankItem,
} from "@/lib/listening-drill-bank";

type DrillRouteBody = {
    articleTitle?: string;
    articleContent?: string;
    difficulty?: string;
    eloRating?: number;
    mode?: "translation" | "listening" | "rebuild";
    bossType?: string;
    sourceMode?: DrillSourceMode;
    excludeBankIds?: string[];
};

export async function POST(req: NextRequest) {
    const body = await req.json() as DrillRouteBody;
    const requestedMode = body.mode === "rebuild"
        ? "rebuild"
        : body.mode === "listening"
            ? "listening"
            : "translation";
    const sourceMode = requestedMode === "rebuild"
        ? "bank"
        : body.sourceMode === "bank"
            ? "bank"
            : "ai";
    const mode = requestedMode;
    const eloRating = typeof body.eloRating === "number" ? body.eloRating : 400;

    if (sourceMode === "bank" && (mode === "listening" || mode === "rebuild")) {
        const item = selectListeningBankItem({
            elo: eloRating,
            excludeIds: body.excludeBankIds,
        });

        if (!item) {
            return NextResponse.json(
                { error: "No listening bank item available for the current Elo." },
                { status: 404 },
            );
        }

        return NextResponse.json(
            mode === "rebuild"
                ? buildRebuildDrill(item, eloRating)
                : buildListeningBankDrill(item, eloRating),
        );
    }

    return generateAiDrill({
        json: async () => ({
            ...body,
            mode: mode === "rebuild" ? "listening" : mode,
        }),
    } as NextRequest);
}
