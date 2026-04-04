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

class MockAudio {
    src = "";
    preload = "auto";
    duration = 9;
    currentTime = 0;
    paused = true;

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
            targetDurationMinutes: 3,
            sentenceCount: 3,
            model: "deepseek-chat",
        },
        style: "workplace",
        focusTags: ["business_vocabulary"],
        cefrLevel: "B1",
        targetDurationMinutes: 3,
        sentenceCount: 3,
        voice: "en-US-AriaNeural",
        playbackRate: 1,
        showChineseSubtitle: true,
        created_at: Date.now(),
        updated_at: Date.now(),
        lastSentenceIndex: 0,
        lastPlayedAt: null,
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
        expect(latestAudio.currentTime).toBeLessThanOrEqual(3.01);

        await act(async () => {
            await latestPlayer?.resumeOrPlay();
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);
        expect(latestAudio.currentTime).toBeCloseTo(0, 3);
        expect(latestPlayer.playerState.isPlaying).toBe(true);
    });

    it("applies single-pause mode immediately and does not slip into the next sentence at boundary", async () => {
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
            latestAudio.currentTime = 3.05;
            latestAudio.dispatch("timeupdate");
        });

        expect(latestPlayer.playerState.currentSentenceIndex).toBe(0);
        expect(latestPlayer.playerState.isPlaying).toBe(false);
        expect(latestAudio.currentTime).toBeGreaterThanOrEqual(2.88);
        expect(latestAudio.currentTime).toBeLessThanOrEqual(3.01);
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
});
