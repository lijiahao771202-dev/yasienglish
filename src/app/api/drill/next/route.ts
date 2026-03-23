import { NextRequest, NextResponse } from "next/server";

import { POST as generateAiDrill } from "@/app/api/ai/generate_drill/route";
import {
    buildRebuildAiDrill,
    buildRebuildDrill,
    buildListeningBankDrill,
    getListeningDifficultyExpectation,
    type DrillSourceMode,
    selectListeningBankItem,
} from "@/lib/listening-drill-bank";
import { deepseek } from "@/lib/deepseek";
import { getRebuildBandPosition, getRebuildDistractorCount, getRebuildPracticeTier, tokenizeRebuildSentence } from "@/lib/rebuild-mode";
import { countWords } from "@/lib/translationDifficulty";

type DrillRouteBody = {
    articleTitle?: string;
    articleContent?: string;
    difficulty?: string;
    eloRating?: number;
    mode?: "translation" | "listening" | "rebuild";
    bossType?: string;
    sourceMode?: DrillSourceMode;
    excludeBankIds?: string[];
};

function sanitizeTokenArray(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
}

async function generateRebuildAiDrill(params: {
    topic: string;
    effectiveElo: number;
}) {
    const { topic, effectiveElo } = params;
    const practiceTier = getRebuildPracticeTier(effectiveElo);
    const listeningTarget = getListeningDifficultyExpectation(effectiveElo);
    const bandPosition = getRebuildBandPosition(effectiveElo);
    const distractorCount = getRebuildDistractorCount(effectiveElo, () => 0.51);

    const prompt = `
You are generating a JSON object for an English listening rebuild puzzle.

Topic: "${topic}"
Effective Elo: ${effectiveElo}
CEFR: ${practiceTier.cefr}
Band Position: ${bandPosition ?? "mid"}
Target word count: ${listeningTarget.min}-${listeningTarget.max}
Target distractor count: ${distractorCount}

Requirements:
- Create ONE natural English sentence for a listening rebuild puzzle.
- The sentence must fit the topic, but do not just repeat the topic label.
- Add a specific micro-scene in "_scenario_topic".
- Return "reference_english", "chinese", "answer_tokens", and "distractor_tokens".
- "answer_tokens" must match the sentence tokenization exactly, with punctuation attached to the word.
- "distractor_tokens" must be plausible confusers, not random junk words.
- Distractor tokens must NOT duplicate answer tokens.
- Keep the sentence within the target word-count range.

Return valid JSON only:
{
  "chinese": "...",
  "reference_english": "...",
  "_scenario_topic": "...",
  "answer_tokens": ["..."],
  "distractor_tokens": ["...", "..."]
}
`.trim();

    const completion = await deepseek.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are a strict JSON-only rebuild puzzle generator. Follow the requested topic and difficulty exactly.",
            },
            { role: "user", content: prompt },
        ],
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        temperature: 0.85,
    });

    const rawContent = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(rawContent) as Record<string, unknown>;
    const referenceEnglish = typeof parsed.reference_english === "string" ? parsed.reference_english.trim() : "";
    const chinese = typeof parsed.chinese === "string" ? parsed.chinese.trim() : "";
    const scene = typeof parsed._scenario_topic === "string" && parsed._scenario_topic.trim()
        ? parsed._scenario_topic.trim()
        : "AI Rebuild";

    if (!referenceEnglish || !chinese) {
        throw new Error("AI rebuild generator returned incomplete content.");
    }

    const answerTokens = sanitizeTokenArray(parsed.answer_tokens);
    const tokenizedSentence = tokenizeRebuildSentence(referenceEnglish);
    const finalAnswerTokens = answerTokens.length === tokenizedSentence.length ? answerTokens : tokenizedSentence;
    const actualWordCount = countWords(referenceEnglish);
    const finalDistractors = sanitizeTokenArray(parsed.distractor_tokens);

    if (actualWordCount < listeningTarget.min || actualWordCount > listeningTarget.max) {
        throw new Error(`AI rebuild generator returned word count ${actualWordCount}, outside ${listeningTarget.min}-${listeningTarget.max}.`);
    }

    return buildRebuildAiDrill({
        chinese,
        referenceEnglish,
        theme: topic,
        scene,
        answerTokens: finalAnswerTokens,
        distractorTokens: finalDistractors,
        candidateId: `rebuild-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    }, effectiveElo);
}

export async function POST(req: NextRequest) {
    const body = await req.json() as DrillRouteBody;
    const requestedMode = body.mode === "rebuild"
        ? "rebuild"
        : body.mode === "listening"
            ? "listening"
            : "translation";
    const sourceMode = body.sourceMode === "bank" ? "bank" : "ai";
    const mode = requestedMode;
    const eloRating = typeof body.eloRating === "number" ? body.eloRating : 400;

    if (sourceMode === "bank" && (mode === "listening" || mode === "rebuild")) {
        const item = selectListeningBankItem({
            elo: eloRating,
            excludeIds: body.excludeBankIds,
        });

        if (!item) {
            return NextResponse.json(
                { error: "No listening bank item available for the current Elo." },
                { status: 404 },
            );
        }

        return NextResponse.json(
            mode === "rebuild"
                ? buildRebuildDrill(item, eloRating)
                : buildListeningBankDrill(item, eloRating),
        );
    }

    if (mode === "rebuild" && sourceMode === "ai") {
        const topic = typeof body.articleTitle === "string" && body.articleTitle.trim()
            ? body.articleTitle.trim()
            : "随机场景";
        try {
            const drill = await generateRebuildAiDrill({
                topic,
                effectiveElo: eloRating,
            });
            return NextResponse.json(drill);
        } catch (error) {
            console.error("Rebuild AI generation failed, falling back to bank:", error);
            const fallbackItem = selectListeningBankItem({
                elo: eloRating,
                excludeIds: body.excludeBankIds,
            });
            if (!fallbackItem) {
                return NextResponse.json(
                    { error: "Failed to generate rebuild drill and no bank fallback is available." },
                    { status: 500 },
                );
            }
            return NextResponse.json(buildRebuildDrill(fallbackItem, eloRating));
        }
    }

    return generateAiDrill({
        json: async () => ({
            ...body,
            mode: mode === "rebuild" ? "listening" : mode,
        }),
    } as NextRequest);
}
