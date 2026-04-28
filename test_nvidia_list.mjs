// List all available models on NVIDIA NIM and then speed-test promising ones
import OpenAI from "openai";

const API_KEY = "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";
const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
});

// Step 1: List all models
console.log("📋 Fetching all available NVIDIA NIM models...\n");
try {
    const models = await client.models.list();
    const chatModels = [];
    for await (const m of models) {
        chatModels.push(m.id);
    }
    chatModels.sort();
    console.log(`Found ${chatModels.length} models total:\n`);
    chatModels.forEach(id => console.log("  " + id));
    
    // Step 2: Filter for likely-fast chat models (skip image/embedding/audio models)
    const skipPatterns = [
        "embed", "rerank", "vlm", "vision", "image", "audio", "whisper", 
        "sdxl", "stable-diffusion", "cosmos", "nemo-customize", "nemotron-steerlm",
        "grounding", "parakeet", "canary", "neva", "video", "fuyu", "kosmos",
        "phi-3-vision", "deplot", "paligemma", "molmo"
    ];
    
    const chatCandidates = chatModels.filter(id => {
        const lower = id.toLowerCase();
        return !skipPatterns.some(p => lower.includes(p));
    });
    
    console.log(`\n\n🎯 Chat model candidates to speed-test: ${chatCandidates.length}`);
    console.log(chatCandidates.map(c => "  " + c).join("\n"));
    
    // Step 3: Speed test candidates
    const TEST_PROMPT = "Translate: 随着人工智能的普及，传统技能面临重新评估。 Reply in one sentence only.";
    
    // Already tested these, skip them
    const alreadyTested = [
        "z-ai/glm5", "z-ai/glm4.7", "deepseek-ai/deepseek-v3.2",
        "qwen/qwen3.5-397b-a17b", "moonshotai/kimi-k2.5", "minimaxai/minimax-m2.7",
        "google/gemma-4-31b-it", "meta/llama-3.1-70b-instruct", 
        "meta/llama-4-maverick-17b-128e-instruct"
    ];
    
    const toTest = chatCandidates.filter(id => !alreadyTested.includes(id));
    
    console.log(`\n\n🚀 Speed testing ${toTest.length} new models...\n`);
    console.log("Model".padEnd(55) + "Time(ms)".padEnd(10) + "Status");
    console.log("-".repeat(80));
    
    const results = [];
    for (const modelId of toTest) {
        const start = Date.now();
        try {
            const res = await client.chat.completions.create({
                model: modelId,
                messages: [{ role: "user", content: TEST_PROMPT }],
                max_tokens: 60,
                temperature: 0.3,
            });
            const elapsed = Date.now() - start;
            const text = res.choices[0]?.message?.content?.slice(0, 40) || "(empty)";
            console.log(modelId.padEnd(55) + String(elapsed + "ms").padEnd(10) + "✅  " + text);
            results.push({ modelId, elapsed, ok: true });
        } catch (err) {
            const elapsed = Date.now() - start;
            const msg = err.status ? `${err.status}` : err.message?.slice(0, 30) || "error";
            console.log(modelId.padEnd(55) + String(elapsed + "ms").padEnd(10) + "❌  " + msg);
            results.push({ modelId, elapsed, ok: false });
        }
    }
    
    // Summary: only successful, sorted by speed
    const fast = results.filter(r => r.ok).sort((a, b) => a.elapsed - b.elapsed);
    console.log("\n\n🏆 === SPEED LEADERBOARD (successful only) ===\n");
    fast.forEach((r, i) => {
        const badge = r.elapsed < 1500 ? "⚡" : r.elapsed < 3000 ? "🔥" : r.elapsed < 6000 ? "✅" : "🐢";
        console.log(`  ${i+1}. ${badge} ${r.modelId.padEnd(50)} ${r.elapsed}ms`);
    });
    
} catch (err) {
    console.error("Failed to list models:", err.message);
}
