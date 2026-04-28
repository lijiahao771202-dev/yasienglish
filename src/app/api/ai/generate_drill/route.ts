import { NextRequest, NextResponse } from "next/server";
import { createDeepSeekClientForCurrentUserWithOverride } from "@/lib/deepseek";
import {
    buildTranslationRetryInstruction,
    buildTranslationDifficultyScale,
    countWords,
    getTranslationDifficultyTarget,
    validateTranslationDifficulty,
} from "@/lib/translationDifficulty";

type DrillMode = "translation" | "listening";
type DifficultyStatus = "TOO_EASY" | "TOO_HARD" | "MATCHED";
type DrillDifficultyStatus = DifficultyStatus | "UNVALIDATED";

type DifficultyExpectation = {
    min: number;
    max: number;
    tier: string;
    cefr: string;
};

type ListeningMemoryLoad = "low" | "medium" | "high";
type ListeningNaturalness = "low" | "medium" | "high";
type ListeningReducedFormsPresence = "minimal" | "some" | "frequent";

type ListeningFeatureTarget = DifficultyExpectation & {
    clauseMax: number;
    memoryLoad: ListeningMemoryLoad;
    spokenNaturalness: ListeningNaturalness;
    reducedFormsPresence: ListeningReducedFormsPresence;
    trainingFocus: string;
    downgraded?: boolean;
};

type ListeningFeatureReport = {
    wordCount: number | null;
    clauseCount: number | null;
    memoryLoad: ListeningMemoryLoad | null;
    spokenNaturalness: ListeningNaturalness | null;
    reducedFormsPresence: ListeningReducedFormsPresence | null;
};

type ListeningValidation = {
    actualWordCount: number;
    status: DifficultyStatus;
    isValid: boolean;
    reportedCefr: string | null;
    featureReport: ListeningFeatureReport;
    issues: string[];
};

const listeningMemoryRank: Record<ListeningMemoryLoad, number> = { low: 1, medium: 2, high: 3 };
const listeningNaturalnessRank: Record<ListeningNaturalness, number> = { low: 1, medium: 2, high: 3 };
const listeningReducedFormsRank: Record<ListeningReducedFormsPresence, number> = { minimal: 1, some: 2, frequent: 3 };

function normalizeMemoryLoad(value: unknown): ListeningMemoryLoad | null {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "low") return "low";
    if (normalized === "medium") return "medium";
    if (normalized === "high") return "high";
    return null;
}

function normalizeNaturalness(value: unknown): ListeningNaturalness | null {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "low") return "low";
    if (normalized === "medium") return "medium";
    if (normalized === "high") return "high";
    return null;
}

function normalizeReducedForms(value: unknown): ListeningReducedFormsPresence | null {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "minimal") return "minimal";
    if (normalized === "some") return "some";
    if (normalized === "frequent") return "frequent";
    return null;
}

