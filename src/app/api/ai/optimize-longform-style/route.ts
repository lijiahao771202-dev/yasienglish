import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import { normalizeLongformTrack, type LongformTrack } from "@/lib/ai-reading-generation";

type Difficulty = "cet4" | "cet6" | "ielts";

interface OptimizeLongformStyleRequest {
    difficulty?: Difficulty;
    longformTrack?: LongformTrack;
    rawPrompt?: string;
}

export async function POST(req: Request) {
    try {
        const { difficulty = "ielts", longformTrack: rawLongformTrack, rawPrompt = "" } = await req.json() as OptimizeLongformStyleRequest;
        const cleanedPrompt = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
        const longformTrack = normalizeLongformTrack(rawLongformTrack);

        if (!cleanedPrompt) {
            return NextResponse.json({ error: "rawPrompt is required" }, { status: 400 });
        }

        const prompt = `You are helping a user refine a custom longform writing-style addendum for AI-generated English reading practice.

TASK:
- Rewrite the user's rough style request into one concise but high-quality style addendum.
- Keep the result in English because it will be injected into an English-generation workflow.
- Preserve the user's intent about explanation style, tone, pacing, and readability.
- Do not add topic content, factual claims, or exam instructions unrelated to style.
- ${longformTrack === "native"
            ? "Do not change or weaken the native-reader objective. Keep the result natural, publication-like, and clearly non-exam-oriented."
            : "Do not change or weaken the exam difficulty."}
- The optimized addendum must remain a secondary style layer only, not a replacement for the selected ${longformTrack === "native" ? "native-reader profile" : "difficulty profile"}.

Track: ${longformTrack === "native" ? "native_reader" : difficulty}
User request: ${cleanedPrompt}

Return valid JSON only:
{
  "optimizedPrompt": "one polished style addendum"
}`;

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            temperature: 0.4,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
        });

        const raw = completion.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(raw) as { optimizedPrompt?: unknown };
        const optimizedPrompt = typeof parsed.optimizedPrompt === "string" ? parsed.optimizedPrompt.trim() : "";

        if (!optimizedPrompt) {
            return NextResponse.json({ error: "Failed to optimize prompt" }, { status: 502 });
        }

        return NextResponse.json({ optimizedPrompt });
    } catch (error) {
        console.error("optimize longform style route error:", error);
        return NextResponse.json({ error: "Failed to optimize prompt" }, { status: 500 });
    }
}
