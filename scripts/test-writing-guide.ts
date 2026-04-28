/**
 * Quick test: Can DeepSeek return writingGuide data?
 * Uses fetch to call the local Next.js API route (which handles DeepSeek proxy).
 * Run: npx tsx scripts/test-writing-guide.ts
 */

const LOCAL_BASE = "http://localhost:3000";

const testCases = [
    {
        chinese: "他在这家公司工作了三年了。",
        reference: "He has been working at this company for three years.",
    },
    {
        chinese: "如果我早知道这个会议，我就会参加了。",
        reference: "If I had known about the meeting, I would have attended it.",
    },
    {
        chinese: "这本书被翻译成了二十多种语言。",
        reference: "This book has been translated into more than twenty languages.",
    },
];

const SYSTEM_PROMPT = `你是一个英语教学助手。给定一个中文句子和它的英文参考翻译，生成"造句引导"数据。

要求：
1. 将参考英文按语法成分拆成 3-5 个步骤
2. 每个步骤包含：词索引范围(range)、中文标签(label)、提示(hint)
3. 识别核心语法点(grammarPoint)
4. 严格返回 JSON，不要附加任何其他文字

JSON 格式：
{
  "steps": [
    { "range": [起始词索引, 结束词索引], "label": "步骤标签", "hint": "中文提示" }
  ],
  "grammarPoint": "语法点名称",
  "grammarExplain": "一句话解释这个语法点"
}

注意：词索引是参考英文按空格拆分后的位置(从0开始)。`;

async function testWritingGuide() {
    for (const { chinese, reference } of testCases) {
        console.log("\n" + "=".repeat(60));
        console.log("中文:", chinese);
        console.log("参考英文:", reference);

        const words = reference.replace(/[.,!?]$/, "").split(/\s+/);
        console.log("词索引:", words.map((w, i) => `${i}:${w}`).join("  "));

        try {
            const res = await fetch(`${LOCAL_BASE}/api/ai/coach_stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemPrompt: SYSTEM_PROMPT,
                    history: [],
                    userMessage: `中文：${chinese}\n参考英文：${reference}`,
                }),
            });

            if (!res.ok) {
                console.error("API Error:", res.status, await res.text());
                continue;
            }

            const reader = res.body?.getReader();
            if (!reader) { console.error("No reader"); continue; }

            const decoder = new TextDecoder();
            let accumulated = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulated += decoder.decode(value, { stream: true });
            }

            console.log("\n--- 原始返回 ---");
            console.log(accumulated);

            // Try to extract JSON
            const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const guide = JSON.parse(jsonMatch[0]);
                    console.log("\n--- ✅ 解析成功 ---");
                    console.log("语法点:", guide.grammarPoint);
                    console.log("语法解释:", guide.grammarExplain);
                    console.log("步骤:");
                    for (const step of guide.steps) {
                        const stepWords = words.slice(step.range[0], step.range[1] + 1).join(" ");
                        console.log(`  ${step.label}: [${step.range}] "${stepWords}" → ${step.hint}`);
                    }
                } catch (e) {
                    console.error("JSON 解析失败:", e);
                }
            } else {
                console.log("未找到 JSON");
            }
        } catch (e) {
            console.error("请求失败:", e);
        }
    }
}

testWritingGuide().catch(console.error);