function parseInteger(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim()) {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function estimateClauseCount(text: string) {
    const normalized = text.toLowerCase();
    const connectorHits = (normalized.match(/\b(that|because|when|while|although|though|since|unless|where|which|who|if)\b/g) || []).length;
    return Math.min(3, connectorHits);
}

function getListeningDifficultyExpectation(elo: number): ListeningFeatureTarget {
    if (elo < 400) return { min: 5, max: 8, tier: "新手", cefr: "A1", clauseMax: 0, memoryLoad: "low", spokenNaturalness: "low", reducedFormsPresence: "minimal", trainingFocus: "短句复现" };
    if (elo < 800) return { min: 8, max: 12, tier: "青铜", cefr: "A2-", clauseMax: 0, memoryLoad: "low", spokenNaturalness: "medium", reducedFormsPresence: "minimal", trainingFocus: "基础口语" };
    if (elo < 1200) return { min: 8, max: 14, tier: "白银", cefr: "A2+", clauseMax: 1, memoryLoad: "medium", spokenNaturalness: "medium", reducedFormsPresence: "some", trainingFocus: "基础连贯表达" };
    if (elo < 1600) return { min: 12, max: 18, tier: "黄金", cefr: "B1", clauseMax: 1, memoryLoad: "medium", spokenNaturalness: "medium", reducedFormsPresence: "some", trainingFocus: "自然语流" };
    if (elo < 2000) return { min: 14, max: 22, tier: "铂金", cefr: "B2", clauseMax: 2, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "高信息密度" };
    if (elo < 2400) return { min: 16, max: 26, tier: "钻石", cefr: "C1", clauseMax: 2, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "高自然度口语" };
    if (elo < 2800) return { min: 20, max: 32, tier: "大师", cefr: "C2", clauseMax: 3, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "复杂口语复现" };
    return { min: 20, max: 32, tier: "王者", cefr: "C2+", clauseMax: 3, memoryLoad: "high", spokenNaturalness: "high", reducedFormsPresence: "frequent", trainingFocus: "高压自然口语" };
}

function downgradeListeningDifficultyTarget(target: ListeningFeatureTarget): ListeningFeatureTarget {
    const memoryLoad = target.memoryLoad === "high" ? "medium" : target.memoryLoad === "medium" ? "low" : "low";
    const spokenNaturalness = target.spokenNaturalness === "high" ? "medium" : target.spokenNaturalness;
    const reducedFormsPresence = target.reducedFormsPresence === "frequent" ? "some" : target.reducedFormsPresence;
    return {
        ...target,
        memoryLoad,
        spokenNaturalness,
        reducedFormsPresence,
        downgraded: true,
    };
}

function validateListeningDifficulty(payload: Record<string, unknown>, target: ListeningFeatureTarget): ListeningValidation {
    const generatedText = typeof payload.reference_english === "string" ? payload.reference_english : "";
    const actualWordCount = countWords(generatedText);
    const listeningFeatures = payload._listening_features && typeof payload._listening_features === "object"
        ? payload._listening_features as Record<string, unknown>
        : {};
    const aiReport = payload._ai_difficulty_report && typeof payload._ai_difficulty_report === "object"
        ? payload._ai_difficulty_report as Record<string, unknown>
        : {};

    const featureReport: ListeningFeatureReport = {
        wordCount: parseInteger(listeningFeatures.word_count),
        clauseCount: parseInteger(listeningFeatures.clause_count) ?? estimateClauseCount(generatedText),
        memoryLoad: normalizeMemoryLoad(listeningFeatures.memory_load),
        spokenNaturalness: normalizeNaturalness(listeningFeatures.spoken_naturalness),
        reducedFormsPresence: normalizeReducedForms(listeningFeatures.reduced_forms_presence),
    };

    const issues: string[] = [];
    const reportedCefr = typeof aiReport.cefr === "string" ? aiReport.cefr : null;

    let status: DifficultyStatus = "MATCHED";
    if (actualWordCount < target.min) {
        status = "TOO_EASY";
        issues.push(`word count ${actualWordCount} is below ${target.min}`);
    } else if (actualWordCount > target.max) {
        status = "TOO_HARD";
        issues.push(`word count ${actualWordCount} is above ${target.max}`);
    }

    if (reportedCefr !== target.cefr) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`reported CEFR ${reportedCefr ?? "missing"} does not match ${target.cefr}`);
    }

    if (featureReport.clauseCount === null || featureReport.clauseCount > target.clauseMax) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`clause count ${featureReport.clauseCount ?? "missing"} exceeds ${target.clauseMax}`);
    }

    if (!featureReport.memoryLoad || listeningMemoryRank[featureReport.memoryLoad] > listeningMemoryRank[target.memoryLoad]) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`memory load ${featureReport.memoryLoad ?? "missing"} exceeds ${target.memoryLoad}`);
    }

    if (!featureReport.spokenNaturalness || listeningNaturalnessRank[featureReport.spokenNaturalness] > listeningNaturalnessRank[target.spokenNaturalness]) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`spoken naturalness ${featureReport.spokenNaturalness ?? "missing"} exceeds ${target.spokenNaturalness}`);
    }

    if (!featureReport.reducedFormsPresence || listeningReducedFormsRank[featureReport.reducedFormsPresence] > listeningReducedFormsRank[target.reducedFormsPresence]) {
        status = status === "TOO_EASY" ? status : "TOO_HARD";
        issues.push(`reduced forms ${featureReport.reducedFormsPresence ?? "missing"} exceeds ${target.reducedFormsPresence}`);
    }

    return {
        actualWordCount,
        status,
        isValid: issues.length === 0,
        reportedCefr,
        featureReport,
        issues,
    };
}

