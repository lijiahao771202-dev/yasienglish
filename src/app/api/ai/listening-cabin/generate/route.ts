import { NextResponse } from "next/server";

import { deepseek } from "@/lib/deepseek";
import {
    buildListeningCabinPrompt,
    buildListeningCabinRepairPrompt,
    canonicalizeListeningCabinSentenceSpeakers,
    isListeningCabinMultiSpeakerMode,
    LISTENING_CABIN_MULTI_SPEAKER_MAX,
    LISTENING_CABIN_MULTI_SPEAKER_MIN,
    lintListeningCabinDraft,
    normalizeListeningCabinRequest,
    normalizeListeningCabinSentences,
    pickListeningCabinRandomTopic,
    resolveListeningCabinLengthProfile,
    resolveListeningCabinSpeakerPlanForGeneration,
    resolveListeningCabinTopicPrompt,
    validateListeningCabinRequest,
    type ListeningCabinGenerationRequest,
    type ListeningCabinSentence,
} from "@/lib/listening-cabin";

type ModelJson = {
    title?: unknown;
    sentences?: unknown;
};

function resolveListeningCabinGenerationModel(thinkingMode: ListeningCabinGenerationRequest["thinkingMode"]) {
    return thinkingMode === "deep" ? "deepseek-reasoner" : "deepseek-chat";
}

async function generateDraftJson(prompt: string, model: string) {
    console.log("CREATE FUNC:", deepseek.chat.completions.create);
    const completion = await deepseek.chat.completions.create({
        model,
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
        response_format: { type: "json_object" },
    });
    console.log("completion is:", completion);

    const content = completion.choices[0]?.message?.content;
    if (!content) {
        throw new Error("No content received from listening cabin generation.");
    }

    try {
        return JSON.parse(content) as ModelJson;
    } catch {
        const compact = content.replace(/\s+/g, " ").trim();
        const preview = compact.slice(0, 220);
        throw new Error(
            `Listening cabin generation returned invalid JSON${preview ? `: ${preview}${compact.length > 220 ? "..." : ""}` : ""}`,
        );
    }
}

function normalizeDraft(
    raw: ModelJson,
    request: ListeningCabinGenerationRequest,
    maxSentences: number,
    resolvedSpeakerPlan: ListeningCabinGenerationRequest["speakerPlan"],
) {
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const normalizedSentences = normalizeListeningCabinSentences(raw.sentences, maxSentences, request.scriptMode);
    const sentences = canonicalizeListeningCabinSentenceSpeakers({
        scriptMode: request.scriptMode,
        speakerPlan: resolvedSpeakerPlan,
        sentences: normalizedSentences,
    });
    return { title, sentences };
}

function buildModeSpecificIssues(request: ListeningCabinGenerationRequest, sentences: ListeningCabinSentence[]) {
    const issues: string[] = [];

    if (request.scriptMode === "monologue") {
        const hasSpeakerValue = sentences.some((sentence) => Boolean(sentence.speaker));
        if (hasSpeakerValue) {
            issues.push("monologue mode should not include speaker fields");
        }
    } else if (isListeningCabinMultiSpeakerMode(request.scriptMode)) {
        const speakerSet = new Set(sentences.map((sentence) => sentence.speaker?.trim()).filter(Boolean));
        const modeLabel = request.scriptMode === "podcast" ? "podcast" : "dialogue";
        const expectedSpeakers = request.speakerPlan.assignments
            .map((assignment) => assignment.speaker.trim())
            .filter(Boolean);
        const missingSpeakers = expectedSpeakers.filter((speaker) => !speakerSet.has(speaker));
        if (speakerSet.size < LISTENING_CABIN_MULTI_SPEAKER_MIN) {
            issues.push(`${modeLabel} mode needs at least two valid speaker turns`);
        }
        if (speakerSet.size > LISTENING_CABIN_MULTI_SPEAKER_MAX) {
            issues.push(`${modeLabel} mode supports at most four speakers`);
        }
        if (missingSpeakers.length > 0) {
            issues.push(`${modeLabel} output is missing configured speakers: ${missingSpeakers.join(", ")}`);
        }
    }

    return issues;
}

