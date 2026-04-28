const models = [
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

async function test() {
  console.log("Starting connectivity test for 9 models...\n");
  for (const m of models) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      const r = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer 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',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: m,
          messages: [{role: 'user', content: 'Ping'}],
          temperature: 0,
          max_tokens: 5,
        }),
        signal: controller.signal
      });
      clearTimeout(id);
      
      const text = await r.text();
      let outcome = "";
      if (r.ok) {
        outcome = "✅ SUCCESS (200 OK)";
      } else {
        try {
          const js = JSON.parse(text);
          outcome = `❌ FAILED (${r.status}): ${js.detail || js.error?.message || text.slice(0, 50)}`;
        } catch(e) {
          outcome = `❌ FAILED (${r.status}): ${text.slice(0, 50)}...`;
        }
      }
      console.log(`[${m}]\n   -> ${outcome}\n`);
    } catch (e) {
      if (e.message.includes('abort') || e.name === 'AbortError') {
        console.log(`[${m}]\n   -> ❌ FAILED: Timeout after 8 seconds\n`);
      } else {
        console.log(`[${m}]\n   -> ❌ FAILED (Network/Socket Error): ${e.message.split('\n')[0]}\n`);
      }
    }
  }
}
test();
