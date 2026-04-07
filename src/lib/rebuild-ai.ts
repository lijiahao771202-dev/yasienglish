import { buildRebuildAiDrill, getListeningDifficultyExpectation, type DrillSourceMode } from "@/lib/listening-drill-bank";
import { deepseek } from "@/lib/deepseek";
import {
    buildRebuildTokenBank,
    collectRebuildDistractors,
    getRebuildBandPosition,
    getRebuildPracticeTier,
    tokenizeRebuildSentence,
} from "@/lib/rebuild-mode";
import {
    buildRebuildPassageDifficultyProfile,
    validateRebuildPassageSegments,
} from "@/lib/rebuild-passage";
import { countWords } from "@/lib/translationDifficulty";

const REBUILD_UPSTREAM_MAX_ATTEMPTS = 3;

function sanitizeTextValue(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isRetryableRebuildUpstreamError(error: unknown) {
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

async function createRebuildCompletionWithRetry(
    request: Parameters<typeof deepseek.chat.completions.create>[0],
    label: "sentence" | "passage",
) {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= REBUILD_UPSTREAM_MAX_ATTEMPTS; attempt += 1) {
        try {
            return await deepseek.chat.completions.create(request);
        } catch (error) {
            lastError = error;
            if (!isRetryableRebuildUpstreamError(error) || attempt === REBUILD_UPSTREAM_MAX_ATTEMPTS) {
                throw error;
            }

            console.warn(
                `[Rebuild AI] Retrying ${label} generation after upstream failure (${attempt}/${REBUILD_UPSTREAM_MAX_ATTEMPTS}).`,
                error,
            );
        }
    }

    throw lastError instanceof Error ? lastError : new Error("Rebuild upstream request failed.");
}

function sanitizeSegmentPayload(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const candidate = value as Record<string, unknown>;
    const referenceEnglish = sanitizeTextValue(candidate.reference_english ?? candidate.referenceEnglish);
    const chinese = sanitizeTextValue(candidate.chinese);
    if (!referenceEnglish || !chinese) return null;

    const answerTokens = Array.isArray(candidate.answer_tokens)
        ? candidate.answer_tokens.map((item) => sanitizeTextValue(item)).filter(Boolean)
        : Array.isArray(candidate.answerTokens)
            ? candidate.answerTokens.map((item) => sanitizeTextValue(item)).filter(Boolean)
            : undefined;
    const distractorTokens = Array.isArray(candidate.distractor_tokens)
        ? candidate.distractor_tokens.map((item) => sanitizeTextValue(item)).filter(Boolean)
        : Array.isArray(candidate.distractorTokens)
            ? candidate.distractorTokens.map((item) => sanitizeTextValue(item)).filter(Boolean)
            : undefined;

    return {
        chinese,
        referenceEnglish,
        answerTokens,
        distractorTokens,
    };
}

function buildPassageSegmentDrill(params: {
    chinese: string;
    referenceEnglish: string;
    effectiveElo: number;
    theme: string;
    scene: string;
    relatedBankTokens: string[];
    answerTokens?: string[];
    distractorTokens?: string[];
}) {
    const {
        chinese,
        referenceEnglish,
        effectiveElo,
        theme,
        scene,
        relatedBankTokens,
        answerTokens,
        distractorTokens: aiDistractorTokens,
    } = params;
    const resolvedAnswerTokens = answerTokens?.length ? answerTokens : tokenizeRebuildSentence(referenceEnglish);
    const normalizedAnswerSet = new Set(resolvedAnswerTokens.map((token) => token.toLowerCase()));
    const supplementDistractors = collectRebuildDistractors({
        answerTokens: resolvedAnswerTokens,
        effectiveElo,
        relatedBankTokens,
    });
    const distractorTokens = Array.from(new Set([
        ...(aiDistractorTokens ?? []).filter((token) => !normalizedAnswerSet.has(token.toLowerCase())),
        ...supplementDistractors,
    ])).slice(0, Math.max(2, supplementDistractors.length));

    return {
        chinese,
        referenceEnglish,
        answerTokens: resolvedAnswerTokens,
        distractorTokens,
        tokenBank: buildRebuildTokenBank({
            answerTokens: resolvedAnswerTokens,
            distractorTokens,
        }),
        wordCount: countWords(referenceEnglish),
        theme,
        scene,
    };
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

    const completion = await createRebuildCompletionWithRetry({
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
    }, "sentence");

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

export async function generateRebuildPassageAiDrill(params: {
    topic: string;
    effectiveElo: number;
    segmentCount: 2 | 3 | 5;
}) {
    const { topic, effectiveElo, segmentCount } = params;
    const practiceTier = getRebuildPracticeTier(effectiveElo);
    const bandPosition = getRebuildBandPosition(effectiveElo);
    const difficultyProfile = buildRebuildPassageDifficultyProfile(effectiveElo, segmentCount);
    const sessionId = `rebuild-passage-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const prompt = `
You are generating a JSON object for an English rebuild passage session.

Topic: "${topic}"
Effective Elo: ${effectiveElo}
CEFR: ${practiceTier.cefr}
Band Position: ${bandPosition ?? "mid"}
Segments: ${segmentCount}
Each segment should be ONE natural English sentence.
Per-segment target mean: ${difficultyProfile.perSegmentWordWindow.mean} words
Per-segment preferred band: ${difficultyProfile.perSegmentWordWindow.softMin}-${difficultyProfile.perSegmentWordWindow.softMax} words
Per-segment hard limit: ${difficultyProfile.perSegmentWordWindow.hardMin}-${difficultyProfile.perSegmentWordWindow.hardMax} words
Whole-passage preferred band: ${difficultyProfile.totalWordWindow.softMin}-${difficultyProfile.totalWordWindow.softMax} words
Whole-passage hard limit: ${difficultyProfile.totalWordWindow.hardMin}-${difficultyProfile.totalWordWindow.hardMax} words
Clause max per segment: ${difficultyProfile.syntaxComplexity.clauseMax}
Memory load: ${difficultyProfile.syntaxComplexity.memoryLoad}
Spoken naturalness: ${difficultyProfile.syntaxComplexity.spokenNaturalness}
Reduced forms: ${difficultyProfile.syntaxComplexity.reducedFormsPresence}

Requirements:
- Create ONE coherent short passage split into exactly ${segmentCount} natural segments.
- All segments must stay on the same topic and same difficulty.
- Prefer the soft word-count band, and lean toward the upper half of that band so the passage feels substantial.
- You may go slightly outside the preferred band, but never outside the hard limit.
- Never shorten a sentence so much that it becomes unnatural or incomplete.
- Each segment should feel like a full sentence in a short article update, not a clipped textbook fragment.
- Return only "_scenario_topic" and "segments".
- Each segment must contain "reference_english" and "chinese".

Return valid JSON only:
{
  "_scenario_topic": "...",
  "segments": [
    {
      "reference_english": "...",
      "chinese": "..."
    }
  ]
}
`.trim();

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            const completion = await createRebuildCompletionWithRetry({
                messages: [
                    {
                        role: "system",
                        content: "You are a strict JSON-only rebuild passage generator. Follow the requested topic and difficulty exactly.",
                    },
                    { role: "user", content: prompt },
                ],
                model: "deepseek-chat",
                response_format: { type: "json_object" },
                temperature: 0.8,
            }, "passage");

            const rawContent = completion.choices[0]?.message?.content ?? "{}";
            const parsed = JSON.parse(rawContent) as Record<string, unknown>;
            const scene = sanitizeTextValue(parsed._scenario_topic) || "AI Passage Rebuild";
            const rawSegments = Array.isArray(parsed.segments) ? parsed.segments : [];
            const segments = rawSegments
                .map(sanitizeSegmentPayload)
                .filter((segment): segment is NonNullable<ReturnType<typeof sanitizeSegmentPayload>> => Boolean(segment));

            if (segments.length !== segmentCount) {
                throw new Error(`Expected ${segmentCount} segments, received ${segments.length}.`);
            }

            const validation = validateRebuildPassageSegments({
                profile: difficultyProfile,
                segments: segments.map((segment) => segment.referenceEnglish),
            });

            if (!validation.isValid) {
                throw new Error("Generated passage failed validation.");
            }

            const relatedBankTokens = tokenizeRebuildSentence(`${topic} ${scene} ${segments.map((segment) => segment.referenceEnglish).join(" ")}`);
            const sessionSegments = segments.map((segment, index) => buildPassageSegmentDrill({
                ...segment,
                effectiveElo,
                theme: topic,
                scene,
                relatedBankTokens: relatedBankTokens.filter((_, tokenIndex) => tokenIndex % segmentCount !== index % segmentCount),
            }));
            const firstSegment = sessionSegments[0];

            return {
                chinese: firstSegment.chinese,
                target_english_vocab: Array.from(new Set(
                    sessionSegments
                        .flatMap((segment) => segment.answerTokens)
                        .map((token) => token.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
                        .filter((token) => token.length > 0),
                )).slice(0, 8),
                reference_english: firstSegment.referenceEnglish,
                _topicMeta: {
                    topic,
                    subTopic: scene,
                    isScenario: true,
                },
                _sourceMeta: {
                    sourceMode: "ai" as DrillSourceMode,
                    bandPosition,
                    candidateId: sessionId,
                },
                _difficultyMeta: {
                    requestedElo: effectiveElo,
                    tier: getListeningDifficultyExpectation(effectiveElo).tier,
                    cefr: practiceTier.cefr,
                    expectedWordRange: {
                        min: difficultyProfile.perSegmentWordWindow.hardMin,
                        max: difficultyProfile.perSegmentWordWindow.hardMax,
                    },
                    actualWordCount: countWords(firstSegment.referenceEnglish),
                    isValid: true,
                    status: "MATCHED" as const,
                    aiSelfReport: null,
                    listeningFeatures: {
                        memoryLoad: difficultyProfile.syntaxComplexity.memoryLoad,
                        spokenNaturalness: difficultyProfile.syntaxComplexity.spokenNaturalness,
                        reducedFormsPresence: difficultyProfile.syntaxComplexity.reducedFormsPresence,
                        clauseMax: difficultyProfile.syntaxComplexity.clauseMax,
                        trainingFocus: difficultyProfile.syntaxComplexity.trainingFocus,
                        downgraded: false,
                    },
                },
                _rebuildMeta: {
                    variant: "passage" as const,
                    effectiveElo,
                    bandPosition,
                    answerTokens: firstSegment.answerTokens,
                    tokenBank: firstSegment.tokenBank,
                    distractorTokens: firstSegment.distractorTokens,
                    theme: topic,
                    scene,
                    feedbackStyle: "strong" as const,
                    candidateId: sessionId,
                    candidateSource: "ai" as const,
                    passageSession: {
                        sessionId,
                        segmentCount,
                        currentIndex: 0,
                        difficultyProfile,
                        segments: sessionSegments.map((segment, index) => ({
                            id: `${sessionId}-${index + 1}`,
                            chinese: segment.chinese,
                            referenceEnglish: segment.referenceEnglish,
                            answerTokens: segment.answerTokens,
                            distractorTokens: segment.distractorTokens,
                            tokenBank: segment.tokenBank,
                            wordCount: segment.wordCount,
                        })),
                    },
                },
            };
        } catch (error) {
            if (isRetryableRebuildUpstreamError(error)) {
                throw error;
            }
            lastError = error;
        }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to generate rebuild passage drill.");
}
