import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { chinese, reference_english, elo = 600 } = await req.json();

        if (!chinese || !reference_english) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const level = elo < 800 ? 'Beginner (A1-A2)' : elo < 1600 ? 'Intermediate (B1-B2)' : 'Advanced (C1-C2)';

        const prompt = `
        You are an expert English teacher for Chinese IELTS students with WEAK foundations.
        
        Student Level: ${level} (Elo: ${elo})
        Chinese Sentence: "${chinese}"
        Reference English: "${reference_english}"
        
        Create a comprehensive teaching card. ALL text in **Simplified Chinese (简体中文)**.
        
        Output JSON with this EXACT structure:
        {
            "sentence_breakdown": {
                "parts": [
                    { "chinese": "我", "english": "I", "role": "主语" },
                    { "chinese": "昨天", "english": "yesterday", "role": "时间状语" },
                    { "chinese": "去了", "english": "went to", "role": "谓语（过去式）" },
                    { "chinese": "超市", "english": "the supermarket", "role": "宾语" }
                ],
                "structure_hint": "主语 + 时间 + 动词过去式 + 地点"
            },
            "key_vocab": [
                {
                    "word": "supermarket",
                    "phonetic": "/ˈsuːpərˌmɑːrkɪt/",
                    "chinese": "超市",
                    "example": "I go to the supermarket every week.",
                    "root": "super(超级) + market(市场) = 大型市场",
                    "synonyms": ["shop", "store", "grocery"],
                    "collocations": ["go to the ~", "at the ~", "near the ~"]
                }
            ],
            "grammar_point": {
                "title": "一般过去时",
                "rule": "描述过去发生的事情，动词要变成过去式。",
                "examples": [
                    { "chinese": "我吃了苹果", "english": "I ate an apple.", "highlight": "ate (eat的过去式)" }
                ],
                "common_mistakes": "I go to school yesterday. → I went to school yesterday."
            },
            "chinglish_alerts": [
                {
                    "wrong": "I yesterday go to supermarket",
                    "correct": "I went to the supermarket yesterday",
                    "explanation": "中文语序是'我+昨天+去'，但英文中时间副词通常放句尾"
                }
            ],
            "memory_anchor": "去(go)的过去式 went —— 想象'弯(wan)了腰走过去' → went！",
            "translation_tips": [
                "先确定时态：'昨天' → 过去时",
                "注意 go 的过去式是 went（不规则变化）"
            ]
        }
        
        IMPORTANT RULES:
        1. "chinglish_alerts" must have 1-2 items showing common Chinese-English translation mistakes for THIS sentence.
        2. "memory_anchor" must be a creative, memorable mnemonic (口诀/联想/谐音) for the HARDEST word or grammar point.
        3. "key_vocab[].root" must break down the word into meaningful parts (prefix/root/suffix). If the word is simple (e.g. "happy"), explain its origin briefly.
        4. "key_vocab[].synonyms" must list 2-3 similar words.
        5. "key_vocab[].collocations" must list 2-3 common word combinations using "~" as placeholder.
        6. Keep ALL explanations in Simplified Chinese. Be encouraging and simple.
        `;

        // Retry wrapper for unstable DeepSeek API
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;
        let completion: any = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                completion = await deepseek.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: "You are a patient, encouraging English teacher. Output valid JSON only. All explanations in Simplified Chinese."
                        },
                        { role: "user", content: prompt }
                    ],
                    model: "deepseek-chat",
                    response_format: { type: "json_object" },
                    temperature: 0.5,
                });
                break;
            } catch (error) {
                lastError = error as Error;
                console.log(`[Teach API] Attempt ${attempt} failed: ${lastError.message}`);
                if (attempt < MAX_RETRIES) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                }
            }
        }

        if (!completion) {
            throw lastError || new Error("Failed after retries");
        }

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const data = JSON.parse(content);
        return NextResponse.json(data);

    } catch (error: any) {
        console.error("Teach API Error:", error?.message || error);
        return NextResponse.json(
            { error: "Failed to generate teaching content" },
            { status: 500 }
        );
    }
}
