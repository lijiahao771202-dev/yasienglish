import { describe, expect, it } from "vitest";

import {
    buildListeningCabinAudioCacheKey,
    buildListeningCabinNarrationText,
    buildListeningCabinPlaybackChunks,
    buildListeningCabinSentenceTimings,
    createListeningCabinSession,
    normalizeListeningCabinRequest,
    playbackRateToTtsRate,
    validateListeningCabinRequest,
} from "./listening-cabin";

describe("listening cabin helpers", () => {
    it("keeps invalid sentence counts visible to validation instead of silently clamping", () => {
        const request = normalizeListeningCabinRequest({
            prompt: "  travel role play  ",
            style: "travel",
            focusTags: ["numbers_and_dates"],
            cefrLevel: "B1",
            targetDurationMinutes: 3,
            sentenceCount: 30,
        });

        expect(request.prompt).toBe("travel role play");
        expect(request.sentenceCount).toBe(30);
        expect(validateListeningCabinRequest(request)).toBe("Sentence count must be between 3 and 24.");
    });

    it("includes playback rate in the audio cache key", () => {
        const first = buildListeningCabinAudioCacheKey("Hello world", "en-US-JennyNeural", 1);
        const second = buildListeningCabinAudioCacheKey("Hello world", "en-US-JennyNeural", 0.85);

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

    it("creates a local session with persisted playback defaults", () => {
        const session = createListeningCabinSession({
            response: {
                title: "Daily Standup",
                sourcePrompt: "做一个晨会脚本",
                sentences: [
                    { index: 1, english: "Good morning team.", chinese: "团队早上好。" },
                ],
                meta: {
                    cefrLevel: "B1",
                    targetDurationMinutes: 3,
                    sentenceCount: 1,
                    model: "deepseek-chat",
                },
            },
            request: {
                prompt: "做一个晨会脚本",
                style: "workplace",
                focusTags: ["business_vocabulary"],
                cefrLevel: "B1",
                targetDurationMinutes: 3,
                sentenceCount: 8,
            },
            voice: "en-US-AriaNeural",
            playbackRate: 0.95,
            showChineseSubtitle: true,
        });

        expect(session.voice).toBe("en-US-AriaNeural");
        expect(session.playbackRate).toBe(0.95);
        expect(session.showChineseSubtitle).toBe(true);
        expect(session.lastSentenceIndex).toBe(0);
        expect(session.id).toBeTruthy();
    });
});
