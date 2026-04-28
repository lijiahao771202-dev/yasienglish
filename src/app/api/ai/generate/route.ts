import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import { pickAIGenerationTopicSeed } from "@/lib/content-topic-pool";

type Difficulty = "cet4" | "cet6" | "ielts";

interface DifficultyConfig {
    label: string;
    vocabLevel: string;
    sentenceStyle: string;
    wordRange: string;
    topicGuidance: string;
    cefrLevel: string;
}

interface GenerationTheme {
    id: string;
    name: string;
    lens: string;
    narrativeConstraint: string;
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

const GENERATION_THEMES: GenerationTheme[] = [
    {
        id: "field-note",
        name: "田野记录",
        lens: "Write as if observing a real-world scene with concrete details and human behavior.",
        narrativeConstraint: "Use at least one vivid sensory detail, but keep style exam-friendly and objective.",
    },
    {
        id: "future-letter",
        name: "未来书信",
        lens: "Frame the article as practical advice to a near-future learner or citizen.",
        narrativeConstraint: "Keep tone rational, avoid sci-fi exaggeration, and end with one actionable takeaway.",
    },
    {
        id: "debate-brief",
        name: "辩论简报",
        lens: "Present two competing viewpoints and evaluate tradeoffs with evidence.",
        narrativeConstraint: "Balance both sides before concluding; avoid one-sided preaching.",
    },
    {
        id: "myth-vs-fact",
        name: "迷思与事实",
        lens: "Start from a common misconception, then correct it with grounded explanation.",
        narrativeConstraint: "Include one explicit myth statement and one evidence-backed correction.",
    },
    {
        id: "case-spotlight",
        name: "案例聚焦",
        lens: "Center the article on a compact case study and extract general lessons.",
        narrativeConstraint: "Case should stay realistic and concise; no fictional named characters.",
    },
    {
        id: "micro-history",
        name: "微历史线",
        lens: "Use a short timeline (past -> present -> near future) to explain change.",
        narrativeConstraint: "Keep timeline clear and avoid excessive dates or statistics.",
    },
    {
        id: "system-map",
        name: "系统地图",
        lens: "Explain how multiple factors interact in a system rather than isolated points.",
        narrativeConstraint: "Use clear connectors (cause, feedback, tradeoff) without overcomplication.",
    },
    {
        id: "daily-decision",
        name: "日常决策",
        lens: "Anchor the topic in recurring decisions people make in study/work/life.",
        narrativeConstraint: "Include one practical decision framework in plain language.",
    },
];

function pickRandomGenerationTheme() {
    return GENERATION_THEMES[Math.floor(Math.random() * GENERATION_THEMES.length)] ?? GENERATION_THEMES[0];
}

export async function POST(req: Request) {
    try {
        const { topic, difficulty = "ielts", injectedVocabulary = [] } = await req.json();

        const diff = (difficulty as string).toLowerCase();
        const config =
            DIFFICULTY_CONFIGS[diff as Difficulty] ?? DIFFICULTY_CONFIGS.ielts;
        const safeDifficulty: Difficulty =
            diff === "cet4" || diff === "cet6" || diff === "ielts" ? diff : "ielts";
        const topicSeed = pickAIGenerationTopicSeed({
            difficulty: safeDifficulty,
            userTopic: typeof topic === "string" ? topic : "",
        });
        const generationTheme = pickRandomGenerationTheme();
        const diversitySeed = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

        const injectedVocabSection = Array.isArray(injectedVocabulary) && injectedVocabulary.length > 0
            ? `\nREFERENCE LEXICAL POOL (HIGHLY RECOMMENDED REFERENCE):
To ensure authentic difficulty for this specific CEFR level, you are provided with a Reference Lexical Pool retrieved from validated corpus.
You should draw from this pool whenever natural. This is a HIGHLY RECOMMENDED reference, not a strict mandatory checklist out of context. Pick the ones that fit your sentence structure naturally:
- Reference Pool: ${injectedVocabulary.slice(0, 50).join(", ")}\n`
            : "";

        const prompt = `
You are an expert English content writer specializing in exam-level reading materials.
Write a high-quality, engaging article about "${topicSeed.topicLine}".

DIFFICULTY REQUIREMENTS (${config.label}, CEFR ${config.cefrLevel}):
- Vocabulary level: ${config.vocabLevel}
- Sentence complexity: ${config.sentenceStyle}
- Article length: ${config.wordRange}
- Suggested tone/topics: ${config.topicGuidance}

TOPIC INJECTION (must apply this generation):
- Domain: ${topicSeed.domainLabel}
- Subtopic: ${topicSeed.subtopicLabel}
- Angle: ${topicSeed.angle}

RANDOMIZED THEME INJECTION (must apply this generation):
- Theme name: ${generationTheme.name}
- Writing lens: ${generationTheme.lens}
- Constraint: ${generationTheme.narrativeConstraint}
- Diversity seed: ${diversitySeed}
${injectedVocabSection}
CONTENT GUIDELINES:
- The article must be factually grounded and intellectually stimulating.
- Use varied paragraph lengths for natural reading rhythm.
- Include a compelling introduction and a thoughtful conclusion.
- Incorporate key vocabulary naturally without being forced.
- Avoid repeating stock openings or identical paragraph skeletons.

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
            difficulty: safeDifficulty,
            isAIGenerated: true,
            topicSeed,
            generationTheme: {
                id: generationTheme.id,
                name: generationTheme.name,
            },
            model: "deepseek-chat",
        });
    } catch (error) {
        console.error("Generation API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate article" },
            { status: 500 }
        );
    }
}
