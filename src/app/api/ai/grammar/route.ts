import { NextResponse } from "next/server";
import { runBasicGrammarService, runDeepGrammarService } from "@/lib/server-grammar-service";
import type { ReadingEconomyContext } from "@/lib/reading-economy-server";

export async function POST(req: Request) {
    try {
        const payload = await req.json() as {
            text?: string;
            mode?: "basic" | "deep";
            sentence?: string;
            forceRegenerate?: boolean;
            economyContext?: ReadingEconomyContext;
        };

        const mode = payload.mode === "deep" ? "deep" : "basic";
        const result = mode === "deep"
            ? await runDeepGrammarService({
                text: payload.text,
                mode: "deep",
                sentence: payload.sentence,
                forceRegenerate: payload.forceRegenerate,
                economyContext: payload.economyContext,
            })
            : await runBasicGrammarService({
                text: payload.text,
                mode: "basic",
                forceRegenerate: payload.forceRegenerate,
                economyContext: payload.economyContext,
            });

        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        console.error("Grammar Route Error:", error);
        return NextResponse.json({ error: "Failed to analyze grammar" }, { status: 500 });
    }
}
