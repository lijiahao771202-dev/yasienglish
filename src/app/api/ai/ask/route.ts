import { deepseek } from "@/lib/deepseek";

export const runtime = "edge"; // Enable Edge Runtime for streaming

export async function POST(req: Request) {
    try {
        const { text, question, selection } = await req.json();

        if (!text || !question) {
            return new Response(JSON.stringify({ error: "Text and question are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        // Build enhanced prompt
        const focusContext = selection
            ? `User has highlighted this specific part: "${selection}". Focus your answer on explaining THIS phrase/sentence within the context.`
            : "";

        const prompt = `
You are an expert English tutor and linguist. Your task is to help a Chinese learner understand English text.

Context Paragraph:
"""
${text}
"""

${focusContext}

User Question: "${question}"

Instructions:
1. Answer in **Simplified Chinese (简体中文)**.
2. Be concise but thorough.
3. If explaining grammar, clearly label the structure (e.g., 主语, 谓语, 定语从句).
4. If explaining vocabulary, mention common usages or collocations.
5. Use Markdown formatting where helpful (bold, lists).
6. If the answer cannot be found in the paragraph, say so politely.
`;

        const stream = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            temperature: 0.4,
            stream: true, // Enable streaming
        });

        // Create a ReadableStream for SSE
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content;
                        if (content) {
                            // SSE format: data: <content>\n\n
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                        }
                    }
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (err) {
                    controller.error(err);
                }
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("Ask AI Error:", error);
        return new Response(JSON.stringify({ error: "Failed to get answer" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