function buildListeningRetryInstruction(args: {
    attempt: number;
    maxAttempts: number;
    validation: ListeningValidation;
    target: ListeningFeatureTarget;
}) {
    const issueSummary = args.validation.issues.join("; ");
    return [
        `RETRY FEEDBACK (${args.attempt}/${args.maxAttempts}):`,
        `The previous listening sentence failed validation because ${issueSummary}.`,
        `You MUST keep CEFR at ${args.target.cefr}.`,
        `Next attempt MUST stay within ${args.target.min}-${args.target.max} words.`,
        `Clause count must be <= ${args.target.clauseMax}.`,
        `Memory load must be ${args.target.memoryLoad} or easier.`,
        `Spoken naturalness must be ${args.target.spokenNaturalness} or easier.`,
        `Reduced forms presence must be ${args.target.reducedFormsPresence} or lighter.`,
        "Do not become more written or more academic than the target.",
    ].join("\n");
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

export type DrillAiProvider = "deepseek" | "glm" | "nvidia" | "github";

const DRILL_SYSTEM_PROMPT = `You are a strict English drill generator. You MUST:
1. Follow the EXACT word count specified in the prompt.
2. Match the specified tier.
3. Report your tier and word count accurately in _ai_difficulty_report.
4. CRITICAL: NEVER use or translate the example sentences provided in the prompt. Create your OWN original sentence based on the topic.
DO NOT generate content for a lower difficulty tier than requested.`;

async function requestCompletion(
    prompt: string,
    maxRetries: number,
    provider?: DrillAiProvider,
    nvidiaModel?: string,
) {
    let lastError: Error | null = null;
    const client = await createDeepSeekClientForCurrentUserWithOverride(
        provider
            ? {
                provider,
                nvidiaModel,
            }
            : {
                nvidiaModel,
            },
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await client.chat.completions.create({
                messages: [
                    { role: "system", content: DRILL_SYSTEM_PROMPT },
                    { role: "user", content: prompt }
                ],
                model: "deepseek-chat",
                response_format: { type: "json_object" },
                temperature: 0.85,
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
        const {
            articleTitle,
            articleContent,
            difficulty,
            eloRating,
            mode = "translation",
            bossType,
            provider: rawProvider,
            topicPrompt,
            nvidiaModel,
            translationVariant,
        } = await req.json();
        const drillMode = mode as DrillMode;
        const isListening = drillMode === "listening";
        const effectiveTranslationVariant = translationVariant === "passage" ? "passage" : "sentence";
        const provider: DrillAiProvider | undefined = rawProvider === "glm" || rawProvider === "nvidia" || rawProvider === "github" || rawProvider === "deepseek"
            ? rawProvider
            : undefined;

        const isScenario = !articleContent || articleContent.length < 50;
        if (!articleTitle && !isScenario) {
            return NextResponse.json({ error: "Article title is required" }, { status: 400 });
        }

        const snippet = articleContent ? articleContent.slice(0, 3000) : "";

        let currentElo = eloRating || 400;
        if (bossType === "roulette_execution") {
            console.log(`[API] Roulette Execution Detected! Overriding Elo from ${currentElo} to 3200 (MAXIMUM)`);
            currentElo = 3200;
        }

        console.log(`[API] Final Elo: ${currentElo}, bossType: ${bossType}`);

        const translationTarget = !isListening ? getTranslationDifficultyTarget(currentElo, effectiveTranslationVariant) : null;
        const listeningInstruction = isListening ? getListeningSpecificInstruction(currentElo) : null;
        const listeningTarget = isListening ? getListeningDifficultyExpectation(currentElo) : null;

        const difficultyScale = isListening
            ? getListeningDifficultyScale()
            : `TRANSLATION SCALE (${effectiveTranslationVariant === "sentence" ? "Single-Sentence Grammar" : "Focus on Grammar/Reading"}) - 400 Elo per tier:\n${buildTranslationDifficultyScale(effectiveTranslationVariant)}`;

        const targetTier = isListening ? listeningInstruction!.tier : translationTarget!.tier.tier;
        const specificInstruction = isListening
            ? `${listeningInstruction!.instruction} ⚠️ CRITICAL: COUNT YOUR WORDS! If you exceed the limit, SHORTEN the sentence. The word limit is STRICT.
LISTENING FEATURE TARGETS:
- CEFR MUST be exactly ${listeningTarget!.cefr}
- Clause count must be <= ${listeningTarget!.clauseMax}
- Memory load must be ${listeningTarget!.memoryLoad}
- Spoken naturalness must be ${listeningTarget!.spokenNaturalness}
- Reduced forms presence must be ${listeningTarget!.reducedFormsPresence}
- Training focus: ${listeningTarget!.trainingFocus}`
            : `TIER: ${translationTarget!.tier.tier} (${translationTarget!.tier.cefr}). CURRENT TARGET RANGE: ${translationTarget!.wordRange.min}-${translationTarget!.wordRange.max} words. ${translationTarget!.syntaxBand.promptInstruction}${effectiveTranslationVariant === "sentence" ? " HARD RULE: Output exactly one genuine sentence. No semicolons, no sentence stitching, no second full stop." : ""}`;

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

        const chunkingRules = isListening ? "" : `
【Adaptive Syntactic Chunking Guidelines】
MANDATORY: You MUST break the reference English sentence into 3-to-6 chunks. Do NOT blindly chop sentences into atomic word-by-word fragments, nor leave them as massive unreadable blocks. Instead, intelligently select a chunking strategy based on the sentence's grammatical focus:

STRATEGY 1: FIXED COLLOCATION & IDIOM PRESERVATION 
- If a sentence relies on a strong set phrase or idiom (e.g., "take for granted", "due to"), KEEP the phrase intact in a single chunk. Do NOT atomize it.

STRATEGY 2: CLAUSE-DRIVEN CHUNKING (For Inversions & Complex Syntax)
- If the sentence features inversions, subjunctives, or conditional clauses (e.g., "Were it not for...", "Not only have I..."), chunk by the logical clause boundaries so the user learns the structural skeleton.

STRATEGY 3: HEAVY-MODIFIER ISOLATION (For Dense Noun/Verb Phrases)
- If a sentence has a heavy core (long subject or complex verb chain), split the core from its trailing modifiers (infinitive phrases, participial phrases, prepositional phrases).
- e.g. "What he proposed" (Chunk 1) + "during the meeting" (Chunk 2) + "left everyone" (Chunk 3) + "completely speechless." (Chunk 4).

RULES FOR ALL STRATEGIES:
1. MAX LENGTH: A chunk should rarely exceed 5 words unless it is an unbreakable idiom.
2. NATIVE COLLOQUIAL CHINESE (说人话、拒绝直译腔): NEVER do literal word-for-word translation. Paraphrase (意译) the chunks so that when they are concatenated, they form extremely natural, spoken Chinese (大白话). 
  -> Terrible (Literal): "让他退缩的是我们变得多么公开" (What made him pull back / is how public we became)
  -> Excellent (Paraphrased): "真正让他打退堂鼓的原因，/ 是我们俩太高调了"
3. KEYWORD ANCHORS: Extract 1-2 KEY VOCABULARY or GRAMMAR HINTS (e.g., "Were it not for", "intervention"). Focus on the structural glue of the chunk.
`;

        const buildPrompt = (retryInstruction?: string) => {
            if (isScenario) {
                return `
[SCENARIO MODE | DIVERSITY SEED: ${randomSeed}]
You are an expert English coach.

${topicPrompt ? `=== CUSTOM TOPIC OVERRIDE ===\n${topicPrompt}\n==============================` : `Topic: "${articleTitle}"\nSpecific Situation: "${hyperSpecificTopic}"`}

Task:
${topicPrompt ? "1. strictly follow the CUSTOM TOPIC OVERRIDE criteria to invent your scenario." : "1. Invent a specific, realistic \"Micro-Scenario\" regarding this Topic."}
2. ${isListening
                        ? `Create a challenging English line someone would say in this context (for listening dictation).`
                        : `Build a sentence piece-by-piece using syntax chunks for a translation puzzle.`}
3. Ensure the target English line matches Elo ${currentElo}.
4. ${isListening
                        ? "Provide 3 DIFFERENT valid English translations/expressions for the same Chinese meaning. They should use different vocabulary, sentence structures, or phrasing while conveying the same core meaning. All must match the same Elo tier."
                        : "Provide exactly 2 ADDITIONAL valid English translations/expressions for the same meaning in 'reference_english_alternatives'. They should use different vocabulary, sentence structures, or phrasing while conveying the same core meaning. All must match the same Elo tier. Return exactly 2 strings in that array, no more and no less."}

Topic handling rules:
- Treat the topic as background direction, not as a keyword that must appear in the sentence.
- Do NOT explicitly repeat the topic label unless it is naturally necessary.
- Avoid the most obvious keywords normally associated with the topic when possible.
- For translation drills, 'reference_english_alternatives' must contain exactly 2 items. Never output 3 or more.

Tone & Language Guidelines:
- TRANSLATION TONE: The Chinese translation MUST absolutely be everyday, spoken colloquial Chinese (口语化、大白话). NEVER use highly formal, academic, or dramatic "translationese" (e.g., instead of "以期在不显防备的情况下...", use "不想搞得像是在防备一样..."). Imagine a real person speaking naturally.
- KEYWORD EXTRACTION: In syntax_chunks, extract 1-2 KEY VOCABULARY, GRAMMAR HINTS, or FIXED COLLOCATIONS (e.g. "not only", "living on", "suggest that"). STRICT RULE: DO NOT extract entire phrases that give away the whole answer like "outsource the tutoring". Provide hints, avoid full spoilers!

Constraint: ${difficultyPrompt}
${retryInstruction ? `\n${retryInstruction}\n` : ""}
Context: ${scenarioContext}
Style: ${scenarioStyleInstruction}
${chunkingRules}
Output strictly in JSON format:
{
  ${isListening ? '"natural_chinese_context": "Direct Chinese translation of the audio",' : ''}
  "target_english_vocab": ["Keyword1", "Keyword2"],
  "syntax_chunks": ${isListening ? '[]' : '[\n    {"role": "状语从句", "english": "Although his parents wanted", "chinese": "尽管他的父母想", "keywords": ["Although", "parents"]},\n    {"role": "谓语复合结构", "english": "to outsource the tutoring,", "chinese": "把辅导外包，", "keywords": ["outsource"]}\n  ]'},
  ${isListening ? '"reference_english": "The exact english audio transcript",' : ''}
  "reference_english_alternatives": ${isListening
                        ? '["Alternative translation 1", "Alternative translation 2", "Alternative translation 3"]'
                        : '["Alternative translation 1", "Alternative translation 2"]'},
  "_scenario_topic": "The specific micro-topic you invented",
  "_ai_difficulty_report": {
    "tier": "Your target tier name",
    "cefr": "Your target CEFR level",
    "word_count": "Number of words in your reference_english",
    "target_range": "Expected word range for this tier"
  },
  "_listening_features": {
    "word_count": 0,
    "clause_count": 0,
    "memory_load": "low | medium | high",
    "spoken_naturalness": "low | medium | high",
    "reduced_forms_presence": "minimal | some | frequent"
  },
  ${isListening ? `"_writing_guide_skip": true` : `"_writing_guide_skip": true`}
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
- Treat the topic as background direction, not as a keyword that must appear in the sentence.
- Do NOT explicitly repeat the topic label unless it is naturally necessary.
- Avoid the most obvious keywords normally associated with the topic when possible.

Task:
1. Identify the core theme and 2-3 vocabulary words.
${isListening
                    ? `2. Create a meaningful English sentence that reflects the theme. It should be challenging to listen to.
3. Provide the exact transcript as 'reference_english'.
4. Provide 3 alternative valid English expressions for the same meaning in 'reference_english_alternatives'.`
                    : `2. Build a sentence piece-by-piece using syntax chunks for a translation puzzle. It must reflect the theme.
3. Provide exactly 2 ADDITIONAL DIFFERENT valid English translations for the same meaning in 'reference_english_alternatives'. Use different vocabulary, sentence structures, or phrasing. All must match the same Elo tier. Return exactly 2 strings in that array, no more and no less.`}
${chunkingRules}
Output strictly in JSON format:
{
  ${isListening ? '"natural_chinese_context": "Direct Chinese translation of the audio",' : ''}
  "target_english_vocab": ["EnglishWord1", "EnglishWord2"],
  "syntax_chunks": ${isListening ? '[]' : '[\n    {"role": "状语从句", "english": "Although his parents wanted", "chinese": "尽管他的父母想", "keywords": ["Although", "parents"]},\n    {"role": "谓语复合结构", "english": "to outsource the tutoring,", "chinese": "把辅导外包，", "keywords": ["outsource"]}\n  ] (MANDATORY: Follow Chunking Guidelines. For keywords, extract 1-2 KEY VOCABULARY, GRAMMAR HINTS, or FIXED COLLOCATIONS (e.g. "not only", "living on", "suggest that"). STRICT RULE: DO NOT extract entire phrases that give away the whole answer like "outsource the tutoring" or "chose the dull report". Provide hints, avoid full spoilers!)'},
  ${isListening ? '"reference_english": "The exact english audio transcript",' : ''}
  "reference_english_alternatives": ${isListening
                    ? '["Alternative translation 1", "Alternative translation 2", "Alternative translation 3"]'
                    : '["Alternative translation 1", "Alternative translation 2"]'},
  "_ai_difficulty_report": {
    "tier": "Your target tier name",
    "cefr": "Your target CEFR level",
    "word_count": "Number of words in your reference_english",
    "target_range": "Expected word range for this tier"
  },
  "_listening_features": {
    "word_count": 0,
    "clause_count": 0,
    "memory_load": "low | medium | high",
    "spoken_naturalness": "low | medium | high",
    "reduced_forms_presence": "minimal | some | frequent"
  },
  ${isListening ? `"_writing_guide_skip": true` : `"_writing_guide_skip": true`}
}
            `.trim();
        };

        let lastGeneratedData: Record<string, unknown> | null = null;
        let lastDifficultyStatus: DrillDifficultyStatus = "UNVALIDATED";
        let lastActualWordCount = 0;
        let finalExpected: DifficultyExpectation;
        let finalListeningTarget: ListeningFeatureTarget | null = listeningTarget;
        let lastListeningValidation: ListeningValidation | null = null;
        let lastTranslationValidation: ReturnType<typeof validateTranslationDifficulty> | null = null;

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

        // Single attempt — no difficulty retry loop
        console.log(`[API] Generating drill for Elo ${currentElo}`);
        const completion = await requestCompletion(buildPrompt(), 3, provider, typeof nvidiaModel === "string" ? nvidiaModel : undefined);
        let content = completion.choices[0].message.content;
        if (!content) {
            throw new Error("No content generated");
        }

        // Clean up markdown wrapping (Gemma may wrap JSON in ```json...```)
        content = content.trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();

        const data = JSON.parse(content) as {
            chinese?: string;
            natural_chinese_context?: string;
            reference_english?: string;
            syntax_chunks?: Array<{
                chinese?: string;
                english?: string;
            }>;
            [key: string]: unknown;
        };
        
        // Unify standard keys from the new schema
        if (!isListening && Array.isArray(data.syntax_chunks) && data.syntax_chunks.length > 0) {
            // The absolute source of truth for the reference sentence MUST be the exact concatenation of the chunks.
            // This prevents the AI from hallucinating a "global" translation that slightly differs from its chunk-level translations,
            // which causes massive cognitive dissonance on the frontend.
            data.chinese = data.syntax_chunks.map((chunk) => chunk.chinese || "").join("");
        } else if (data.natural_chinese_context && !data.chinese) {
            data.chinese = data.natural_chinese_context;
        }
        if (!data.reference_english && Array.isArray(data.syntax_chunks) && data.syntax_chunks.length > 0) {
            // Reconstruct the reference english by perfectly sticking the syntax blocks together
            data.reference_english = data.syntax_chunks.map((chunk) => chunk.english || "").join(" ").replace(/\s+([.,!?])/g, "$1");
        }

        lastGeneratedData = data;

        if (isListening) {
            const validation = validateListeningDifficulty(data, listeningTarget!);
            lastListeningValidation = validation;
            lastActualWordCount = validation.actualWordCount;
            lastDifficultyStatus = validation.status;
            finalListeningTarget = listeningTarget!;
            console.log(`[Listening Difficulty] Target CEFR=${listeningTarget!.cefr}, range=${listeningTarget!.min}-${listeningTarget!.max}, status=${validation.status}`);
        } else {
            const translationValidation = validateTranslationDifficulty(
                data.reference_english || "",
                currentElo,
                effectiveTranslationVariant,
            );
            lastTranslationValidation = translationValidation;
            lastActualWordCount = translationValidation.actualWordCount;
            lastDifficultyStatus = translationValidation.status;
            console.log(`[Difficulty] Elo: ${currentElo}, Target: ${finalExpected.min}-${finalExpected.max} words, Actual: ${lastActualWordCount} words, Status: ${lastDifficultyStatus}`);
        }

        if (!lastGeneratedData) {
            throw new Error("Failed to generate drill");
        }

        const aiReport = lastGeneratedData._ai_difficulty_report && typeof lastGeneratedData._ai_difficulty_report === "object"
            ? lastGeneratedData._ai_difficulty_report as Record<string, unknown>
            : null;
        const aiReportedWordCount = typeof aiReport?.word_count === "string" || typeof aiReport?.word_count === "number"
            ? parseInt(String(aiReport.word_count), 10)
            : null;
        const wordCountMismatch = aiReportedWordCount !== null && aiReportedWordCount !== lastActualWordCount;

        console.log(`[Difficulty Result] Elo: ${currentElo}, Mode: ${drillMode}`);
        console.log(`  Expected: ${finalExpected.min}-${finalExpected.max} words (${finalExpected.tier} / ${finalExpected.cefr})`);
        console.log(`  Actual: ${lastActualWordCount} words | AI Reported: ${aiReportedWordCount ?? 'N/A'} | Status: ${lastDifficultyStatus}`);
        if (aiReport) {
            console.log(`  AI Self-Report: Tier=${String(aiReport.tier ?? "N/A")}, CEFR=${String(aiReport.cefr ?? "N/A")}, Range=${String(aiReport.target_range ?? "N/A")}`);
        }
        if (wordCountMismatch) {
            console.log(`  ⚠️ AI WORD COUNT MISMATCH: Reported ${aiReportedWordCount} but actual is ${lastActualWordCount}`);
        }

        return NextResponse.json({
            ...lastGeneratedData,
            // Ensure alternatives are always an array (some models skip this field)
            reference_english_alternatives: Array.isArray(lastGeneratedData.reference_english_alternatives)
                ? lastGeneratedData.reference_english_alternatives
                    .filter((a: unknown) => typeof a === 'string' && a.trim())
                    .slice(0, isListening ? 3 : 2)
                : [],
            _topicMeta: {
                topic: articleTitle || "随机场景",
                subTopic: lastGeneratedData._scenario_topic || null,
                isScenario,
                provider,
            },
            _difficultyMeta: {
                requestedElo: currentElo,
                tier: finalExpected.tier,
                cefr: finalExpected.cefr,
                expectedWordRange: { min: finalExpected.min, max: finalExpected.max },
                actualWordCount: lastActualWordCount,
                isValid: isListening
                    ? lastDifficultyStatus === "MATCHED"
                    : lastTranslationValidation?.isValid ?? null,
                status: lastDifficultyStatus,
                aiSelfReport: aiReport ? {
                    tier: aiReport.tier,
                    cefr: aiReport.cefr,
                    wordCount: aiReportedWordCount,
                    targetRange: aiReport.target_range,
                    wordCountAccurate: !wordCountMismatch,
                } : null,
                ...(isListening ? {
                    listeningFeatures: {
                        memoryLoad: finalListeningTarget?.memoryLoad ?? null,
                        spokenNaturalness: finalListeningTarget?.spokenNaturalness ?? null,
                        reducedFormsPresence: finalListeningTarget?.reducedFormsPresence ?? null,
                        clauseMax: finalListeningTarget?.clauseMax ?? null,
                        trainingFocus: finalListeningTarget?.trainingFocus ?? null,
                        downgraded: Boolean(finalListeningTarget?.downgraded),
                    },
                    listeningValidation: lastListeningValidation ? {
                        reportedCefr: lastListeningValidation.reportedCefr,
                        issues: lastListeningValidation.issues,
                        featureReport: lastListeningValidation.featureReport,
                    } : null,
                } : {
                    translationValidation: lastTranslationValidation ? {
                        validationRange: lastTranslationValidation.validationRange,
                        tolerance: lastTranslationValidation.tolerance,
                        variant: effectiveTranslationVariant,
                        issues: lastTranslationValidation.issues,
                    } : null,
                }),
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
