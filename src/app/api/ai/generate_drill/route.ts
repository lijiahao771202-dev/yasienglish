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
        - 800-1200 (A2+ 白银): Moderate speed. Basic linking sounds. 10-14 words. 1500 vocab.
        - 1200-1600 (B1 黄金): Natural speed conversational. 12-16 words. 3000 vocab.
        - 1600-2000 (B2 铂金): Fast news anchor speed. 16-22 words. 5000 vocab.
        - 2000-2400 (C1 钻石): Rapid native debate. Idiomatic expressions. 20-26 words. 7000 vocab.
        - 2400-2800 (C2 大师): Multiple speakers style. Native-only idioms. 26-32 words. 10000 vocab.
        - 2800-3200 (C2+ 王者): Fastest possible speech. Dense academic. 30-40 words. 12000 vocab.
        - 3200+ (☠️ 处决): EXTREME PUNISHMENT. 45+ words MINIMUM. Obscure phrasal verbs, challenging pronunciation, dialect mixing.
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
        let targetTier = "";

        if (mode === 'listening') {
            // LISTENING MODE: Word count per tier - STRICT MAXIMUM to ensure validation passes
            // AI tends to over-generate, so we set targets BELOW the validation max
            if (currentElo < 400) { targetTier = "新手"; specificInstruction = `TIER: ${targetTier} (A1). STRICT WORD LIMIT: 5-7 words MAXIMUM. Simple phrase only. DO NOT EXCEED 7 WORDS.`; }
            else if (currentElo < 800) { targetTier = "青铜"; specificInstruction = `TIER: ${targetTier} (A2-). STRICT WORD LIMIT: 8-10 words MAXIMUM. One clear sentence. DO NOT EXCEED 10 WORDS.`; }
            else if (currentElo < 1200) { targetTier = "白银"; specificInstruction = `TIER: ${targetTier} (A2+). STRICT WORD LIMIT: 8-12 words MAXIMUM. One moderate sentence. DO NOT EXCEED 12 WORDS.`; }
            else if (currentElo < 1600) { targetTier = "黄金"; specificInstruction = `TIER: ${targetTier} (B1). STRICT WORD LIMIT: 12-16 words MAXIMUM. Complex sentence. DO NOT EXCEED 16 WORDS.`; }
            else if (currentElo < 2000) { targetTier = "铂金"; specificInstruction = `TIER: ${targetTier} (B2). STRICT WORD LIMIT: 14-20 words MAXIMUM. News-style with clauses. DO NOT EXCEED 20 WORDS.`; }
            else if (currentElo < 2400) { targetTier = "钻石"; specificInstruction = `TIER: ${targetTier} (C1). STRICT WORD LIMIT: 18-24 words MAXIMUM. High density logic. DO NOT EXCEED 24 WORDS.`; }
            else if (currentElo < 2800) { targetTier = "大师"; specificInstruction = `TIER: ${targetTier} (C2). STRICT WORD LIMIT: 24-30 words MAXIMUM. Native complexity. DO NOT EXCEED 30 WORDS.`; }
            else if (currentElo < 3200) { targetTier = "王者"; specificInstruction = `TIER: ${targetTier} (C2+). STRICT WORD LIMIT: 30-38 words MAXIMUM. Dense academic. DO NOT EXCEED 38 WORDS.`; }
            else { targetTier = "处决"; specificInstruction = `TIER: ${targetTier} (PUNISHMENT). WORD COUNT: 50+ words MINIMUM. Extremely fast, obscure idioms.`; }

            specificInstruction += " ⚠️ CRITICAL: COUNT YOUR WORDS! If you exceed the limit, SHORTEN the sentence. The word limit is STRICT.";
        } else {
            // TRANSLATION MODE: Word count per tier (STRICT with MINIMUM)
            if (currentElo < 400) { targetTier = "新手"; specificInstruction = `TIER: ${targetTier} (A1). WORD COUNT: 8-15 words MINIMUM. Subject-Verb-Object only.`; }
            else if (currentElo < 800) { targetTier = "青铜"; specificInstruction = `TIER: ${targetTier} (A2-). WORD COUNT: 15-25 words MINIMUM. Simple compound sentences.`; }
            else if (currentElo < 1200) { targetTier = "白银"; specificInstruction = `TIER: ${targetTier} (A2+). WORD COUNT: 25-35 words MINIMUM. Simple relative clauses.`; }
            else if (currentElo < 1600) { targetTier = "黄金"; specificInstruction = `TIER: ${targetTier} (B1). WORD COUNT: 35-50 words MINIMUM. Passive voice and complex clauses.`; }
            else if (currentElo < 2000) { targetTier = "铂金"; specificInstruction = `TIER: ${targetTier} (B2). WORD COUNT: 50-70 words MINIMUM. Abstract concepts and conditionals.`; }
            else if (currentElo < 2400) { targetTier = "钻石"; specificInstruction = `TIER: ${targetTier} (C1). WORD COUNT: 70-90 words MINIMUM. Inversion and subjunctive mood.`; }
            else if (currentElo < 2800) { targetTier = "大师"; specificInstruction = `TIER: ${targetTier} (C2). WORD COUNT: 90-110 words MINIMUM. Native-level sophisticated expression.`; }
            else if (currentElo < 3200) { targetTier = "王者"; specificInstruction = `TIER: ${targetTier} (C2+). WORD COUNT: 110-130 words MINIMUM. Rare literary vocabulary.`; }
            else { targetTier = "处决"; specificInstruction = `TIER: ${targetTier} (PUNISHMENT). WORD COUNT: 130-150 words MINIMUM. Use archaic vocabulary, legal/medical jargon, triple-nested clauses.`; }
        }

        // Put the MOST CRITICAL info at the TOP of the prompt
        const difficultyPrompt = `
        ███████████████████████████████████████████████████████
        ██  MANDATORY TARGET: ELO ${currentElo} → TIER: ${targetTier}  ██
        ███████████████████████████████████████████████████████
        
        ${specificInstruction}
        
        ${difficultyScale}
        
        ⚠️ CRITICAL: You MUST generate content for ${targetTier} tier (Elo ${currentElo}).
        ⚠️ DO NOT generate content for a lower tier.
        ⚠️ COUNT YOUR WORDS before finalizing output.
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
                "reference_english": "The ideal English sentence matching the scenario.",
                "_scenario_topic": "The specific micro-topic you invented (e.g. 机场误机, 餐厅点菜, 面试自我介绍)",
                "_ai_difficulty_report": {
                    "tier": "Your target tier name (e.g. 新手/青铜/白银/黄金/铂金/钻石/大师/王者/处决)",
                    "cefr": "Your target CEFR level (A1/A2-/A2+/B1/B2/C1/C2/C2+/∞)",
                    "word_count": "Number of words in your reference_english (COUNT CAREFULLY!)",
                    "target_range": "Expected word range for this tier (e.g. 20-30)"
                }
            }
            
            ⚠️ CRITICAL: You MUST accurately report your word count in _ai_difficulty_report. We will verify this!
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
                "reference_english": "The ideal English translation",
                "_ai_difficulty_report": {
                    "tier": "Your target tier name (e.g. 新手/青铜/白银/黄金/铂金/钻石/大师/王者/处决)",
                    "cefr": "Your target CEFR level (A1/A2-/A2+/B1/B2/C1/C2/C2+/∞)",
                    "word_count": "Number of words in your reference_english (COUNT CAREFULLY!)",
                    "target_range": "Expected word range for this tier (e.g. 20-30)"
                }
            }
            
            ⚠️ CRITICAL: You MUST accurately report your word count in _ai_difficulty_report. We will verify this!
            `;
        }

        // Retry wrapper for unstable DeepSeek API
        const MAX_RETRIES = 3;
        let lastError: Error | null = null;
        let completion: any = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log(`[API] Attempt ${attempt}/${MAX_RETRIES} for Elo ${currentElo}`);
                completion = await deepseek.chat.completions.create({
                    messages: [
                        {
                            role: "system", content: `You are a strict English drill generator. You MUST:
1. Follow the EXACT word count specified in the prompt. 
2. Match the specified tier (e.g., 铂金/Platinum = 20-30 words for listening).
3. Report your tier and word count accurately in _ai_difficulty_report.
DO NOT generate content for a lower difficulty tier than requested.` },
                        { role: "user", content: prompt }
                    ],
                    model: "deepseek-chat",
                    response_format: { type: "json_object" },
                    temperature: 0.7,
                });
                break; // Success, exit retry loop
            } catch (error) {
                lastError = error as Error;
                console.log(`[API] Attempt ${attempt} failed: ${lastError.message}`);
                if (attempt < MAX_RETRIES) {
                    // Wait before retry (exponential backoff: 1s, 2s, 4s)
                    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                }
            }
        }

        if (!completion) {
            console.error(`[API] All ${MAX_RETRIES} attempts failed:`, lastError);
            throw lastError || new Error("Failed after retries");
        }

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content generated");

        const data = JSON.parse(content);

        // === DIFFICULTY VERIFICATION SYSTEM ===
        // Calculate word count of generated content
        const generatedText = data.reference_english || "";
        const actualWordCount = generatedText.trim().split(/\s+/).filter((w: string) => w.length > 0).length;

        // Get expected word count range based on Elo and Mode
        const getExpectedWordRange = (elo: number, isListeningMode: boolean): { min: number; max: number; tier: string; cefr: string } => {
            if (isListeningMode) {
                if (elo < 400) return { min: 5, max: 8, tier: "新手", cefr: "A1" };
                if (elo < 800) return { min: 8, max: 12, tier: "青铜", cefr: "A2-" };
                if (elo < 1200) return { min: 8, max: 14, tier: "白银", cefr: "A2+" };
                if (elo < 1600) return { min: 12, max: 18, tier: "黄金", cefr: "B1" };
                if (elo < 2000) return { min: 14, max: 22, tier: "铂金", cefr: "B2" };
                if (elo < 2400) return { min: 16, max: 26, tier: "钻石", cefr: "C1" };
                if (elo < 2800) return { min: 20, max: 32, tier: "大师", cefr: "C2" };
                if (elo < 3200) return { min: 24, max: 40, tier: "王者", cefr: "C2+" };
                return { min: 35, max: 999, tier: "处决", cefr: "∞" };
            } else {
                if (elo < 400) return { min: 8, max: 15, tier: "新手", cefr: "A1" };
                if (elo < 800) return { min: 15, max: 25, tier: "青铜", cefr: "A2-" };
                if (elo < 1200) return { min: 25, max: 35, tier: "白银", cefr: "A2+" };
                if (elo < 1600) return { min: 35, max: 50, tier: "黄金", cefr: "B1" };
                if (elo < 2000) return { min: 50, max: 70, tier: "铂金", cefr: "B2" };
                if (elo < 2400) return { min: 70, max: 90, tier: "钻石", cefr: "C1" };
                if (elo < 2800) return { min: 90, max: 110, tier: "大师", cefr: "C2" };
                if (elo < 3200) return { min: 110, max: 130, tier: "王者", cefr: "C2+" };
                return { min: 130, max: 150, tier: "处决", cefr: "∞" };
            }
        };

        const expected = getExpectedWordRange(currentElo, isListening);
        const isValid = actualWordCount >= expected.min && actualWordCount <= expected.max;
        const difficultyStatus = actualWordCount < expected.min ? "TOO_EASY" : (actualWordCount > expected.max ? "TOO_HARD" : "MATCHED");

        // Extract AI self-report (if provided)
        const aiReport = data._ai_difficulty_report || null;
        const aiReportedWordCount = aiReport?.word_count ? parseInt(aiReport.word_count, 10) : null;
        const wordCountMismatch = aiReportedWordCount !== null && aiReportedWordCount !== actualWordCount;

        // Log validation result with AI comparison
        console.log(`[Difficulty Validation] Elo: ${currentElo}, Mode: ${mode}`);
        console.log(`  Expected: ${expected.min}-${expected.max} words (${expected.tier} / ${expected.cefr})`);
        console.log(`  Actual: ${actualWordCount} words | AI Reported: ${aiReportedWordCount ?? 'N/A'} | Status: ${difficultyStatus}`);
        if (aiReport) {
            console.log(`  AI Self-Report: Tier=${aiReport.tier}, CEFR=${aiReport.cefr}, Range=${aiReport.target_range}`);
        }
        if (wordCountMismatch) {
            console.log(`  ⚠️ AI WORD COUNT MISMATCH: Reported ${aiReportedWordCount} but actual is ${actualWordCount}`);
        }

        // Return enriched response with difficulty metadata
        // For Scenario mode, prefer AI-generated specific topic over generic "Random Scenario"
        const displayTopic = data._scenario_topic || articleTitle || "随机场景";

        return NextResponse.json({
            ...data,
            _topicMeta: {
                topic: displayTopic,
                isScenario: isScenario
            },
            _difficultyMeta: {
                requestedElo: currentElo,
                tier: expected.tier,
                cefr: expected.cefr,
                expectedWordRange: { min: expected.min, max: expected.max },
                actualWordCount,
                isValid,
                status: difficultyStatus,
                // AI Self-Report Comparison
                aiSelfReport: aiReport ? {
                    tier: aiReport.tier,
                    cefr: aiReport.cefr,
                    wordCount: aiReportedWordCount,
                    targetRange: aiReport.target_range,
                    wordCountAccurate: !wordCountMismatch
                } : null
            }
        });

    } catch (error) {
        console.error("Generate Drill Error:", error);
        return NextResponse.json(
            { error: "Failed to generate drill" },
            { status: 500 }
        );
    }
}
