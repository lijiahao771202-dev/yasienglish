/* @vitest-environment jsdom */

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getListeningCabinNarrationTtsPayloadMock, updateListeningCabinSessionMock } = vi.hoisted(() => ({
    getListeningCabinNarrationTtsPayloadMock: vi.fn(),
    updateListeningCabinSessionMock: vi.fn(),
}));

vi.mock("@/lib/listening-cabin-audio", () => ({
    getListeningCabinNarrationTtsPayload: getListeningCabinNarrationTtsPayloadMock,
}));

vi.mock("@/lib/listening-cabin-store", () => ({
    updateListeningCabinSession: updateListeningCabinSessionMock,
}));

import { useListeningCabinPlayer } from "./useListeningCabinPlayer";
import type { ListeningCabinSession } from "@/lib/listening-cabin";

type PlayerHandle = ReturnType<typeof useListeningCabinPlayer>;

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
};

let mockSeekSnapbackSeconds = 0;

class MockAudio {
    src = "";
    preload = "auto";
    duration = 9;
    paused = true;
    muted = false;

    private currentTimeValue = 0;

    get currentTime() {
        return this.currentTimeValue;
    }

    set currentTime(value: number) {
        const snappedValue = value > 0
            ? Math.max(0, value - mockSeekSnapbackSeconds)
            : value;
        this.currentTimeValue = snappedValue;
    }

    readonly load = vi.fn(() => {
        this.dispatch("loadedmetadata");
    });

    readonly play = vi.fn(async () => {
        this.paused = false;
        this.dispatch("play");
    });

    readonly pause = vi.fn(() => {
        if (this.paused) {
            return;
        }

        this.paused = true;
        this.dispatch("pause");
    });

    private listeners = new Map<string, Set<(event: Event) => void>>();

    addEventListener(type: string, listener: (event: Event) => void) {
        const listeners = this.listeners.get(type) ?? new Set<(event: Event) => void>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: (event: Event) => void) {
        this.listeners.get(type)?.delete(listener);
    }

    dispatch(type: string) {
        for (const listener of this.listeners.get(type) ?? []) {
            listener(new Event(type));
        }
    }
}

function createDeferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;

    const promise = new Promise<T>((nextResolve, nextReject) => {
        resolve = nextResolve;
        reject = nextReject;
    });

    return { promise, resolve, reject };
}

function registerLatestAudio(audio: MockAudio) {
    return audio;
}

function buildSession(): ListeningCabinSession {
    return {
        id: "session-1",
        title: "Morning Brief",
        sourcePrompt: "做一个单人口播",
        sentences: [
            { index: 1, english: "Good morning, everyone.", chinese: "大家早上好。" },
            { index: 2, english: "Today I want to walk you through our plan.", chinese: "今天我想带你过一遍我们的计划。" },
            { index: 3, english: "By the end, you should know what matters most.", chinese: "听完以后，你应该知道最重要的重点是什么。" },
        ],
        meta: {
            cefrLevel: "B1",
            targetWords: 200,
            estimatedMinutes: 2.2,
            scriptMode: "monologue",
            speakerCount: 1,
            model: "deepseek-chat",
        },
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
        sentenceCount: 3,
        topicSeed: null,
        voice: "en-US-AriaNeural",
        playbackRate: 1,
        showChineseSubtitle: true,
        created_at: Date.now(),
        updated_at: Date.now(),
        lastSentenceIndex: 0,
        lastPlayedAt: null,
    };
}

function buildDialogueSession(): ListeningCabinSession {
    return {
        ...buildSession(),
        scriptMode: "dialogue",
        sentences: [
            { index: 1, speaker: "Ava", english: "Welcome back everyone.", chinese: "欢迎大家回来。" },
            { index: 2, speaker: "Brian", english: "Let's review the progress first.", chinese: "我们先回顾进展。" },
            { index: 3, speaker: "Ava", english: "Great, then we can plan next steps.", chinese: "很好，然后我们来计划下一步。" },
        ],
        meta: {
            ...buildSession().meta,
            scriptMode: "dialogue",
            speakerCount: 2,
        },
        speakerPlan: {
            strategy: "mixed_dialogue",
            primaryVoice: "en-US-AvaNeural",
            assignments: [
                { speaker: "Ava", voice: "en-US-AvaNeural" },
                { speaker: "Brian", voice: "en-US-BrianNeural" },
            ],
        },
    };
}

function PlayerHarness({
    session,
    onUpdate,
}: {
    session: ListeningCabinSession;
    onUpdate: (player: PlayerHandle) => void;
}) {
    const player = useListeningCabinPlayer({ session });

    useEffect(() => {
        onUpdate(player);
    }, [onUpdate, player]);

    return null;
}

