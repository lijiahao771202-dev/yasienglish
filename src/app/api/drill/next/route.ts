import { NextRequest, NextResponse } from "next/server";

import { POST as generateAiDrill } from "@/app/api/ai/generate_drill/route";
import {
    buildListeningBankDrill,
    type DrillSourceMode,
    selectListeningBankItem,
} from "@/lib/listening-drill-bank";
import { generateRebuildAiDrill, generateRebuildPassageAiDrill } from "@/lib/rebuild-ai";

type DrillRouteBody = {
    articleTitle?: string;
    topicPrompt?: string;
    articleContent?: string;
    difficulty?: string;
    eloRating?: number;
    mode?: "translation" | "listening" | "rebuild";
    bossType?: string;
    sourceMode?: DrillSourceMode;
    excludeBankIds?: string[];
    rebuildVariant?: "sentence" | "passage";
    segmentCount?: 2 | 3 | 5;
};

const REBUILD_ROUTE_MAX_ATTEMPTS = 3;

async function waitBeforeRetry(attempt: number) {
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
}

async function generateRebuildDrillWithRetry(args: {
    topic: string;
    topicPrompt?: string;
    effectiveElo: number;
    rebuildVariant: "sentence" | "passage";
    segmentCount: 2 | 3 | 5;
}) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= REBUILD_ROUTE_MAX_ATTEMPTS; attempt += 1) {
        try {
            return args.rebuildVariant === "passage"
                ? await generateRebuildPassageAiDrill({
                    topic: args.topic,
                    topicPrompt: args.topicPrompt,
                    effectiveElo: args.effectiveElo,
                    segmentCount: args.segmentCount,
                })
                : await generateRebuildAiDrill({
                    topic: args.topic,
                    topicPrompt: args.topicPrompt,
                    effectiveElo: args.effectiveElo,
                });
        } catch (error) {
            lastError = error;

            if (attempt === REBUILD_ROUTE_MAX_ATTEMPTS) {
                throw error;
            }

            console.warn(
                `[Drill Route] Retrying rebuild generation (${attempt}/${REBUILD_ROUTE_MAX_ATTEMPTS})`,
                error,
            );
            await waitBeforeRetry(attempt);
        }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to generate rebuild drill.");
}

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
        const topicPrompt = typeof body.topicPrompt === "string" && body.topicPrompt.trim()
            ? body.topicPrompt.trim()
            : undefined;
        const rebuildVariant = body.rebuildVariant === "passage" ? "passage" : "sentence";
        const segmentCount = body.segmentCount === 2 || body.segmentCount === 5 ? body.segmentCount : 3;
        try {
            const drill = await generateRebuildDrillWithRetry({
                topic,
                topicPrompt,
                effectiveElo: eloRating,
                rebuildVariant,
                segmentCount,
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
