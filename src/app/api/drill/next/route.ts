import { NextRequest, NextResponse } from "next/server";

import { POST as generateAiDrill } from "@/app/api/ai/generate_drill/route";
import {
    buildListeningBankDrill,
    type DrillSourceMode,
    selectListeningBankItem,
} from "@/lib/listening-drill-bank";
import { generateRebuildAiDrill } from "@/lib/rebuild-ai";

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
    const mode = requestedMode;
    const requestedSourceMode = body.sourceMode === "bank" ? "bank" : "ai";
    const sourceMode: DrillSourceMode = mode === "rebuild" ? "ai" : requestedSourceMode;
    const eloRating = typeof body.eloRating === "number" ? body.eloRating : 400;

    if (sourceMode === "bank" && mode === "listening") {
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

        return NextResponse.json(buildListeningBankDrill(item, eloRating));
    }

    if (mode === "rebuild") {
        const topic = typeof body.articleTitle === "string" && body.articleTitle.trim()
            ? body.articleTitle.trim()
            : "随机场景";
        try {
            const drill = await generateRebuildAiDrill({
                topic,
                effectiveElo: eloRating,
            });
            return NextResponse.json(drill);
        } catch (error) {
            console.error("Rebuild AI generation failed:", error);
            return NextResponse.json(
                { error: "Failed to generate rebuild drill." },
                { status: 500 },
            );
        }
    }

    return generateAiDrill({
        json: async () => ({
            ...body,
            mode,
        }),
    } as NextRequest);
}
