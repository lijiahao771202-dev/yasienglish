import { NextResponse } from "next/server";

import { deepseek } from "@/lib/deepseek";
import {
    buildListeningCabinAiRandomTopicPrompt,
    normalizeListeningCabinRequest,
    pickListeningCabinAiTopicVariationHint,
} from "@/lib/listening-cabin";

type ModelJson = {
    topic?: unknown;
};

function extractTopic(raw: ModelJson) {
    if (typeof raw.topic !== "string") {
        return "";
    }

    return raw.topic.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractRecentTopics(rawPayload: unknown) {
    const recentTopics = Array.isArray((rawPayload as { recentTopics?: unknown[] } | null)?.recentTopics)
        ? (rawPayload as { recentTopics: unknown[] }).recentTopics
        : [];

    return recentTopics
        .filter((item): item is string => typeof item === "string")
        .map((topic) => topic.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(-6);
}

export async function POST(req: Request) {
    try {
        const rawPayload = await req.json().catch(() => null);
        const request = normalizeListeningCabinRequest(rawPayload);
        const recentTopics = extractRecentTopics(rawPayload);
        const variationHint = pickListeningCabinAiTopicVariationHint(
            `${Date.now()}-${request.scriptMode}-${request.style}-${recentTopics.join("|")}`,
        );

        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                {
                    role: "user",
                    content: buildListeningCabinAiRandomTopicPrompt({
                        scriptMode: request.scriptMode,
                        style: request.style,
                        cefrLevel: request.cefrLevel,
                        sentenceLength: request.sentenceLength,
                        scriptLength: request.scriptLength,
                        topicMode: request.topicMode,
                        recentTopics,
                        variationHint,
                    }),
                },
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            return NextResponse.json(
                { error: "No topic content received from AI." },
                { status: 502 },
            );
        }

        const parsed = JSON.parse(content) as ModelJson;
        const topic = extractTopic(parsed);
        if (!topic) {
            return NextResponse.json(
                { error: "AI returned an empty random topic." },
                { status: 502 },
            );
        }

        return NextResponse.json({
            topic,
            source: "ai" as const,
            scriptMode: request.scriptMode,
        });
    } catch (error) {
        console.error("Listening cabin random topic error:", error);
        return NextResponse.json(
            { error: "Failed to generate random topic" },
            { status: 500 },
        );
    }
}
