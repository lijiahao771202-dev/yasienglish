import { NextRequest, NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import {
    buildTranslationDifficultyScale,
    buildTranslationRetryInstruction,
    countWords,
    getTranslationDifficultyTarget,
    validateTranslationDifficulty,
} from "@/lib/translationDifficulty";

type DrillMode = "translation" | "listening";
type DifficultyStatus = "TOO_EASY" | "TOO_HARD" | "MATCHED";

type DifficultyExpectation = {
    min: number;
    max: number;
    tier: string;
    cefr: string;
};

function getListeningDifficultyExpectation(elo: number): DifficultyExpectation {
    if (elo < 400) return { min: 5, max: 8, tier: "新手", cefr: "A1" };
    if (elo < 800) return { min: 8, max: 12, tier: "青铜", cefr: "A2-" };
    if (elo < 1200) return { min: 8, max: 14, tier: "白银", cefr: "A2+" };
    if (elo < 1600) return { min: 12, max: 18, tier: "黄金", cefr: "B1" };
    if (elo < 2000) return { min: 14, max: 22, tier: "铂金", cefr: "B2" };
    if (elo < 2400) return { min: 16, max: 26, tier: "钻石", cefr: "C1" };
    if (elo < 2800) return { min: 20, max: 32, tier: "大师", cefr: "C2" };
    if (elo < 3200) return { min: 24, max: 40, tier: "王者", cefr: "C2+" };
    return { min: 35, max: 999, tier: "处决", cefr: "∞" };
}

function getListeningDifficultyScale(): string {
    return `
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
    `.trim();
}

function getListeningSpecificInstruction(elo: number) {
    if (elo < 400) return { tier: "新手", cefr: "A1", instruction: "STRICT WORD LIMIT: 5-7 words MAXIMUM. Simple phrase only. DO NOT EXCEED 7 WORDS." };
    if (elo < 800) return { tier: "青铜", cefr: "A2-", instruction: "STRICT WORD LIMIT: 8-10 words MAXIMUM. One clear sentence. DO NOT EXCEED 10 WORDS." };
    if (elo < 1200) return { tier: "白银", cefr: "A2+", instruction: "STRICT WORD LIMIT: 8-12 words MAXIMUM. One moderate sentence. DO NOT EXCEED 12 WORDS." };
    if (elo < 1600) return { tier: "黄金", cefr: "B1", instruction: "STRICT WORD LIMIT: 12-16 words MAXIMUM. Complex sentence. DO NOT EXCEED 16 WORDS." };
    if (elo < 2000) return { tier: "铂金", cefr: "B2", instruction: "STRICT WORD LIMIT: 14-20 words MAXIMUM. News-style with clauses. DO NOT EXCEED 20 WORDS." };
    if (elo < 2400) return { tier: "钻石", cefr: "C1", instruction: "STRICT WORD LIMIT: 18-24 words MAXIMUM. High density logic. DO NOT EXCEED 24 WORDS." };
    if (elo < 2800) return { tier: "大师", cefr: "C2", instruction: "STRICT WORD LIMIT: 24-30 words MAXIMUM. Native complexity. DO NOT EXCEED 30 WORDS." };
    if (elo < 3200) return { tier: "王者", cefr: "C2+", instruction: "STRICT WORD LIMIT: 30-38 words MAXIMUM. Dense academic. DO NOT EXCEED 38 WORDS." };
    return { tier: "处决", cefr: "PUNISHMENT", instruction: "WORD COUNT: 50+ words MINIMUM. Extremely fast, obscure idioms." };
}

async function requestCompletion(prompt: string, maxRetries: number) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[API] Transport attempt ${attempt}/${maxRetries}`);
            return await deepseek.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a strict English drill generator. You MUST:
1. Follow the EXACT word count specified in the prompt.
2. Match the specified tier.
3. Report your tier and word count accurately in _ai_difficulty_report.
4. CRITICAL: NEVER use or translate the example sentences provided in the prompt. Create your OWN original sentence based on the topic.
DO NOT generate content for a lower difficulty tier than requested.`
                    },
                    { role: "user", content: prompt }
                ],
                model: "deepseek-chat",
                response_format: { type: "json_object" },
                temperature: 0.7,
            });
        } catch (error) {
            lastError = error as Error;
            console.log(`[API] Transport attempt ${attempt} failed: ${lastError.message}`);
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
            }
        }
    }

    throw lastError || new Error("Failed after retries");
}

