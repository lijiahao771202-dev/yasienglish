// Test NVIDIA NIM API response speed for all configured models
import OpenAI from "openai";

const API_KEY = "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";

const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
});

const MODELS = [
    "z-ai/glm5",
    "z-ai/glm4.7",
    "deepseek-ai/deepseek-v3.2",
    "qwen/qwen3.5-397b-a17b",
    "moonshotai/kimi-k2.5",
    "minimaxai/minimax-m2.7",
    "google/gemma-4-31b-it",
    "meta/llama-3.1-70b-instruct",
    "meta/llama-4-maverick-17b-128e-instruct",
];

const TEST_PROMPT = "Translate to English in one sentence: 随着人工智能工具的普及，许多传统技能面临重新评估。";

async function testModel(modelId) {
    const start = Date.now();
    try {
        const res = await client.chat.completions.create({
            model: modelId,
            messages: [{ role: "user", content: TEST_PROMPT }],
            max_tokens: 80,
            temperature: 0.3,
        });
        const elapsed = Date.now() - start;
        const text = res.choices[0]?.message?.content?.slice(0, 60) || "(empty)";
        return { modelId, elapsed, status: "✅", text };
    } catch (err) {
        const elapsed = Date.now() - start;
        const msg = err.message?.slice(0, 50) || "unknown error";
        return { modelId, elapsed, status: "❌", text: msg };
    }
}

console.log("🚀 Testing NVIDIA NIM models speed...\n");
console.log("Model".padEnd(45) + "Time(ms)".padEnd(10) + "Status  Preview");
console.log("-".repeat(120));

// Test sequentially to avoid rate limiting
for (const m of MODELS) {
    const r = await testModel(m);
    const line = r.modelId.padEnd(45) + String(r.elapsed + "ms").padEnd(10) + r.status + "  " + r.text;
    console.log(line);
}

console.log("\n✅ Done!");