export async function POST(req: Request) {
    try {
        const rawPayload = await req.json().catch(() => null);
        const request = normalizeListeningCabinRequest(rawPayload);
        const validationError = validateListeningCabinRequest(request);

        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }

        const profile = resolveListeningCabinLengthProfile(request.scriptLength, request.sentenceLength);
        const topicResolution = resolveListeningCabinTopicPrompt(request);
        const effectivePrompt = topicResolution.effectivePrompt || pickListeningCabinRandomTopic(`${Date.now()}`, request.scriptMode);
        const model = resolveListeningCabinGenerationModel(request.thinkingMode);
        const resolvedSpeakerPlan = resolveListeningCabinSpeakerPlanForGeneration(
            request,
            `${effectivePrompt}-${topicResolution.topicSeed ?? "no-seed"}`,
        );

        const draftPrompt = buildListeningCabinPrompt({
            request,
            effectivePrompt,
            profile,
            speakerPlan: resolvedSpeakerPlan,
        });
        const firstDraftRaw = await generateDraftJson(draftPrompt, model);
        const firstDraft = normalizeDraft(
            firstDraftRaw,
            request,
            profile.targetSentenceRange.max + 12,
            resolvedSpeakerPlan,
        );
        const firstLint = lintListeningCabinDraft({
            title: firstDraft.title,
            sentences: firstDraft.sentences,
            request,
            profile,
        });
        const firstModeIssues = buildModeSpecificIssues(request, firstDraft.sentences);

        const needsRepair = !firstLint.isValid || firstModeIssues.length > 0;

        let finalTitle = firstDraft.title;
        let finalSentences = firstDraft.sentences;
        let finalLint = firstLint;
        let finalModeIssues = firstModeIssues;

        if (needsRepair) {
            const repairPrompt = buildListeningCabinRepairPrompt({
                request,
                effectivePrompt,
                profile,
                speakerPlan: resolvedSpeakerPlan,
                previousDraft: {
                    title: firstDraft.title || "Untitled",
                    sentences: firstDraft.sentences,
                },
                issues: [...firstLint.issues, ...firstModeIssues],
            });
            const repairedRaw = await generateDraftJson(repairPrompt, model);
            const repaired = normalizeDraft(
                repairedRaw,
                request,
                profile.targetSentenceRange.max + 12,
                resolvedSpeakerPlan,
            );
            finalLint = lintListeningCabinDraft({
                title: repaired.title,
                sentences: repaired.sentences,
                request,
                profile,
            });
            finalModeIssues = buildModeSpecificIssues(request, repaired.sentences);
            finalTitle = repaired.title;
            finalSentences = repaired.sentences;
        }

        if (!finalTitle || finalSentences.length === 0 || !finalLint.isValid || finalModeIssues.length > 0) {
            return NextResponse.json(
                {
                    error: "AI listening script unavailable",
                    issues: [...finalLint.issues, ...finalModeIssues],
                },
                { status: 502 },
            );
        }

        const speakerCount = isListeningCabinMultiSpeakerMode(request.scriptMode)
            ? new Set(finalSentences.map((sentence) => sentence.speaker?.trim()).filter(Boolean)).size
            : 1;

        return NextResponse.json({
            title: finalTitle,
            sourcePrompt: effectivePrompt,
            sentences: finalSentences,
            meta: {
                cefrLevel: request.cefrLevel,
                targetWords: profile.targetWords,
                estimatedMinutes: profile.estimatedMinutes,
                scriptMode: request.scriptMode,
                speakerCount: Math.max(1, speakerCount),
                model,
                topicSeed: topicResolution.topicSeed ?? undefined,
                resolvedSpeakerPlan,
            },
        });
    } catch (error) {
        console.error("Listening cabin generation error:", error);
        const details = error instanceof Error ? error.message : "Unknown listening cabin generation error";
        return NextResponse.json(
            {
                error: "Failed to generate listening cabin script",
                details,
            },
            { status: 500 },
        );
    }
}
