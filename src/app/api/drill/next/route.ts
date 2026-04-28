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
    injectedVocabulary?: string[];
    eloRating?: number;
    mode?: "translation" | "listening" | "rebuild";
    bossType?: string;
    sourceMode?: DrillSourceMode;
    excludeBankIds?: string[];
    rebuildVariant?: "sentence" | "passage";
    translationVariant?: "sentence" | "passage";
    segmentCount?: 2 | 3 | 5;
    provider?: "deepseek" | "glm" | "nvidia" | "github";
    nvidiaModel?: string;
};

async function generateRebuildDrillDirect(args: {
    topic: string;
    topicPrompt?: string;
    injectedVocabulary?: string[];
    effectiveElo: number;
    rebuildVariant: "sentence" | "passage";
    segmentCount: 2 | 3 | 5;
    provider?: "deepseek" | "glm" | "nvidia" | "github";
    nvidiaModel?: string;
}) {
    return args.rebuildVariant === "passage"
        ? await generateRebuildPassageAiDrill({
            topic: args.topic,
            topicPrompt: args.topicPrompt,
            injectedVocabulary: args.injectedVocabulary,
            effectiveElo: args.effectiveElo,
            segmentCount: args.segmentCount,
            provider: args.provider,
            nvidiaModel: args.nvidiaModel,
        })
        : await generateRebuildAiDrill({
            topic: args.topic,
            topicPrompt: args.topicPrompt,
            injectedVocabulary: args.injectedVocabulary,
            effectiveElo: args.effectiveElo,
            provider: args.provider,
            nvidiaModel: args.nvidiaModel,
        });
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
            const drill = await generateRebuildDrillDirect({
                topic,
                topicPrompt,
                injectedVocabulary: Array.isArray(body.injectedVocabulary) ? body.injectedVocabulary : undefined,
                effectiveElo: eloRating,
                rebuildVariant,
                segmentCount,
                provider: body.provider,
                nvidiaModel: body.nvidiaModel,
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

    if (mode === "translation") {
        const topic = typeof body.articleTitle === "string" && body.articleTitle.trim()
            ? body.articleTitle.trim()
            : "随机场景";
        const topicPrompt = typeof body.topicPrompt === "string" && body.topicPrompt.trim()
            ? body.topicPrompt.trim()
            : undefined;
        // fallback to translationVariant if rebuildVariant isn't passed but it's translation mode. 
        // We'll support both for backward compatibility during transition.
        const variant = body.translationVariant || body.rebuildVariant;
        const translationVariant = variant === "passage" ? "passage" : "sentence";
        
        if (translationVariant === "passage") {
            const segmentCount = body.segmentCount === 2 || body.segmentCount === 5 ? body.segmentCount : 3;
            try {
                // We must import it dynamically or statically at top.
                // It's better to do static import at the top of the file, so I will do a multiple replace in a single file later... wait, I can just require it or do a multiple replace. I will do an issue of replace_file_content but with dynamic import for simplicity, or I can update the top import.
                const { generateTranslationPassageAiDrill } = await import("@/lib/translation-ai");
                const drill = await generateTranslationPassageAiDrill({
                    topic,
                    topicPrompt,
                    effectiveElo: eloRating,
                    segmentCount,
                    provider: body.provider,
                    nvidiaModel: body.nvidiaModel,
                });
                return NextResponse.json(drill);
            } catch (error) {
                console.error("Translation passage generation failed:", error);
                return NextResponse.json(
                    { error: "Failed to generate translation passage drill." },
                    { status: 500 },
                );
            }
        }
    }

    return generateAiDrill({
        json: async () => ({
            ...body,
            mode,
            provider: body.provider,
            nvidiaModel: body.nvidiaModel,
        }),
    } as NextRequest);
}
