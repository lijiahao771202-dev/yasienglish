import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { articleTitle, articleContent, difficulty = "Medium", mode = "translation" } = await req.json();

        if (!articleTitle) {
            return NextResponse.json(
                { error: "Article title is required" },
                { status: 400 }
            );
        }

        // Truncate content
        const snippet = articleContent ? articleContent.slice(0, 3000) : "";

        let difficultyPrompt = "";

        // Granular Difficulty Levels (1-5)
        const levelMap: Record<string, string> = {
            'Level 1': "Generate a BEGINNER sentence (CEFR A1/A2). Short, simple SVO structure. High-frequency vocabulary only (Top 1000 words). No complex tenses.",
            'Level 2': "Generate an ELEMENTARY sentence (CEFR A2/B1). Simple compound sentences (and/but). Common daily topics. Top 2000 vocabulary.",
            'Level 3': "Generate an INTERMEDIATE sentence (CEFR B1/B2). Standard professional English. Use relative clauses, passive voice, or conditionals. Top 4000 vocabulary.",
            'Level 4': "Generate an ADVANCED sentence (CEFR C1). Complex syntactic structures (inversion, subjunctive). Nuanced academic or formal vocabulary. abstract concepts.",
            'Level 5': "Generate an EXPERT sentence (CEFR C2). Native-level sophistication. Idiomatic expressions, subtle stylistic nuance, or dense information packing. Challenge even native speakers.",
            // Legacy fallbacks
            'Easy': "Generate a SIMPLE sentence (CEFR A2).",
            'Medium': "Generate an INTERMEDIATE sentence (CEFR B2).",
            'Hard': "Generate a CHALLENGING sentence (CEFR C1).",
        };

        difficultyPrompt = levelMap[difficulty] || levelMap['Level 3'];

        const isListening = mode === "listening";

        const prompt = `
        You are an expert IELTS English tutor. 
        Based on the following article snippet, generate a high-quality "${isListening ? "Listening Dictation" : "Translation Drill"}" for a student at ${difficulty} level.
        
        Article Title: "${articleTitle}"
        Snippet: "${snippet}"

        Constraint: ${difficultyPrompt}

        Task:
        1. Identify the core theme and 2-3 vocabulary words.
        ${isListening ?
                `2. Create a meaningful English sentence that reflects the theme. It should be challenging to listen to (e.g. linking sounds, detailed information).
         3. Provide the exact transcript as 'reference_english'.` :
                `2. Create a meaningful Chinese sentence that reflects the theme.
         3. Provide a 'Golden' English translation.`}
        
        Output strictly in JSON format:
        {
            "chinese": "${isListening ? "Listen to the audio and write down what you hear." : "The Chinese sentence challenge"}",
            "target_english_vocab": ["EnglishWord1", "EnglishWord2"],
            "reference_english": "The ideal English translation"
        }
        `;

        const completion = await deepseek.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful AI tutor. Output JSON only." },
                { role: "user", content: prompt }
            ],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
            temperature: 1.2,
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const data = JSON.parse(content);
        return NextResponse.json(data);

    } catch (error) {
        console.error("Generate Drill Error:", error);
        return NextResponse.json(
            { error: "Failed to generate drill" },
            { status: 500 }
        );
    }
}
