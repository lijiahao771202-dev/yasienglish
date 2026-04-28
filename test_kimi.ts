import OpenAI from "openai";

const client = new OpenAI({
    apiKey: "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",
    baseURL: "https://integrate.api.nvidia.com/v1",
});

async function main() {
    try {
        console.log("Testing kimi-k2.5...");
        const completion = await client.chat.completions.create({
            model: "moonshotai/kimi-k2.5",
            temperature: 0,
            max_tokens: 16,
            messages: [{ role: "user", content: "Ping" }]
        });
        console.log(completion);
    } catch (e: any) {
        console.error("ERROR:");
        console.error(e.message);
    }
}
main();
