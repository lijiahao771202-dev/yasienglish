import { buildRebuildAiDrill, getListeningDifficultyExpectation } from "@/lib/listening-drill-bank";
import { deepseek } from "@/lib/deepseek";
import { getRebuildBandPosition, getRebuildPracticeTier } from "@/lib/rebuild-mode";

function sanitizeTextValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

export async function generateRebuildAiDrill(params: {
    topic: string;
    effectiveElo: number;
}) {
    const { topic, effectiveElo } = params;
    const practiceTier = getRebuildPracticeTier(effectiveElo);
    const listeningTarget = getListeningDifficultyExpectation(effectiveElo);
    const bandPosition = getRebuildBandPosition(effectiveElo);

    const prompt = `
You are generating a JSON object for an English listening rebuild puzzle.

Topic: "${topic}"
Effective Elo: ${effectiveElo}
CEFR: ${practiceTier.cefr}
Band Position: ${bandPosition ?? "mid"}
Target word count: ${listeningTarget.min}-${listeningTarget.max}

Requirements:
- Create ONE natural English sentence for a listening rebuild puzzle.
- The sentence must fit the topic, but do not just repeat the topic label.
- Add a specific micro-scene in "_scenario_topic".
- Return only "reference_english", "chinese", and "_scenario_topic".
- Keep the sentence within the target word-count range.

Return valid JSON only:
{
  "chinese": "...",
  "reference_english": "...",
  "_scenario_topic": "..."
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
    const referenceEnglish = sanitizeTextValue(parsed.reference_english);
    const chinese = sanitizeTextValue(parsed.chinese);
    const scene = sanitizeTextValue(parsed._scenario_topic) || "AI Rebuild";

    if (!referenceEnglish || !chinese) {
        throw new Error("AI rebuild generator returned incomplete content.");
    }

    return buildRebuildAiDrill({
        chinese,
        referenceEnglish,
        theme: topic,
        scene,
        candidateId: `rebuild-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    }, effectiveElo);
}
