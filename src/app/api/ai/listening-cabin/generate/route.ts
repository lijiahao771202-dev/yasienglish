import { NextResponse } from "next/server";

import { deepseek } from "@/lib/deepseek";
import {
    buildListeningCabinPrompt,
    normalizeListeningCabinRequest,
    normalizeListeningCabinSentences,
    validateListeningCabinRequest,
} from "@/lib/listening-cabin";

export async function POST(req: Request) {
    try {
        const rawPayload = await req.json().catch(() => null);
        const request = normalizeListeningCabinRequest(rawPayload);
        const validationError = validateListeningCabinRequest(request);

        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                {
                    role: "user",
                    content: buildListeningCabinPrompt(request),
                },
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error("No content received from listening cabin generation.");
        }

        const parsed = JSON.parse(content) as {
            title?: unknown;
            sentences?: unknown;
        };

        const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
        const sentences = normalizeListeningCabinSentences(parsed.sentences, request.sentenceCount);

        if (!title || sentences.length === 0) {
            return NextResponse.json(
                { error: "AI listening script unavailable" },
                { status: 502 },
            );
        }

        return NextResponse.json({
            title,
            sourcePrompt: request.prompt,
            sentences,
            meta: {
                cefrLevel: request.cefrLevel,
                targetDurationMinutes: request.targetDurationMinutes,
                sentenceCount: sentences.length,
                model: "deepseek-chat",
            },
        });
    } catch (error) {
        console.error("Listening cabin generation error:", error);
        return NextResponse.json(
            { error: "Failed to generate listening cabin script" },
            { status: 500 },
        );
    }
}
