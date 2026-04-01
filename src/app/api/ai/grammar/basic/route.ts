import { NextResponse } from "next/server";
import { runBasicGrammarService } from "@/lib/server-grammar-service";
import type { ReadingEconomyContext } from "@/lib/reading-economy-server";

export async function POST(req: Request) {
    try {
        const payload = await req.json() as {
            text?: string;
            forceRegenerate?: boolean;
            economyContext?: ReadingEconomyContext;
        };

        const result = await runBasicGrammarService({
            text: payload.text,
            mode: "basic",
            forceRegenerate: payload.forceRegenerate,
            economyContext: payload.economyContext,
        });

        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        console.error("Grammar Basic Route Error:", error);
        return NextResponse.json({ error: "Failed to analyze grammar" }, { status: 500 });
    }
}
