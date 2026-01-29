import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";

export async function POST(req: NextRequest) {
    try {
        const { articleTitle, articleContent, difficulty, eloRating, mode = "translation", bossType } = await req.json();

        // Determine if this is a Scenario Drill (no content) or Article Drill
        const isScenario = !articleContent || articleContent.length < 50;

        if (!articleTitle && !isScenario) {
            return NextResponse.json({ error: "Article title is required" }, { status: 400 });
        }

        // Truncate content if exists
        const snippet = articleContent ? articleContent.slice(0, 3000) : "";

        // Dynamic Elo Prompt Engineering
        let currentElo = eloRating || 1200;

        // RUSSIAN ROULETTE DEATH LOGIC
        if (bossType === 'roulette_execution') {
            currentElo = 2400; // Force C1/C2 Difficulty
        }

        const difficultyScale = mode === 'listening' ? `
        LISTENING SCALE (Focus on Echoing/Memory):
        - 800 (A1): Very slow, isolated words. No linking sounds.
        - 1200 (A2): Simple daily sentences. Clear enunciation.
        - 1600 (B1): Natural speed conversational. Some linking sounds.
        - 2000 (B2): Fast news anchor speed. Complex information density.
        - 2400 (C1): Rapid native debate. Multiple speakers style. Idiomatic speed.
        ` : `
        TRANSLATION SCALE (Focus on Grammar/Reading):
        - 800 (A1): Simple SVO sentences, top 500 words.
        - 1200 (A2): Compound sentences, daily topics, top 1500 words.
        - 1600 (B1): Relative clauses, passive voice, top 3000 words.
        - 2000 (B2): Abstract topics, conditionals, top 5000 words.
        - 2400 (C1): Sophisticated/Academic, inversion, nuanced vocabulary.
        `;

        let specificInstruction = "";

        if (mode === 'listening') {
            // LISTENING MODE: Shorter, Memory-Focused limits
            if (currentElo < 1000) specificInstruction = "Strictly beginner. Very short phrase (5-8 words). Slow and clear.";
            else if (currentElo < 1400) specificInstruction = "Elementary. One clear sentence (10-15 words).";
            else if (currentElo < 1800) specificInstruction = "Intermediate. One complex sentence or two short ones (15-25 words).";
            else if (currentElo < 2200) specificInstruction = "Upper Intermediate. News-style brevity (25-35 words). Focus on density.";
            else specificInstruction = "Advanced. Max 35-45 words. High information density but keep it retainable.";

            specificInstruction += " For Listening: Content must be 'echo-able' from short-term memory.";
        } else {
            // TRANSLATION MODE: Longer, Grammar-Focused limits
            if (currentElo < 1000) specificInstruction = "Strictly beginner. Keep sentences extremely short (max 8-12 words). Subject-Verb-Object only.";
            else if (currentElo < 1400) specificInstruction = "Elementary. Max 20-25 words. Simple compound sentences allowed.";
            else if (currentElo < 1800) specificInstruction = "Intermediate. Max 30-40 words. Mix standard professional English.";
            else if (currentElo < 2200) specificInstruction = "Upper Intermediate. Max 45-60 words. Abstract concepts.";
            else specificInstruction = "Advanced. Max 70+ words. Sophisticated expression.";
        }

        const difficultyPrompt = `
        Current User Rating: ${currentElo}.
        ${difficultyScale}
        ADAPTATION INSTRUCTION: Generate a drill that matches the user's exact rating of ${currentElo}.
        ${specificInstruction}
        CRITICAL LENGTH CONSTRAINT: You MUST follow the word count limits above.
        `;

        const isListening = mode === "listening";
        const randomSeed = Math.random().toString(36).substring(7);

        let prompt = "";

        if (isScenario) {
            // --- SCENARIO MODE PROMPT ---
            const styles = ["Dialogue Response", "Casual Remark", "Formal Request", "Emergency Question", "Witty Comment"];
            let styleInstruction = styles[Math.floor(Math.random() * styles.length)];
            let scenarioContext = "The user is in a 'Battle Mode'.";

            // Boss Scenario Injection
            if (bossType) {
                const BOSS_SCENARIOS: Record<string, string> = {
                    'reaper': "Dark / Survival / High Stakes. Example: 'The shadow looms closer as time runs out.'",
                    'lightning': "Action / Speed / Urgency. Example: 'Quick! The reactor is destabilizing!'",
                    'blind': "Auditory / Sensory / Mystery. Example: 'She heard a whisper in the complete darkness.'",
                    'echo': "Memory / Ephemeral / Echoes. Example: 'The voice faded before I could understand it.'",
                    'reverser': "Paradox / Confusion / Mirror. Example: 'The reflection showed a different truth.'",
                    'roulette': "Casino / Risk / Luck. Example: 'The wheel spins, deciding your fate.'",
                    'roulette_execution': "Death / Finality / Judgment. Example: 'The hammer clicks. This is the end.'"
                };
                if (BOSS_SCENARIOS[bossType]) {
                    styleInstruction = `THEME: ${BOSS_SCENARIOS[bossType]}. Create a sentence that fits this specific Vibe.`;
                    scenarioContext = `BOSS FIGHT ACTIVE: ${bossType.toUpperCase()}. High Tension.`;
                }
            }

            prompt = `
            [SCENARIO MODE | DIVERSITY SEED: ${randomSeed}]
            You are an expert English coach.
            
            Topic: "${articleTitle}"
            
            Task:
            1. Invent a specific, realistic "Micro-Scenario" regarding this topic.
            2. ${isListening ?
                    `Create a challenging English line someone would say in this context (for listening dictation).` :
                    `Create a Chinese source sentence for the user to translate into English.`}
            3. Ensure the target English line matches Elo ${currentElo}.

            Constraint: ${difficultyPrompt}

            **Context**: ${scenarioContext}
            **Style**: ${styleInstruction}
            
            Output strictly in JSON format:
            {
                "chinese": "${isListening ? "Direct Chinese Translation of the English sentence (NOT a description of the situation)" : "The Chinese sentence to translate"}",
                "target_english_vocab": ["Keyword1", "Keyword2"],
                "reference_english": "The ideal English sentence matching the scenario."
            }
            `;
        } else {
            // --- ARTICLE MODE PROMPT (Existing) ---
            // Random Variety Seeds
            const perspectives = [
                "from a scientist's perspective", "from a journalist's perspective", "from a student's perspective",
                "focusing on cause and effect", "focusing on comparison", "focusing on future implications",
                "identifying a specific detail", "summarizing the core argument"
            ];
            const randomPerspective = perspectives[Math.floor(Math.random() * perspectives.length)];

            prompt = `
            [ARTICLE MODE | DIVERSITY SEED: ${randomSeed}]
            You are an expert IELTS English tutor.
            Based on the article snippet, generate a high-quality "${isListening ? "Listening Dictation" : "Translation Drill"}" for a student at ${difficulty} level.
            
            Article Title: "${articleTitle}"
            Snippet: "${snippet}"

            Constraint: ${difficultyPrompt}

            **CRITICAL VARIETY INSTRUCTIONS**:
            - Generate content ${randomPerspective}.
            - DO NOT repeat common phrases.
            - Pick a DIFFERENT aspect of the topic than the most obvious one.
            - Be CREATIVE and SURPRISING while staying on topic.

            Task:
            1. Identify the core theme and 2-3 vocabulary words.
            ${isListening ?
                    `2. Create a meaningful English sentence that reflects the theme. It should be challenging to listen to.
             3. Provide the exact transcript as 'reference_english'.` :
                    `2. Create a meaningful Chinese sentence that reflects the theme.
             3. Provide a 'Golden' English translation.`}
            
            Output strictly in JSON format:
            {
                "chinese": "${isListening ? "某个相关的中文提示/翻译" : "The Chinese sentence challenge"}",
                "target_english_vocab": ["EnglishWord1", "EnglishWord2"],
                "reference_english": "The ideal English translation"
            }
            `;
        }

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
