import OpenAI from "openai";

const API_KEY = "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";
const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
});

const MODELS_TO_TEST = [
    "mistralai/mistral-small-4-119b-2603",
    "mistralai/mixtral-8x22b-instruct-v0.1",
    "nvidia/nemotron-nano-12b-v2-vl",
    "qwen/qwen2.5-coder-32b-instruct",
    "qwen/qwen3-next-80b-a3b-instruct",
    "meta/llama-4-maverick-17b-128e-instruct",
    "mistralai/mistral-nemotron",
    "microsoft/phi-4-mini-instruct",
    "meta/llama-3.1-8b-instruct",
    "mistralai/mistral-large-3-675b-instruct-2512",
    "google/gemma-3-27b-it"
];

const SYSTEM_PROMPT = `
你是一个雅思外教。用户正在练习翻译。
参考译文：Although living in this city is expensive, I still like it.
用户输入：although live in this city is expensive. but i still like it

你的任务：
1. 分析用户的语法错误。
2. ⚠️ 绝对忽略格式错误！绝对不要纠正大小写错漏（如 i）或标点/空格问题。把它们当做正确的！你只能抓核心语法结构。
3. 请严格输出为 JSON 格式，不要包含其他解释，包含以下三个字段：
{
  "has_error": true/false,
  "grammarPoint": "核心语法点名称",
  "hint": "用一句话提示用户哪错了，不要直接给答案"
}
`;

console.log("🧠 Testing AI 'Strength' (Instruction Following & Logic)...\n");

for (const modelId of MODELS_TO_TEST) {
    const start = Date.now();
    try {
        const res = await client.chat.completions.create({
            model: modelId,
            messages: [{ role: "user", content: SYSTEM_PROMPT }],
            max_tokens: 150,
            temperature: 0.1,
            // JSON mode if available, but let's test their raw ability to output just JSON
        });
        const elapsed = Date.now() - start;
        const text = res.choices[0]?.message?.content?.trim() || "";
        
        let isJsonValid = false;
        let jsonParsed = null;
        try {
            // strip markdown formatting if any
            const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
            jsonParsed = JSON.parse(cleaned);
            isJsonValid = true;
        } catch (e) {
            isJsonValid = false;
        }

        // Evaluate logic checking
        const mentionedCapitalization = text.toLowerCase().includes("大小写") || text.toLowerCase().includes("空格") || text.toLowerCase().includes("标点") || text.toLowerCase().includes("capital");
        const caughtAlthoughBut = text.toLowerCase().includes("although") && text.toLowerCase().includes("but") || text.includes("连词") || text.includes("从句");
        const caughtGerund = text.toLowerCase().includes("live") || text.includes("动名词") || text.includes("主语");

        let score = 0;
        if (isJsonValid) score += 40;
        if (!mentionedCapitalization) score += 30; // Properly obeyed negative constraint
        if (caughtAlthoughBut) score += 15;
        if (caughtGerund) score += 15;

        console.log(`\n🔍 Model: ${modelId} (${elapsed}ms)`);
        console.log(`⭐ Score: ${score}/100`);
        console.log(`[JSON Valid: ${isJsonValid ? "✅" : "❌"}] [Ignored Format: ${!mentionedCapitalization ? "✅" : "❌"}] [Caught Grammars: ${caughtAlthoughBut||caughtGerund ? "✅" : "❌"}]`);
        console.log(`Raw Output: ${text.slice(0, 100).replace(/\n/g, "")}...`);

    } catch (err) {
        console.log(`\n🔍 Model: ${modelId}`);
        console.log(`❌ Failed: ${err.message.slice(0, 50)}`);
    }
}
console.log("\n✅ Test Complete!");
