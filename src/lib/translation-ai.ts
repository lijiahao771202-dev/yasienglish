import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { createDeepSeekClientForCurrentUserWithOverride, deepseek, type OpenAiCompatibleClient } from "@/lib/deepseek";
import { countWords, getTranslationDifficultyTarget } from "@/lib/translationDifficulty";

const TRANSLATION_UPSTREAM_MAX_ATTEMPTS = 3;

function sanitizeTextValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isRetryableTranslationUpstreamError(error: unknown) {
    if (!(error instanceof Error)) return false;

    const cause = error.cause;
    const causeCode = cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code?: unknown }).code ?? "")
        : "";
    const message = error.message.toLowerCase();

    return (
        causeCode === "UND_ERR_SOCKET"
        || causeCode === "ECONNRESET"
        || causeCode === "ETIMEDOUT"
        || causeCode === "ECONNABORTED"
        || causeCode === "EAI_AGAIN"
        || message.includes("terminated")
        || message.includes("socket")
        || message.includes("timeout")
        || message.includes("network")
        || message.includes("fetch failed")
    );
}

async function createTranslationCompletionWithRetry(
    request: ChatCompletionCreateParamsNonStreaming,
    client: OpenAiCompatibleClient = deepseek,
) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= TRANSLATION_UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await client.chat.completions.create(request);
        } catch (error) {
            lastError = error;
            if (!isRetryableTranslationUpstreamError(error) || attempt === TRANSLATION_UPSTREAM_MAX_ATTEMPTS) {
                throw error;
            }

            console.warn(
                `[Translation AI] Retrying passage generation after upstream failure (${attempt}/${TRANSLATION_UPSTREAM_MAX_ATTEMPTS}).`,
                error,
            );
        }
    }

    throw lastError instanceof Error ? lastError : new Error("Translation upstream request failed.");
}

function sanitizeSegmentPayload(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    const referenceEnglish = sanitizeTextValue(candidate.reference_english ?? candidate.referenceEnglish);
    const chinese = sanitizeTextValue(candidate.chinese);
    const alternatives = Array.isArray(candidate.reference_english_alternatives)
        ? candidate.reference_english_alternatives.map(a => sanitizeTextValue(a)).filter(Boolean).slice(0, 2)
        : [];
        
    const syntaxChunks = Array.isArray(candidate.syntax_chunks)
        ? candidate.syntax_chunks.map((chunk: any) => ({
            role: sanitizeTextValue(chunk.role),
            english: sanitizeTextValue(chunk.english),
            chinese: sanitizeTextValue(chunk.chinese),
        })).filter(c => c.role && c.english)
        : undefined;

    if (!referenceEnglish || !chinese) return null;

    return {
        chinese,
        referenceEnglish,
        alternatives,
        syntaxChunks,
    };
}

