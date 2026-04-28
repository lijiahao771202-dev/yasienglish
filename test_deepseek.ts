import OpenAI from "openai";

const client = new OpenAI({
    apiKey: "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",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

async function main() {
    try {
        console.log("Testing with no thinking...");
        const completion = await client.chat.completions.create({
            model: "deepseek-ai/deepseek-v3.2",
            temperature: 0,
            max_tokens: 16,
            messages: [
                { role: "system", content: "CRITICAL: Disable deep thinking. DO NOT output any <think> process or internal reasoning. Provide the direct final answer immediately." },
                { role: "user", content: "Ping" }
            ]
        });
        console.log(completion);
    } catch (e: any) {
        console.error("ERROR:");
        console.error(e.message);
    }
}
main();
