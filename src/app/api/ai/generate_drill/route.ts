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

        // RUSSIAN ROULETTE DEATH LOGIC - MAXIMUM DIFFICULTY
        if (bossType === 'roulette_execution') {
            console.log(`[API] Roulette Execution Detected! Overriding Elo from ${currentElo} to 3200 (MAXIMUM)`);
            currentElo = 3200; // Force MAXIMUM Difficulty (处决 tier)
        }

        console.log(`[API] Final Elo: ${currentElo}, bossType: ${bossType}`);

        // UNIFIED 400 ELO PER TIER DIFFICULTY SYSTEM
        // UNIFIED 400 ELO PER TIER DIFFICULTY SYSTEM
        const difficultyScale = mode === 'listening' ? `
        LISTENING SCALE (Focus on Echoing/Memory) - 400 Elo per tier:
        - 0-400 (A1 新手): Very slow, isolated words. 5-8 words. 500 vocab.
        - 400-800 (A2- 青铜): Simple daily sentences. Clear enunciation. 8-12 words. 1000 vocab.
        - 800-1200 (A2+ 白银): Moderate speed. Basic linking sounds. 12-15 words. 1500 vocab.
        - 1200-1600 (B1 黄金): Natural speed conversational. 15-20 words. 3000 vocab.
        - 1600-2000 (B2 铂金): Fast news anchor speed. 20-30 words. 5000 vocab.
        - 2000-2400 (C1 钻石): Rapid native debate. Idiomatic expressions. 25-35 words. 7000 vocab.
        - 2400-2800 (C2 大师): Multiple speakers style. Native-only idioms. 35-45 words. 10000 vocab.
        - 2800-3200 (C2+ 王者): Fastest possible speech. Dense academic. 45-55 words. 12000 vocab.
        - 3200+ (☠️ 处决): EXTREME PUNISHMENT. 60+ words MINIMUM. Obscure phrasal verbs, challenging pronunciation, dialect mixing.
        IMPORTANT: You MUST meet the word count for each level. Count your words!
        ` : `
        TRANSLATION SCALE (Focus on Grammar/Reading) - 400 Elo per tier:
        - 0-400 (A1 新手): Simple SVO sentences, top 500 words.
        - 400-800 (A2- 青铜): Compound sentences (and/but), daily topics, 1000 words.
        - 800-1200 (A2+ 白银): Simple relative clauses (that/which), 1500 words.
        - 1200-1600 (B1 黄金): Passive voice, complex relative clauses, 3000 words.
        - 1600-2000 (B2 铂金): Abstract topics, conditionals, participle phrases, 5000 words.
        - 2000-2400 (C1 钻石): Inversion, subjunctive mood, nuanced vocabulary, 7000 words.
        - 2400-2800 (C2 大师): Independent absolute constructions, concessive clauses, 10000 words.
        - 2800-3200 (C2+ 王者): Cleft sentences, garden-path syntax, rare literary vocabulary, 12000 words.
        - 3200+ (☠️ 处决): EXTREME PUNISHMENT. Archaic expressions, legal/medical jargon, triple-nested clauses, only academic papers.
        `;

        let specificInstruction = "";

        if (mode === 'listening') {
            // LISTENING MODE: Word count per tier (REALISTIC for short-term memory)
            if (currentElo < 400) specificInstruction = "A1 Level. STRICT: Generate exactly 5-8 words. Simple phrase only.";
            else if (currentElo < 800) specificInstruction = "A2- Level. STRICT: Generate exactly 8-12 words. One clear sentence.";
            else if (currentElo < 1200) specificInstruction = "A2+ Level. STRICT: Generate exactly 12-15 words. One moderate sentence.";
            else if (currentElo < 1600) specificInstruction = "B1 Level. STRICT: Generate exactly 15-20 words. Complex sentence required.";
            else if (currentElo < 2000) specificInstruction = "B2 Level. STRICT: Generate exactly 20-30 words. News-style density.";
            else if (currentElo < 2400) specificInstruction = "C1 Level. STRICT: Generate exactly 25-35 words. High information density.";
            else if (currentElo < 2800) specificInstruction = "C2 Level. STRICT: Generate exactly 35-45 words. Native complexity.";
            else if (currentElo < 3200) specificInstruction = "C2+ Level. STRICT: Generate exactly 45-55 words. Dense academic content.";
            else specificInstruction = "EXECUTION MODE (PUNISHMENT). STRICT: Generate exactly 60+ words. Use extremely fast native speech patterns, obscure idioms, dense academic terminology, and intentionally difficult pronunciation. This should be nearly impossible to repeat.";

            specificInstruction += " For Listening: Content must be retainable in short-term memory for echo/dictation. COUNT YOUR WORDS.";
        } else {
            // TRANSLATION MODE: Word count per tier (STRICT with MINIMUM)
            if (currentElo < 400) specificInstruction = "A1 Level. STRICT: Generate 8-15 words MINIMUM. Subject-Verb-Object only.";
            else if (currentElo < 800) specificInstruction = "A2- Level. STRICT: Generate 15-25 words MINIMUM. Simple compound sentences.";
            else if (currentElo < 1200) specificInstruction = "A2+ Level. STRICT: Generate 25-35 words MINIMUM. Simple relative clauses.";
            else if (currentElo < 1600) specificInstruction = "B1 Level. STRICT: Generate 35-50 words MINIMUM. Passive voice and complex clauses.";
            else if (currentElo < 2000) specificInstruction = "B2 Level. STRICT: Generate 50-70 words MINIMUM. Abstract concepts and conditionals.";
            else if (currentElo < 2400) specificInstruction = "C1 Level. STRICT: Generate 70-90 words MINIMUM. Inversion and subjunctive mood.";
            else if (currentElo < 2800) specificInstruction = "C2 Level. STRICT: Generate 90-110 words MINIMUM. Native-level sophisticated expression.";
            else if (currentElo < 3200) specificInstruction = "C2+ Level. STRICT: Generate 110-130 words MINIMUM. Rare literary vocabulary.";
            else specificInstruction = "EXECUTION MODE (PUNISHMENT). STRICT: Generate 130-150 words MINIMUM. MANDATORY: Use archaic vocabulary, legal/medical jargon, triple-nested clauses, garden-path sentences, inverted conditionals (Had I known...), subjunctive mood, split infinitives, and vocabulary only found in academic papers. This is meant to be nearly impossible for non-native speakers.";
        }

        const difficultyPrompt = `
        Current User Rating: ${currentElo}.
        ${difficultyScale}
        ADAPTATION INSTRUCTION: Generate a drill that matches the user's exact rating of ${currentElo}.
        ${specificInstruction}
        
        ⚠️ CRITICAL LENGTH CONSTRAINT ⚠️
        You MUST follow the EXACT word count specified above. 
        FAILURE TO MEET THE MINIMUM WORD COUNT IS UNACCEPTABLE.
        Count your words before responding. If too short, add more content.
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