export async function generateTranslationPassageAiDrill(params: {
    topic: string;
    topicPrompt?: string;
    effectiveElo: number;
    segmentCount: 2 | 3 | 5;
    provider?: "deepseek" | "glm" | "nvidia" | "github";
    nvidiaModel?: string;
}) {
    const { topic, topicPrompt, effectiveElo, segmentCount } = params;
    const client = params.provider
        ? await createDeepSeekClientForCurrentUserWithOverride({
            provider: params.provider,
            nvidiaModel: params.nvidiaModel,
        })
        : deepseek;
    const target = getTranslationDifficultyTarget(effectiveElo, "passage");
    const sessionId = `translation-passage-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const prompt = `
You are generating JSON for a short, cohesive Chinese paragraph to be translated into English by a student.

Display topic: "${topic}"
${topicPrompt?.trim() ? `Scenario brief:\n${topicPrompt.trim()}` : `Scenario brief:\nTopic: ${topic}`}
Difficulty target:
- Tier: ${target.tier.tier} (${target.tier.cefr})
- Per-segment expected length: ${target.wordRange.min}-${target.wordRange.max} words
- Syntax Focus: ${target.syntaxBand.promptInstruction}
Segments: ${segmentCount}
Each segment should be ONE natural Chinese sentence.

Requirements:
- Create ONE coherent Chinese short passage split into exactly ${segmentCount} natural segments.
- Provide a golden 'reference_english' translation for each segment that fits the difficulty tier.
- Provide exactly 2 additional 'reference_english_alternatives' for each segment. Return exactly 2 strings in that array, no more and no less.
- MUST provide 'syntax_chunks' array containing the exact syntactic breakdown of the 'reference_english' sentence. Map each logical syntactic block (e.g. Subject, Verb, Object, Adverbial) to its English string and the corresponding Chinese string. The concatenation of all 'syntax_chunks' english strings (joined by spaces) MUST EXACTLY MATCH the 'reference_english' string.
- All segments must stay on the same topic and same difficulty.
- Each segment must be meaningful and grammatically complete.
- Return only "_scenario_topic" and "segments".

Return valid JSON only:
{
  "_scenario_topic": "...",
  "segments": [
    {
      "chinese": "交通堵塞导致我很晚才到。",
      "reference_english": "The traffic jam caused me to arrive very late.",
      "reference_english_alternatives": ["...", "..."],
      "syntax_chunks": [
        { "role": "主语", "english": "The traffic jam", "chinese": "交通堵塞" },
        { "role": "谓语", "english": "caused", "chinese": "导致" },
        { "role": "宾语", "english": "me", "chinese": "我" },
        { "role": "宾补/状语", "english": "to arrive very late", "chinese": "很晚才到" }
      ]
    }
  ]
}
`.trim();

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const completion = await createTranslationCompletionWithRetry({
                messages: [
                    {
                        role: "system",
                        content: "You are a strict JSON-only generator for Translation drills. Output valid JSON and follow the scenario and difficulty exactly. Ensure 'segments' array contains the specific fields.",
                    },
                    { role: "user", content: prompt },
                ],
                model: "deepseek-chat",
                response_format: { type: "json_object" },
                temperature: 0.8,
            }, client);

            const rawContent = completion.choices[0]?.message?.content ?? "{}";
            const parsed = JSON.parse(rawContent) as Record<string, unknown>;
            const scene = sanitizeTextValue(parsed._scenario_topic) || "AI Translation Passage";
            const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
            const segments = rawSegments
                .map(sanitizeSegmentPayload)
                .filter((segment): segment is NonNullable<ReturnType<typeof sanitizeSegmentPayload>> => Boolean(segment));

            if (segments.length !== segmentCount) {
                throw new Error(`Expected ${segmentCount} segments, received ${segments.length}.`);
            }

            const firstSegment = segments[0];

            return {
                chinese: firstSegment.chinese,
                reference_english: firstSegment.referenceEnglish,
                reference_english_alternatives: firstSegment.alternatives,
                _topicMeta: {
                    topic,
                    subTopic: scene,
                    isScenario: true,
                },
                _difficultyMeta: {
                    requestedElo: effectiveElo,
                    tier: target.tier.tier,
                    cefr: target.tier.cefr,
                    expectedWordRange: {
                        min: target.wordRange.min,
                        max: target.wordRange.max,
                    },
                    actualWordCount: countWords(firstSegment.referenceEnglish),
                    isValid: true,
                    status: "MATCHED" as const,
                    aiSelfReport: null,
                },
                _translationMeta: {
                    variant: "passage" as const,
                    effectiveElo,
                    passageSession: {
                        sessionId,
                        segmentCount,
                        currentIndex: 0,
                        segments: segments.map((segment, index) => ({
                            id: `${sessionId}-${index + 1}`,
                            chinese: segment.chinese,
                            referenceEnglish: segment.referenceEnglish,
                            alternatives: segment.alternatives,
                            syntaxChunks: segment.syntaxChunks?.length ? segment.syntaxChunks : undefined,
                            wordCount: countWords(segment.referenceEnglish),
                        })),
                    },
                },
            };
        } catch (error) {
            if (isRetryableTranslationUpstreamError(error)) {
                throw error;
            }
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to generate translation passage drill.");
}
