import { NextRequest } from "next/server";
import { deepseek } from "@/lib/deepseek";

export const runtime = "edge";

export async function POST(req: NextRequest) {
    try {
        const { systemPrompt, history = [], userMessage } = await req.json();

        if (!userMessage || !systemPrompt) {
            return new Response("Missing parameters", { status: 400 });
        }

        const messages: any[] = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: userMessage }
        ];

        const completionResponse = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages,
            temperature: 0.35,
            stream: true,
        });

        // Convert the OpenAI stream into a standard Web ReadableStream
        const stream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of completionResponse as any) {
                        const content = chunk.choices[0]?.delta?.content || "";
                        if (content) {
                            controller.enqueue(encoder.encode(content));
                        }
                    }
                    controller.close();
                } catch (error) {
                    controller.error(error);
                }
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        });
    } catch (error) {
        console.error("[coach_stream] Error:", (error as Error).message);
        return new Response("Internal Server Error", { status: 500 });
    }
}