async function flushMicrotasks() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe("useListeningCabinPlayer", () => {
    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    let latestPlayer: PlayerHandle | null;
    let latestAudio: MockAudio | null;

    beforeEach(() => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        mockSeekSnapbackSeconds = 0;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        latestPlayer = null;
        latestAudio = null;

        class MockAudioConstructor extends MockAudio {
            constructor() {
                super();
                latestAudio = registerLatestAudio(this);
            }
        }

        vi.stubGlobal("Audio", MockAudioConstructor);

        getListeningCabinNarrationTtsPayloadMock.mockReset();
        updateListeningCabinSessionMock.mockReset();
    });

    afterEach(async () => {
        await act(async () => {
            root.unmount();
        });
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    it("auto-advances subtitles sentence by sentence using duration fallback timings", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://narration",
            marks: [],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });

        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        expect(latestPlayer.playerState.isPlaying).toBe(true);

        await act(async () => {
            latestAudio.currentTime = 3.2;
            latestAudio.dispatch("timeupdate");
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
        expect(latestPlayer.currentSubtitleSentences[0]?.index).toBe(2);
    });

    it("keeps the current subtitle through sentence boundary and switches with a small delay", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://narration",
            marks: [],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });

        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.currentTime = 2.0;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);

        await act(async () => {
            latestAudio.currentTime = 2.1;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);

        await act(async () => {
            latestAudio.currentTime = 2.9;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);

        await act(async () => {
            latestAudio.currentTime = 3.05;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
    });

    it("does not let initial autoplay override a pause while narration is still loading", async () => {
        const deferred = createDeferred<{ audio: string; marks: [] }>();
        getListeningCabinNarrationTtsPayloadMock.mockReturnValue(deferred.promise);

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });

        if (!latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestPlayer?.pausePlayback();
        });

        deferred.resolve({
            audio: "mock://narration",
            marks: [],
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        expect(latestAudio.play).not.toHaveBeenCalled();
        expect(latestPlayer.playerState.isPlaying).toBe(false);
    });

    it("allows next-sentence navigation after the narration is ready", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://narration",
            marks: [],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });

        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            await latestPlayer?.nextSentenceAction();
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
        expect(latestAudio.currentTime).toBeCloseTo(3, 3);

        await act(async () => {
            latestPlayer?.pausePlayback();
        });

        expect(latestPlayer.playerState.isPlaying).toBe(false);
        expect(latestAudio.pause).toHaveBeenCalled();
    });

    it("re-seeks the current sentence instead of resuming a stale later timestamp in auto-all mode", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://narration",
            marks: [],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });

        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestPlayer?.setAutoAllMode();
            latestPlayer?.pausePlayback();
        });

        await act(async () => {
            latestAudio.currentTime = 3.2;
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);

        await act(async () => {
            await latestPlayer?.resumeOrPlay();
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);
        expect(latestAudio.currentTime).toBeCloseTo(0, 3);
        expect(latestPlayer.playerState.isPlaying).toBe(true);
    });

    it("replays the current sentence on play in single-pause mode instead of continuing into the next one", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://narration",
            marks: [],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });

        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
        });

        await act(async () => {
            latestAudio.currentTime = 3.1;
            latestAudio.dispatch("timeupdate");
        });

        expect(latestPlayer.playerState.isPlaying).toBe(false);
        expect(latestAudio.currentTime).toBeGreaterThanOrEqual(2.88);
        expect(latestAudio.currentTime).toBeLessThanOrEqual(3.05);

        await act(async () => {
            await latestPlayer?.resumeOrPlay();
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);
        expect(latestAudio.currentTime).toBeCloseTo(0, 3);
        expect(latestPlayer.playerState.isPlaying).toBe(true);
    });

    it("keeps playback active when jumping to later sentences in single-pause mode", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 1200 },
                { index: 2, startMs: 1300, endMs: 2500 },
                { index: 3, startMs: 2600, endMs: 3900 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 3.9;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
            await latestPlayer?.nextSentenceAction();
        });

        await act(async () => {
            latestAudio.currentTime = 1.33;
            latestAudio.dispatch("timeupdate");
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
        expect(latestPlayer.playerState.isPlaying).toBe(true);
    });

    it("falls back to even timings when segment timings are unreliable in single-pause mode", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 120 },
                { index: 2, startMs: 120, endMs: 240 },
                { index: 3, startMs: 240, endMs: 360 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 9;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
            await latestPlayer?.nextSentenceAction();
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
        expect(latestAudio.currentTime).toBeGreaterThan(2.5);
        expect(latestPlayer.playerState.isPlaying).toBe(true);
    });

    it("applies single-pause mode immediately by replaying the current sentence from start", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://narration",
            marks: [],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });

        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.currentTime = 1.45;
            latestAudio.dispatch("timeupdate");
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);
        expect(latestPlayer.playerState.isPlaying).toBe(true);

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);
        expect(latestPlayer.playerState.isPlaying).toBe(true);
        expect(latestAudio.currentTime).toBeCloseTo(0, 3);
    });

    it("re-initializes playback correctly under StrictMode remounts", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://narration",
            marks: [],
        });

        await act(async () => {
            root.render(
                <StrictMode>
                    <PlayerHarness
                        session={buildSession()}
                        onUpdate={(player) => {
                            latestPlayer = player;
                        }}
                    />
                </StrictMode>,
            );
        });

        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        expect(latestAudio.src).toBe("mock://narration");
        expect(latestPlayer.playerState.isPlaying).toBe(true);

        await act(async () => {
            latestAudio.currentTime = 3.2;
            latestAudio.dispatch("timeupdate");
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
    });

    it("uses segmentTimings in dialogue mode without aggressive early subtitle switching", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 1200 },
                { index: 2, startMs: 1300, endMs: 2500 },
                { index: 3, startMs: 2600, endMs: 3900 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 3.9;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestAudio.currentTime = 0.35;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);

        await act(async () => {
            latestAudio.currentTime = 1.29;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);

        await act(async () => {
            latestAudio.currentTime = 1.31;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
    });

    it("progressively corrects segment timing drift so later sentences still advance into the final subtitle", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 900 },
                { index: 2, startMs: 920, endMs: 1800 },
                { index: 3, startMs: 1820, endMs: 2700 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 3.6;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestAudio.currentTime = 1.6;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);

        await act(async () => {
            latestAudio.currentTime = 2.45;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(2);
    });

    it("does not shrink segment timings when browser duration is slightly shorter, avoiding cumulative early switching", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 1000 },
                { index: 2, startMs: 1000, endMs: 2000 },
                { index: 3, startMs: 2000, endMs: 3000 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 2.7;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestAudio.currentTime = 1.85;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);

        await act(async () => {
            latestAudio.currentTime = 2.02;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(2);
    });

    it("can resume playback after switching between single-pause and repeat modes", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 1200 },
                { index: 2, startMs: 1300, endMs: 2500 },
                { index: 3, startMs: 2600, endMs: 3900 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 3.9;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestPlayer?.pausePlayback();
        });
        expect(latestPlayer.playerState.isPlaying).toBe(false);

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
            latestPlayer?.setRepeatCurrentMode();
        });

        await act(async () => {
            await latestPlayer?.resumeOrPlay();
        });

        expect(latestPlayer.playerState.isPlaying).toBe(true);
        expect(latestAudio.play).toHaveBeenCalled();
    });

    it("keeps full sentence tail in single-pause mode and only pauses near segment boundary", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 1200 },
                { index: 2, startMs: 1300, endMs: 2500 },
                { index: 3, startMs: 2600, endMs: 3900 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 3.9;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
        });

        await act(async () => {
            latestAudio.currentTime = 1.2;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.isPlaying).toBe(true);

        await act(async () => {
            latestAudio.currentTime = 1.25;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.isPlaying).toBe(false);
        expect(latestAudio.currentTime).toBeGreaterThanOrEqual(1.24);
    });

    it("compensates for backward seek drift in single-pause mode so it does not leak previous audio or cut the current sentence early", async () => {
        mockSeekSnapbackSeconds = 0.2;

        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 1200 },
                { index: 2, startMs: 1300, endMs: 2500 },
                { index: 3, startMs: 2600, endMs: 3900 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 3.9;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
            await latestPlayer?.nextSentenceAction();
        });

        expect(latestAudio.currentTime).toBeCloseTo(1.1, 2);
        expect(latestAudio.muted).toBe(true);
        mockSeekSnapbackSeconds = 0;

        await act(async () => {
            latestAudio.currentTime = 1.32;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestAudio.muted).toBe(false);
        expect(latestPlayer.playerState.isPlaying).toBe(true);

        await act(async () => {
            latestAudio.currentTime = 2.5;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.isPlaying).toBe(true);

        await act(async () => {
            latestAudio.currentTime = 2.72;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.isPlaying).toBe(false);
    });

    it("restarts current sentence immediately when switching from auto-all to single-pause", async () => {
        getListeningCabinNarrationTtsPayloadMock.mockResolvedValue({
            audio: "mock://dialogue",
            marks: [],
            segmentTimings: [
                { index: 1, startMs: 0, endMs: 1200 },
                { index: 2, startMs: 1300, endMs: 2500 },
                { index: 3, startMs: 2600, endMs: 3900 },
            ],
        });

        await act(async () => {
            root.render(
                <PlayerHarness
                    session={buildDialogueSession()}
                    onUpdate={(player) => {
                        latestPlayer = player;
                    }}
                />,
            );
        });
        await flushMicrotasks();

        if (!latestAudio || !latestPlayer) {
            throw new Error("Player did not initialize");
        }

        await act(async () => {
            latestAudio.duration = 3.9;
            latestAudio.dispatch("loadedmetadata");
        });

        await act(async () => {
            latestAudio.currentTime = 1.4;
            latestAudio.dispatch("timeupdate");
        });
        expect(latestPlayer.playerState.currentSentenceIndex).toBe(1);
        expect(latestPlayer.playerState.isPlaying).toBe(true);

        await act(async () => {
            latestPlayer?.setSinglePauseMode();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(latestAudio.currentTime).toBeCloseTo(1.3, 2);
        expect(latestPlayer.playerState.isPlaying).toBe(true);
    });
});
