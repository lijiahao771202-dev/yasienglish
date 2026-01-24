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

            OBJECTIVE:
            1. Split the paragraph into individual sentences. You MUST include EVERY sentence.
            2. For EACH sentence, provide a natural Chinese translation.
            3. CRITICAL: Analyze the sentence structure exhaustively. **EVERY part of the sentence must be tagged.**
               - Identify the Main Components: Subject (主语), Predicate/Verb (谓语), Object (宾语/表语).
               - Identify Modifiers: Adjectives/Attributives (定语), Adverbs/Adverbials (状语), Complements (补语), Appositives (同位语).
               - Identify Connectors/Prepositions: Conjunctions (连词), Prepositions (介词).
               - Identify Clauses: Relative Clause (定语从句), Noun Clause (名词性从句), etc.

            OUTPUT FORMAT (JSON):
            {
                "tags": ["Tag1", "Tag2"], 
                "overview": "Brief summary",
                "difficult_sentences": [
                    {
                        "sentence": "Exact substring from text",
                        "translation": "Chinese translation",
                        "highlights": [
                            {
                                "substring": "exact substring",
                                "type": "主语",
                                "explanation": "Explanation",
                                "segment_translation": "Translation"
                            },
                            {
                                "substring": "exact substring",
                                "type": "定语",
                                "explanation": "Explanation",
                                "segment_translation": "Translation"
                            }
                            // ... Ensure the UNION of all 'substring's covers the entire sentence as much as possible.
                        ]
                    }
                ]
            }
            
            IMPORTANT: 
            1. The "difficult_sentences" array MUST contain ALL sentences in the paragraph, in order.
            2. "sentence" MUST be an EXACT substring of the original text.
            3. **FULL COVERAGE**: Try to assign a tag to every significant chunk of the sentence. Do not leave large gaps.
            4. **HIERARCHY**: If a phrase is a "Clause", tag the whole clause. Inside it, you can optionally tag sub-components if relevant, but prioritization is:
               - Top level structure (e.g., Main Clause, Dependent Clause) FIRST.
               - OR: Constituent parts (Subject, Verb, Object) covering the whole text.
            5. "type" MUST be in Simplified Chinese.
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
