import OpenAI from "openai";

const API_KEY = "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";
const client = new OpenAI({
    apiKey: API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
});

async function run() {
    const GPT_OSS_MODELS = [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b"
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

    console.log("🔥 Benchmarking GPT OSS Models on NVIDIA NIM...\n");
    console.log("=".repeat(100));

    for (const modelId of GPT_OSS_MODELS) {
        const start = Date.now();
        try {
            const res = await client.chat.completions.create({
                model: modelId,
                messages: [{ role: "user", content: SYSTEM_PROMPT }],
                max_tokens: 150,
                temperature: 0.1,
            });
            const elapsed = Date.now() - start;
            const text = res.choices[0]?.message?.content?.trim() || "";
            
            let isJsonValid = false;
            let jsonParsed = null;
            try {
                const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
                jsonParsed = JSON.parse(cleaned);
                isJsonValid = true;
            } catch (e) {
                isJsonValid = false;
            }

            const mentionedCapitalization = text.toLowerCase().includes("大小写") || text.toLowerCase().includes("空格") || text.toLowerCase().includes("标点") || text.toLowerCase().includes("capital");
            const caughtAlthoughBut = text.toLowerCase().includes("although") || text.toLowerCase().includes("but") || text.includes("连词") || text.includes("从句");
            const caughtGerund = text.toLowerCase().includes("live") || text.includes("动名词") || text.includes("主语") || text.includes("谓语");

            let score = 0;
            if (isJsonValid) score += 40;
            if (!mentionedCapitalization) score += 30; 
            if (caughtAlthoughBut) score += 15;
            if (caughtGerund) score += 15;

            console.log(`🚀 Model: ${modelId}`);
            console.log(`⏱️ Latency: ${elapsed}ms`);
            console.log(`⭐ Score: ${score}/100`);
            console.log(`📊 Checks: [JSON: ${isJsonValid ? "✅" : "❌"}] [Ignored Format: ${!mentionedCapitalization ? "✅" : "❌"}] [Caught Grammars: ${caughtAlthoughBut||caughtGerund ? "✅" : "❌"}]`);
            console.log(`📝 Output Preview: ${text.replace(/\n/g, "").slice(0, 80)}...`);
            console.log("-".repeat(100));

        } catch (err) {
            console.log(`🚀 Model: ${modelId}`);
            console.log(`❌ Failed: ${err.message}`);
            console.log("-".repeat(100));
        }
    }
}

run();
