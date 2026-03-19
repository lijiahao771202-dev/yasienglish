import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

type Difficulty = "cet4" | "cet6" | "ielts";

interface DifficultyConfig {
    label: string;
    vocabLevel: string;
    sentenceStyle: string;
    wordRange: string;
    topicGuidance: string;
    cefrLevel: string;
}

const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
    cet4: {
        label: "CET-4 (大学英语四级)",
        vocabLevel: "around 4,000 words, using common everyday vocabulary",
        sentenceStyle: "mostly simple and compound sentences, with clear and direct expression",
        wordRange: "300-400 words",
        topicGuidance: "daily life, campus, travel, technology basics, health",
        cefrLevel: "B1-B2",
    },
    cet6: {
        label: "CET-6 (大学英语六级)",
        vocabLevel: "around 6,000 words, including more formal and semi-academic vocabulary",
        sentenceStyle: "complex sentences with passive voice, relative clauses, and varied transitions",
        wordRange: "400-500 words",
        topicGuidance: "social issues, economics, education reform, environment, psychology",
        cefrLevel: "B2-C1",
    },
    ielts: {
        label: "IELTS Academic",
        vocabLevel: "8,000+ words, incorporating advanced academic vocabulary and idiomatic expressions",
        sentenceStyle: "sophisticated sentence structures with nominalizations, hedging language, and academic discourse markers",
        wordRange: "500-700 words",
        topicGuidance: "urbanization, globalization, scientific ethics, cultural heritage, artificial intelligence and society",
        cefrLevel: "C1-C2",
    },
};

export async function POST(req: Request) {
    try {
        const { topic, difficulty = "ielts" } = await req.json();

        if (!topic) {
            return NextResponse.json(
                { error: "Topic is required" },
                { status: 400 }
            );
        }

        const diff = (difficulty as string).toLowerCase();
        const config =
            DIFFICULTY_CONFIGS[diff as Difficulty] ?? DIFFICULTY_CONFIGS.ielts;

        const prompt = `
You are an expert English content writer specializing in exam-level reading materials.
Write a high-quality, engaging article about "${topic}".

DIFFICULTY REQUIREMENTS (${config.label}, CEFR ${config.cefrLevel}):
- Vocabulary level: ${config.vocabLevel}
- Sentence complexity: ${config.sentenceStyle}
- Article length: ${config.wordRange}
- Suggested tone/topics: ${config.topicGuidance}

CONTENT GUIDELINES:
- The article must be factually grounded and intellectually stimulating.
- Use varied paragraph lengths for natural reading rhythm.
- Include a compelling introduction and a thoughtful conclusion.
- Incorporate key vocabulary naturally without being forced.

Provide the response in JSON format:
{
  "title": "A catchy, exam-appropriate title",
  "content": "Full article text with paragraphs separated by double newlines.",
  "byline": "AI Generator · ${config.label}",
  "wordCount": <approximate word count as integer>
}
`;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content);

        // Format for frontend
        const blocks = result.content
            .split("\n\n")
            .map((p: string) => ({
                type: "paragraph",
                content: p.trim(),
            }))
            .filter((b: { content: string }) => b.content);

        return NextResponse.json({
            ...result,
            blocks,
            textContent: result.content,
            difficulty: diff,
            isAIGenerated: true,
        });
    } catch (error) {
        console.error("Generation API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate article" },
            { status: 500 }
        );
    }
}
