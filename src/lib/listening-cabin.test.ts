import { describe, expect, it } from "vitest";

import {
    buildListeningCabinAudioCacheKey,
    buildListeningCabinPrompt,
    canonicalizeListeningCabinSentenceSpeakers,
    buildListeningCabinMixedAudioCacheKey,
    buildListeningCabinNarrationSegments,
    buildListeningCabinNarrationText,
    buildListeningCabinPlaybackChunks,
    buildListeningCabinSentenceTimings,
    createListeningCabinSession,
    LISTENING_CABIN_RANDOM_TOPIC_POOLS,
    LISTENING_CABIN_RANDOM_TOPIC_POOL_SIZE_PER_MODE,
    lintListeningCabinDraft,
    normalizeListeningCabinRequest,
    normalizeListeningCabinSentences,
    pickListeningCabinRandomTopic,
    playbackRateToTtsRate,
    resolveListeningCabinLengthProfile,
    resolveListeningCabinTopicPrompt,
    validateListeningCabinRequest,
} from "./listening-cabin";

describe("listening cabin helpers", () => {
    it("normalizes v2 request fields and keeps invalid mode checks for validation", () => {
        const request = normalizeListeningCabinRequest({
            prompt: "  travel role play  ",
            topicMode: "manual",
            scriptMode: "monologue",
            style: "casual_chatty",
            focusTags: ["numbers_and_dates"],
            cefrLevel: "B1",
            lexicalDensity: "balanced",
            sentenceLength: "medium",
            scriptLength: "short",
            speakerPlan: {
                strategy: "fixed",
                primaryVoice: "en-US-AvaNeural",
                assignments: [{ speaker: "Narrator", voice: "en-US-AvaNeural" }],
            },
        });

        expect(request.prompt).toBe("travel role play");
        expect(request.scriptLength).toBe("short");
        expect(request.thinkingMode).toBe("standard");
        expect(validateListeningCabinRequest(request)).toBeNull();
    });

    it("maps legacy style values to new style set", () => {
        const request = normalizeListeningCabinRequest({
            style: "daily_conversation" as unknown as never,
        });

        expect(request.style).toBe("natural");
    });

    it("supports podcast mode and normalizes speakers to 2-4", () => {
        const request = normalizeListeningCabinRequest({
            prompt: "",
            topicMode: "random",
            scriptMode: "podcast",
            speakerPlan: {
                strategy: "mixed_dialogue",
                primaryVoice: "en-US-AvaNeural",
                assignments: [
                    { speaker: "Host", voice: "en-US-AvaNeural" },
                    { speaker: "Guest 1", voice: "en-US-BrianNeural" },
                    { speaker: "Guest 2", voice: "en-US-EmmaNeural" },
                    { speaker: "Guest 3", voice: "en-US-AndrewNeural" },
                    { speaker: "Guest 4", voice: "en-US-DavisNeural" },
                ],
            },
        });

        expect(request.scriptMode).toBe("podcast");
        expect(request.speakerPlan.assignments).toHaveLength(4);
        expect(request.speakerPlan.assignments[0]?.speaker).toBe("Ava");
        expect(validateListeningCabinRequest(request)).toBeNull();
    });

    it("enforces unique voices in multi-speaker mode and rejects duplicates", () => {
        const request = normalizeListeningCabinRequest({
            scriptMode: "dialogue",
            topicMode: "random",
            speakerPlan: {
                strategy: "mixed_dialogue",
                primaryVoice: "en-US-AvaNeural",
                assignments: [
                    { speaker: "Ava", voice: "en-US-AvaNeural" },
                    { speaker: "Ava 2", voice: "en-US-AvaNeural" },
                ],
            },
        });

        expect(new Set(request.speakerPlan.assignments.map((assignment) => assignment.voice)).size).toBe(2);
        expect(validateListeningCabinRequest({
            ...request,
            speakerPlan: {
                ...request.speakerPlan,
                assignments: [
                    { speaker: "Ava", voice: "en-US-AvaNeural" },
                    { speaker: "Emma", voice: "en-US-AvaNeural" },
                ],
            },
        })).toBe("Multi-speaker mode requires unique voices per speaker.");
    });

    it("validates empty prompt for manual topic mode", () => {
        const request = normalizeListeningCabinRequest({
            prompt: "   ",
            topicMode: "manual",
            scriptMode: "monologue",
        });

        expect(validateListeningCabinRequest(request)).toBe("Prompt is required for manual topic mode.");
    });

    it("derives word/sentence profile from script length and sentence length", () => {
        const profile = resolveListeningCabinLengthProfile("long", "long");

        expect(profile.estimatedMinutes).toBe(10);
        expect(profile.targetWords).toBeGreaterThan(1000);
        expect(profile.sentenceWordRange.min).toBeGreaterThanOrEqual(16);
        expect(profile.targetSentenceRange).toEqual({ min: 40, max: 60 });
    });

    it("supports an ultra-long profile for extended listening sessions", () => {
        const profile = resolveListeningCabinLengthProfile("ultra_long", "medium");

        expect(profile.estimatedMinutes).toBe(18);
        expect(profile.targetSentenceRange).toEqual({ min: 70, max: 100 });
        expect(profile.targetWords).toBe(1360);
        expect(profile.targetWordRange.max).toBeGreaterThan(1700);
    });

    it("provides 2500 de-duplicated random topics per mode", () => {
        expect(LISTENING_CABIN_RANDOM_TOPIC_POOL_SIZE_PER_MODE).toBe(2500);
        (["monologue", "dialogue", "podcast"] as const).forEach((mode) => {
            const pool = LISTENING_CABIN_RANDOM_TOPIC_POOLS[mode];
            expect(pool.length).toBe(2500);
            expect(new Set(pool).size).toBe(2500);
        });
    });

    it("picks stable random topics for the same seed and mode", () => {
        const first = pickListeningCabinRandomTopic("seed-123", "dialogue");
        const second = pickListeningCabinRandomTopic("seed-123", "dialogue");
        expect(first).toBe(second);
        expect(first.startsWith("对话模式：")).toBe(true);
        expect(typeof first).toBe("string");
        expect(first.length).toBeGreaterThan(0);
    });

    it("uses ai topic directly in hybrid mode when topicSource is ai", () => {
        const resolved = resolveListeningCabinTopicPrompt(normalizeListeningCabinRequest({
            topicMode: "hybrid",
            topicSource: "ai",
            prompt: "单人口播：一个幽默又自然的晨会开场主题。",
        }));

        expect(resolved.effectivePrompt).toBe("单人口播：一个幽默又自然的晨会开场主题。");
    });

    it("includes playback rate in the audio cache key", () => {
        const first = buildListeningCabinAudioCacheKey("Hello world", "en-US-JennyNeural", 1);
        const second = buildListeningCabinAudioCacheKey("Hello world", "en-US-JennyNeural", 0.85);

        expect(first).not.toBe(second);
    });

    it("builds mixed-voice cache keys with segment data", () => {
        const first = buildListeningCabinMixedAudioCacheKey(
            [
                { text: "Hello there.", voice: "en-US-AvaNeural" },
                { text: "Hi, nice to meet you.", voice: "en-US-BrianNeural" },
            ],
            1,
        );
        const second = buildListeningCabinMixedAudioCacheKey(
            [
                { text: "Hello there.", voice: "en-US-AvaNeural" },
            ],
            1,
        );

        expect(first).not.toBe(second);
    });

    it("converts playback rate into the edge-tts rate format", () => {
        expect(playbackRateToTtsRate(1)).toBe("+0%");
        expect(playbackRateToTtsRate(0.85)).toBe("-15%");
        expect(playbackRateToTtsRate(1.2)).toBe("+20%");
    });

    it("builds a full narration text from ordered sentences", () => {
        expect(buildListeningCabinNarrationText([
            { index: 1, english: "Good morning, everyone.", chinese: "大家早上好。" },
            { index: 2, english: "Today I'd like to walk you through our launch plan.", chinese: "今天我想带你过一遍上线计划。" },
        ])).toBe("Good morning, everyone. Today I'd like to walk you through our launch plan.");
    });

    it("builds per-speaker narration segments in dialogue mode", () => {
        const segments = buildListeningCabinNarrationSegments({
            scriptMode: "dialogue",
            sentences: [
                { index: 1, speaker: "Speaker A", english: "Good morning.", chinese: "早上好。", pace: "slow", emotion: "calm" },
                { index: 2, speaker: "Speaker B", english: "Morning, let's start.", chinese: "早上好，我们开始吧。", pace: "fast", emotion: "cheerful" },
            ],
            speakerPlan: {
                strategy: "mixed_dialogue",
                primaryVoice: "en-US-AvaNeural",
                assignments: [
                    { speaker: "Speaker A", voice: "en-US-AvaNeural" },
                    { speaker: "Speaker B", voice: "en-US-BrianNeural" },
                ],
            },
        });

        expect(segments).toEqual([
            { text: "Good morning.", voice: "en-US-AvaNeural", rate: "-12%" },
            { text: "Morning, let's start.", voice: "en-US-BrianNeural", rate: "+10%" },
        ]);
    });

    it("builds per-speaker narration segments in podcast mode", () => {
        const segments = buildListeningCabinNarrationSegments({
            scriptMode: "podcast",
            sentences: [
                { index: 1, speaker: "Host", english: "Welcome back to our weekly show.", chinese: "欢迎回到我们每周节目。" },
                { index: 2, speaker: "Guest 1", english: "Happy to be here, thanks for inviting me.", chinese: "很高兴来这里，感谢邀请。" },
            ],
            speakerPlan: {
                strategy: "mixed_dialogue",
                primaryVoice: "en-US-AvaNeural",
                assignments: [
                    { speaker: "Host", voice: "en-US-AvaNeural" },
                    { speaker: "Guest 1", voice: "en-US-BrianNeural" },
                ],
            },
        });

        expect(segments).toEqual([
            { text: "Welcome back to our weekly show.", voice: "en-US-AvaNeural", rate: "+0%" },
            { text: "Happy to be here, thanks for inviting me.", voice: "en-US-BrianNeural", rate: "+0%" },
        ]);
    });

    it("canonicalizes generated speaker labels to configured speaker names", () => {
        const mapped = canonicalizeListeningCabinSentenceSpeakers({
            scriptMode: "dialogue",
            speakerPlan: {
                strategy: "mixed_dialogue",
                primaryVoice: "en-US-JennyNeural",
                assignments: [
                    { speaker: "Jenny", voice: "en-US-JennyNeural" },
                    { speaker: "晓晓", voice: "zh-CN-XiaoxiaoNeural" },
                ],
            },
            sentences: [
                { index: 1, speaker: "Speaker A", english: "Hi there.", chinese: "你好。" },
                { index: 2, speaker: "Speaker B", english: "Nice to meet you.", chinese: "很高兴见到你。" },
            ],
        });

        expect(mapped[0]?.speaker).toBe("Jenny");
        expect(mapped[1]?.speaker).toBe("晓晓");
    });

    it("keeps subtitle playback chunks at one sentence each", () => {
        expect(buildListeningCabinPlaybackChunks([
            { index: 1, english: "Good morning, everyone.", chinese: "大家早上好。" },
            { index: 2, english: "Today I'd like to walk you through our launch plan.", chinese: "今天我想带你过一遍上线计划。" },
        ])).toEqual([
            {
                id: "1",
                sentenceIndexes: [0],
                text: "Good morning, everyone.",
            },
            {
                id: "2",
                sentenceIndexes: [1],
                text: "Today I'd like to walk you through our launch plan.",
            },
        ]);
    });

    it("maps full-audio word marks back to sentence timings", () => {
        const timings = buildListeningCabinSentenceTimings(
            [
                { index: 1, english: "Good morning, everyone.", chinese: "大家早上好。" },
                { index: 2, english: "Today I'd like to walk you through our launch plan.", chinese: "今天我想带你过一遍上线计划。" },
            ],
            [
                { time: 0, start: 0, end: 180, type: "word", value: "Good" },
                { time: 220, start: 220, end: 480, type: "word", value: "morning" },
                { time: 1100, start: 1100, end: 1320, type: "word", value: "Today" },
                { time: 1360, start: 1360, end: 1490, type: "word", value: "I'd" },
                { time: 1520, start: 1520, end: 1640, type: "word", value: "like" },
                { time: 1680, start: 1680, end: 1780, type: "word", value: "to" },
                { time: 1820, start: 1820, end: 1980, type: "word", value: "walk" },
                { time: 2020, start: 2020, end: 2140, type: "word", value: "you" },
                { time: 2180, start: 2180, end: 2400, type: "word", value: "through" },
                { time: 2440, start: 2440, end: 2520, type: "word", value: "our" },
                { time: 2560, start: 2560, end: 2820, type: "word", value: "launch" },
                { time: 2860, start: 2860, end: 3080, type: "word", value: "plan" },
            ],
        );

        expect(timings).toEqual([
            { index: 1, startMs: 0, endMs: 1076 },
            { index: 2, startMs: 1100, endMs: 3080 },
        ]);
    });

    it("returns zeroed timings when marks are missing so the player can apply duration fallback", () => {
        expect(buildListeningCabinSentenceTimings(
            [
                { index: 1, english: "Good morning, everyone.", chinese: "大家早上好。" },
                { index: 2, english: "Today I'd like to walk you through our launch plan.", chinese: "今天我想带你过一遍上线计划。" },
            ],
            [],
        )).toEqual([
            { index: 1, startMs: 0, endMs: 0 },
            { index: 2, startMs: 0, endMs: 0 },
        ]);
    });

    it("creates a local session with v2 strategy fields", () => {
        const session = createListeningCabinSession({
            response: {
                title: "Daily Standup",
                sourcePrompt: "做一个晨会脚本",
                sentences: [
                    { index: 1, english: "Good morning team.", chinese: "团队早上好。" },
                ],
                meta: {
                    cefrLevel: "B1",
                    targetWords: 200,
                    estimatedMinutes: 2.2,
                    scriptMode: "monologue",
                    speakerCount: 1,
                    model: "deepseek-chat",
                    topicSeed: "seed-1",
                    resolvedSpeakerPlan: {
                        strategy: "fixed",
                        primaryVoice: "en-US-AriaNeural",
                        assignments: [{ speaker: "Narrator", voice: "en-US-AriaNeural" }],
                    },
                },
            },
            request: {
                prompt: "做一个晨会脚本",
                topicMode: "manual",
                topicSource: "manual",
                scriptMode: "monologue",
                thinkingMode: "standard",
                style: "professional",
                focusTags: ["business_vocabulary"],
                cefrLevel: "B1",
                lexicalDensity: "balanced",
                sentenceLength: "medium",
                scriptLength: "short",
                speakerPlan: {
                    strategy: "fixed",
                    primaryVoice: "en-US-AriaNeural",
                    assignments: [{ speaker: "Narrator", voice: "en-US-AriaNeural" }],
                },
            },
            showChineseSubtitle: true,
        });

        expect(session.voice).toBe("en-US-AriaNeural");
        expect(session.playbackRate).toBe(1);
        expect(session.topicMode).toBe("manual");
        expect(session.scriptLength).toBe("short");
        expect(session.showChineseSubtitle).toBe(true);
        expect(session.lastSentenceIndex).toBe(0);
        expect(session.id).toBeTruthy();
    });

    it("normalizes sentence emotion and pace with safe defaults", () => {
        const sentences = normalizeListeningCabinSentences(
            [
                { english: "Hello there.", chinese: "你好。", emotion: "unknown", pace: "ultra" },
            ],
            4,
            "monologue",
        );

        expect(sentences[0]?.emotion).toBe("neutral");
        expect(sentences[0]?.pace).toBe("normal");
    });

    it("asks the model to use rare natural repetition for emotional delivery", () => {
        const request = normalizeListeningCabinRequest({
            prompt: "做一个有情绪起伏的单人口播",
            topicMode: "manual",
            scriptMode: "monologue",
            scriptLength: "ultra_long",
        });
        const profile = resolveListeningCabinLengthProfile(request.scriptLength, request.sentenceLength);
        const prompt = buildListeningCabinPrompt({
            request,
            effectivePrompt: request.prompt,
            profile,
            speakerPlan: request.speakerPlan,
        });

        expect(prompt).toContain("occasional natural repetition");
        expect(prompt).toContain("that, that is not true");
    });

    it("uses gentler lint thresholds for ultra-long scripts", () => {
        const request = normalizeListeningCabinRequest({
            prompt: "做一个超长单人口播",
            topicMode: "manual",
            scriptMode: "monologue",
            scriptLength: "ultra_long",
            sentenceLength: "medium",
        });
        const profile = resolveListeningCabinLengthProfile(request.scriptLength, request.sentenceLength);
        const sentences = Array.from({ length: 60 }, (_, index) => ({
            index: index + 1,
            english: "This week I want to share a practical way to stay steady when work feels heavy and the pressure keeps building around you.",
            chinese: "这周我想分享一种实用方法，帮助你在工作压力不断累积时保持稳定。",
            emotion: "calm" as const,
            pace: "normal" as const,
        }));

        const lint = lintListeningCabinDraft({
            title: "Ultra Long Practice",
            sentences,
            request,
            profile,
        });

        expect(lint.issues).not.toContain("overall script is too short for the selected script length");
        expect(lint.issues).not.toContain("sentence rhythm is too choppy; lines are too short");
    });

    it("requires long scripts to stay within the configured sentence-count band", () => {
        const request = normalizeListeningCabinRequest({
            prompt: "做一个长篇单人口播",
            topicMode: "manual",
            scriptMode: "monologue",
            scriptLength: "long",
            sentenceLength: "medium",
        });
        const profile = resolveListeningCabinLengthProfile(request.scriptLength, request.sentenceLength);
        const sentences = Array.from({ length: 32 }, (_, index) => ({
            index: index + 1,
            english: "Today I want to share a practical story about how people handle pressure at work without losing their sense of rhythm or balance.",
            chinese: "今天我想分享一个实用故事，讲讲人们如何在工作压力下依然保持节奏和平衡。",
            emotion: "serious" as const,
            pace: "normal" as const,
        }));

        const lint = lintListeningCabinDraft({
            title: "Long Practice",
            sentences,
            request,
            profile,
        });

        expect(lint.issues).toContain("sentence count is too low for the selected script length");
    });
});
