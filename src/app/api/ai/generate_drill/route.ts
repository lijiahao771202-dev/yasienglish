import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { articleTitle, articleContent, difficultyModifier = "standard", mode = "translation" } = await req.json();

        if (!articleTitle) {
            return NextResponse.json(
                { error: "Article title is required" },
                { status: 400 }
            );
        }

        // Truncate content
        const snippet = articleContent ? articleContent.slice(0, 3000) : "";

        let difficultyPrompt = "";
        if (difficultyModifier === "easier") {
            difficultyPrompt = "The user finds the previous level too hard. Generate a SIMPLER sentence (CEFR B1/B2). Use common vacabulary.";
        } else if (difficultyModifier === "harder") {
            difficultyPrompt = "The user finds the previous level too easy. Generate a HARDER sentence (CEFR C1/C2). Use complex structure and rare vocabulary.";
        } else {
            difficultyPrompt = "Generate a standard advanced (B2/C1) level sentence.";
        }

        const isListening = mode === "listening";

        const prompt = `
        You are an expert IELTS English tutor. 
        Based on the following article snippet, generate a high-quality "${isListening ? "Listening Dictation" : "Translation Drill"}" for an advanced student.
        
        Article Title: "${articleTitle}"
        Snippet: "${snippet}"

        User Difficulty Request: ${difficultyPrompt}

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