export async function POST(req: NextRequest) {
    try {
        const { articleTitle, articleContent, difficulty, eloRating, mode = "translation", bossType } = await req.json();
        const drillMode = mode as DrillMode;
        const isListening = drillMode === "listening";

        const isScenario = !articleContent || articleContent.length < 50;
        if (!articleTitle && !isScenario) {
            return NextResponse.json({ error: "Article title is required" }, { status: 400 });
        }

        const snippet = articleContent ? articleContent.slice(0, 3000) : "";

        let currentElo = eloRating || 1200;
        if (bossType === "roulette_execution") {
            console.log(`[API] Roulette Execution Detected! Overriding Elo from ${currentElo} to 3200 (MAXIMUM)`);
            currentElo = 3200;
        }

        console.log(`[API] Final Elo: ${currentElo}, bossType: ${bossType}`);

        const translationTarget = !isListening ? getTranslationDifficultyTarget(currentElo) : null;
        const listeningInstruction = isListening ? getListeningSpecificInstruction(currentElo) : null;

        const difficultyScale = isListening
            ? getListeningDifficultyScale()
            : `TRANSLATION SCALE (Focus on Grammar/Reading) - 400 Elo per tier:\n${buildTranslationDifficultyScale()}`;

        const targetTier = isListening ? listeningInstruction!.tier : translationTarget!.tier.tier;
        const specificInstruction = isListening
            ? `${listeningInstruction!.instruction} ⚠️ CRITICAL: COUNT YOUR WORDS! If you exceed the limit, SHORTEN the sentence. The word limit is STRICT.`
            : `TIER: ${translationTarget!.tier.tier} (${translationTarget!.tier.cefr}). CURRENT TARGET RANGE: ${translationTarget!.wordRange.min}-${translationTarget!.wordRange.max} words. ${translationTarget!.syntaxBand.promptInstruction}`;

        const difficultyPrompt = `
███████████████████████████████████████████████████████
██  MANDATORY TARGET: ELO ${currentElo} → TIER: ${targetTier}  ██
███████████████████████████████████████████████████████

${specificInstruction}

${difficultyScale}

⚠️ CRITICAL: You MUST generate content for ${targetTier} tier (Elo ${currentElo}).
⚠️ DO NOT generate content for a lower tier.
⚠️ COUNT YOUR WORDS before finalizing output.
        `.trim();

        const randomSeed = Math.random().toString(36).substring(7);
        const scenarioStyles = ["Dialogue Response", "Casual Remark", "Formal Request", "Emergency Question", "Witty Comment", "Sarcastic Reply", "Polite Inquiry", "Angry Complaint", "Excited Announcement"];
        const randomSubTopics = [
            "at a crowded coffee shop", "missing a flight", "arguing with a robot vacuum",
            "finding a lost wallet", "first day at a new job", "awkward elevator ride",
            "spilling water on a laptop", "asking for a raise", "getting pulled over by police",
            "trying a bizarre new food", "meeting a celebrity", "buying a used car",
            "a ghost in the house", "losing wifi during a meeting", "adopting a pet",
            "a bad haircut", "a delayed train", "winning the lottery", "a broken umbrella",
            "getting locked out", "a noisy neighbor", "a confusing text message",
            "a ruined surprise party", "a fitness tracker malfunction", "a rude customer"
        ];
        const articlePerspectives = [
            "from a scientist's perspective", "from a journalist's perspective", "from a student's perspective",
            "focusing on cause and effect", "focusing on comparison", "focusing on future implications",
            "identifying a specific detail", "summarizing the core argument"
        ];

        let scenarioStyleInstruction = scenarioStyles[Math.floor(Math.random() * scenarioStyles.length)];
        let scenarioContext = "The user is in a 'Battle Mode'.";
        const hyperSpecificTopic = randomSubTopics[Math.floor(Math.random() * randomSubTopics.length)];
        const articlePerspective = articlePerspectives[Math.floor(Math.random() * articlePerspectives.length)];

        if (bossType) {
            const bossScenarios: Record<string, string> = {
                reaper: "Dark / Survival / High Stakes.",
                lightning: "Action / Speed / Urgency.",
                blind: "Auditory / Sensory / Mystery.",
                echo: "Memory / Ephemeral / Echoes.",
                reverser: "Paradox / Confusion / Mirror.",
                roulette: "Casino / Risk / Luck.",
                roulette_execution: "Death / Finality / Judgment."
            };
            if (bossScenarios[bossType]) {
                scenarioStyleInstruction = `THEME: ${bossScenarios[bossType]} Create a sentence that fits this specific vibe.`;
                scenarioContext = `BOSS FIGHT ACTIVE: ${bossType.toUpperCase()}. High tension.`;
            }
        }

        const buildPrompt = (retryInstruction?: string) => {
            if (isScenario) {
                return `
[SCENARIO MODE | DIVERSITY SEED: ${randomSeed}]
You are an expert English coach.

Topic: "${articleTitle}"
Specific Situation: "${hyperSpecificTopic}"

Task:
1. Invent a specific, realistic "Micro-Scenario" regarding this Topic and Specific Situation.
2. ${isListening
                        ? `Create a challenging English line someone would say in this context (for listening dictation).`
                        : `Create a Chinese source sentence for the user to translate into English.`}
3. Ensure the target English line matches Elo ${currentElo}.

Constraint: ${difficultyPrompt}
${retryInstruction ? `\n${retryInstruction}\n` : ""}
Context: ${scenarioContext}
Style: ${scenarioStyleInstruction}

Output strictly in JSON format:
{
  "chinese": "${isListening ? "Direct Chinese translation of the English sentence" : "The Chinese sentence to translate"}",
  "target_english_vocab": ["Keyword1", "Keyword2"],
  "reference_english": "The ideal English sentence matching the scenario.",
  "_scenario_topic": "The specific micro-topic you invented",
  "_ai_difficulty_report": {
    "tier": "Your target tier name",
    "cefr": "Your target CEFR level",
    "word_count": "Number of words in your reference_english",
    "target_range": "Expected word range for this tier"
  }
}
                `.trim();
            }

            return `
[ARTICLE MODE | DIVERSITY SEED: ${randomSeed}]
You are an expert IELTS English tutor.
Based on the article snippet, generate a high-quality "${isListening ? "Listening Dictation" : "Translation Drill"}" for a student at ${difficulty} level.

Article Title: "${articleTitle}"
Snippet: "${snippet}"

Constraint: ${difficultyPrompt}
${retryInstruction ? `\n${retryInstruction}\n` : ""}
CRITICAL VARIETY INSTRUCTIONS:
- Generate content ${articlePerspective}.
- DO NOT repeat common phrases.
- Pick a DIFFERENT aspect of the topic than the most obvious one.
- Be CREATIVE and SURPRISING while staying on topic.

Task:
1. Identify the core theme and 2-3 vocabulary words.
${isListening
                    ? `2. Create a meaningful English sentence that reflects the theme. It should be challenging to listen to.
3. Provide the exact transcript as 'reference_english'.`
                    : `2. Create a meaningful Chinese sentence that reflects the theme.
3. Provide a 'Golden' English translation.`}

Output strictly in JSON format:
{
  "chinese": "${isListening ? "某个相关的中文提示/翻译" : "The Chinese sentence challenge"}",
  "target_english_vocab": ["EnglishWord1", "EnglishWord2"],
  "reference_english": "The ideal English translation",
  "_ai_difficulty_report": {
    "tier": "Your target tier name",
    "cefr": "Your target CEFR level",
    "word_count": "Number of words in your reference_english",
    "target_range": "Expected word range for this tier"
  }
}
            `.trim();
        };

        const maxDifficultyAttempts = isListening ? 1 : 3;
        let lastGeneratedData: any = null;
        let lastDifficultyStatus: DifficultyStatus = "MATCHED";
        let lastActualWordCount = 0;
        let finalExpected: DifficultyExpectation;

        if (isListening) {
            finalExpected = getListeningDifficultyExpectation(currentElo);
        } else {
            finalExpected = {
                min: translationTarget!.wordRange.min,
                max: translationTarget!.wordRange.max,
                tier: translationTarget!.tier.tier,
                cefr: translationTarget!.tier.cefr,
            };
        }

        let retryInstruction = "";

        for (let generationAttempt = 1; generationAttempt <= maxDifficultyAttempts; generationAttempt++) {
            console.log(`[API] Difficulty attempt ${generationAttempt}/${maxDifficultyAttempts} for Elo ${currentElo}`);
            const completion = await requestCompletion(buildPrompt(retryInstruction), 3);
            const content = completion.choices[0].message.content;
            if (!content) {
                throw new Error("No content generated");
            }

            const data = JSON.parse(content);
            const generatedText = data.reference_english || "";
            lastGeneratedData = data;

            if (isListening) {
                lastActualWordCount = countWords(generatedText);
                lastDifficultyStatus = lastActualWordCount < finalExpected.min
                    ? "TOO_EASY"
                    : lastActualWordCount > finalExpected.max
                        ? "TOO_HARD"
                        : "MATCHED";
                break;
            }

            const validation = validateTranslationDifficulty(generatedText, currentElo);
            finalExpected = {
                min: validation.wordRange.min,
                max: validation.wordRange.max,
                tier: validation.tier.tier,
                cefr: validation.tier.cefr,
            };
            lastActualWordCount = validation.actualWordCount;
            lastDifficultyStatus = validation.status;

            console.log(`[Difficulty Validation] Elo: ${currentElo}, Mode: ${drillMode}`);
            console.log(`  Target: ${validation.wordRange.min}-${validation.wordRange.max} words (${finalExpected.tier} / ${finalExpected.cefr})`);
            console.log(`  Validation: ${validation.validationRange.min}-${validation.validationRange.max} words after tolerance`);
            console.log(`  Actual: ${lastActualWordCount} words | Status: ${lastDifficultyStatus}`);

            if (validation.status === "MATCHED" || generationAttempt === maxDifficultyAttempts) {
                break;
            }

            retryInstruction = buildTranslationRetryInstruction({
                attempt: generationAttempt,
                maxAttempts: maxDifficultyAttempts,
                actualWordCount: validation.actualWordCount,
                status: validation.status,
                target: validation,
            });
        }

        if (!lastGeneratedData) {
            throw new Error("Failed to generate drill");
        }

        const aiReport = lastGeneratedData._ai_difficulty_report || null;
        const aiReportedWordCount = aiReport?.word_count ? parseInt(aiReport.word_count, 10) : null;
        const wordCountMismatch = aiReportedWordCount !== null && aiReportedWordCount !== lastActualWordCount;

        console.log(`[Difficulty Result] Elo: ${currentElo}, Mode: ${drillMode}`);
        console.log(`  Expected: ${finalExpected.min}-${finalExpected.max} words (${finalExpected.tier} / ${finalExpected.cefr})`);
        console.log(`  Actual: ${lastActualWordCount} words | AI Reported: ${aiReportedWordCount ?? 'N/A'} | Status: ${lastDifficultyStatus}`);
        if (aiReport) {
            console.log(`  AI Self-Report: Tier=${aiReport.tier}, CEFR=${aiReport.cefr}, Range=${aiReport.target_range}`);
        }
        if (wordCountMismatch) {
            console.log(`  ⚠️ AI WORD COUNT MISMATCH: Reported ${aiReportedWordCount} but actual is ${lastActualWordCount}`);
        }

        return NextResponse.json({
            ...lastGeneratedData,
            _topicMeta: {
                topic: articleTitle || "随机场景",
                subTopic: lastGeneratedData._scenario_topic || null,
                isScenario,
            },
            _difficultyMeta: {
                requestedElo: currentElo,
                tier: finalExpected.tier,
                cefr: finalExpected.cefr,
                expectedWordRange: { min: finalExpected.min, max: finalExpected.max },
                actualWordCount: lastActualWordCount,
                isValid: lastDifficultyStatus === "MATCHED",
                status: lastDifficultyStatus,
                aiSelfReport: aiReport ? {
                    tier: aiReport.tier,
                    cefr: aiReport.cefr,
                    wordCount: aiReportedWordCount,
                    targetRange: aiReport.target_range,
                    wordCountAccurate: !wordCountMismatch,
                } : null,
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
