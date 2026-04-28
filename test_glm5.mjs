import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "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",
  baseURL: "https://integrate.api.nvidia.com/v1",
});

const prompt = `你是一个英语教练。请用中文简短解释以下句子的语法结构和核心词汇：
"The committee has been deliberating over the proposed amendments for several hours, yet no consensus has emerged."
要求：1) 时态分析 2) 核心词汇释义 3) 句式结构`;

console.log("Testing z-ai/glm5 via NVIDIA API...\n");

const t1 = Date.now();
const result = await client.chat.completions.create({
  model: "z-ai/glm5",
  messages: [{ role: "user", content: prompt }],
  max_tokens: 512,
});
const elapsed1 = Date.now() - t1;
const tokens1 = result.usage?.completion_tokens ?? "?";
console.log("Non-streaming: " + elapsed1 + "ms | " + tokens1 + " tokens");
console.log("Speed: " + (tokens1 !== "?" ? (tokens1 / (elapsed1 / 1000)).toFixed(1) : "?") + " tok/s");
console.log("\n--- Response ---");
console.log(result.choices[0]?.message?.content?.slice(0, 500));

console.log("\n--- Streaming test ---");
const t2 = Date.now();
let ttft = null;
let streamTokens = 0;
const stream = await client.chat.completions.create({
  model: "z-ai/glm5",
  messages: [{ role: "user", content: prompt }],
  max_tokens: 512,
  stream: true,
});
for await (const chunk of stream) {
  if (!ttft && chunk.choices?.[0]?.delta?.content) {
    ttft = Date.now() - t2;
  }
  if (chunk.choices?.[0]?.delta?.content) streamTokens++;
}
const elapsed2 = Date.now() - t2;
console.log("Streaming: " + elapsed2 + "ms total | TTFT = " + ttft + "ms | ~" + streamTokens + " chunks");
console.log("Speed: ~" + (streamTokens / (elapsed2 / 1000)).toFixed(1) + " tok/s");
