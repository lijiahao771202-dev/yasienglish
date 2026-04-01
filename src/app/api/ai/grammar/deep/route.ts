import { NextResponse } from "next/server";
import { runDeepGrammarService } from "@/lib/server-grammar-service";
import type { ReadingEconomyContext } from "@/lib/reading-economy-server";

export async function POST(req: Request) {
    try {
        const payload = await req.json() as {
            text?: string;
            sentence?: string;
            forceRegenerate?: boolean;
            economyContext?: ReadingEconomyContext;
        };

        const result = await runDeepGrammarService({
            text: payload.text,
            mode: "deep",
            sentence: payload.sentence,
            forceRegenerate: payload.forceRegenerate,
            economyContext: payload.economyContext,
        });

        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        console.error("Grammar Deep Route Error:", error);
        return NextResponse.json({ error: "Failed to analyze grammar deeply" }, { status: 500 });
    }
}
