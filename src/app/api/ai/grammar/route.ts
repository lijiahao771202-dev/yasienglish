import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: Request) {
    try {
        const { text, mode = "basic" } = await req.json();

        if (!text) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 });
        }

        let prompt = "";

        if (mode === "deep") {
            // Deep Analysis Prompt (Existing complex logic)
            prompt = `
            Analyze the grammar of the following English paragraph for a Chinese native speaker learning English.
            
            Paragraph: "${text}"

            You MUST analyze EVERY single sentence in the paragraph. Do not skip any sentence.

            Provide the output in the following JSON format:
            {
                "difficult_sentences": [
                    {
                        "sentence": "The exact sentence from the text.",
                        "sentence_tree": {
                            "label": "主句 (Main Clause)",
                            "text": "Scientists were able to examine...",
                            "children": [
                                {
                                    "label": "方式状语 (Adverbial)",
                                    "text": "By bringing together data...",
                                    "children": []
                                }
                            ]
                        },
                        "analysis_results": [
                            {
                                "point": "非限制性定语从句",
                                "explanation": "which引导的从句修饰前面的整个句子，表示..."
                            }
                        ]
                    }
                ]
            }
            
            IMPORTANT: 
            1. Focus ONLY on deep structural analysis (sentence trees) and detailed grammatical point explanations.
            2. The 'label' in 'sentence_tree' MUST be in Simplified Chinese.
            3. 'analysis_results' MUST be detailed arrays.
            `;
        } else {
            // Basic Analysis Prompt (Faster, lighter)
            prompt = `
            Analyze the grammar of the following English paragraph for a Chinese native speaker learning English.
            
            Paragraph: "${text}"

            You MUST analyze EVERY single sentence in the paragraph. Do not skip any sentence.

            Provide the output in the following JSON format:
            {
                "tags": ["Tag1", "Tag2"], 
                "overview": "A brief summary of the grammatical complexity.",
                "difficult_sentences": [
                    {
                        "sentence": "The exact sentence from the text.",
                        "structure_tags": ["Relative Clause", "Passive Voice"],
                        "translation": "Natural Chinese translation.",
                        "highlights": [
                            {
                                "substring": "which tracked...", 
                                "type": "Relative Clause", 
                                "explanation": "Explanation for this specific part",
                                "segment_translation": "Direct translation of this segment"
                            }
                        ]
                    }
                ]
            }
            
            IMPORTANT: 
            1. Return an entry for EVERY sentence.
            2. 'type' in 'highlights' MUST be in Simplified Chinese (e.g., '定语从句', '谓语动词').
            3. **CRITICAL**: In 'highlights', you MUST identify and tag the CORE components: "主语" (Subject), "谓语" (Predicate/Verb), and "宾语" (Object).
            4. **CRITICAL**: 'explanation' should be detailed and educational. Don't just say "This is an appositive". Say "Appositive, explaining that dendritic spines are tiny protrusions... (同位语，进一步解释dendritic spines是...)". It must explain the FUNCTION and MEANING relation.
            5. Do NOT include 'sentence_tree' or detailed 'analysis_results' in this mode.
            `;
        }

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 0.3,
        });

        const content = completion.choices[0].message.content;
        if (!content) {
            throw new Error("No content received from AI");
        }

        const analysis = JSON.parse(content);
        return NextResponse.json(analysis);

    } catch (error) {
        console.error("Grammar Analysis Error:", error);
        return NextResponse.json({ error: "Failed to analyze grammar" }, { status: 500 });
    }
}
