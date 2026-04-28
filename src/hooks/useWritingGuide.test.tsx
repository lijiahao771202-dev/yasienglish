/* @vitest-environment jsdom */

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useGhostSettingsStoreMock } = vi.hoisted(() => ({
    useGhostSettingsStoreMock: vi.fn(),
}));

vi.mock("@/lib/ghost-settings-store", () => ({
    useGhostSettingsStore: useGhostSettingsStoreMock,
}));

import { useWritingGuide, type WritingGuideStep } from "./useWritingGuide";

type HookValue = ReturnType<typeof useWritingGuide>;

function flushPromises() {
    return Promise.resolve();
}

function createFetchResponse(payload: Record<string, unknown>) {
    return Promise.resolve({
        ok: true,
        json: async () => payload,
    });
}

function HookHarness(props: {
    chinese?: string;
    userText: string;
    referenceText: string;
    disabled?: boolean;
    onValue: (value: HookValue) => void;
}) {
    const value = useWritingGuide(props);

    useEffect(() => {
        props.onValue(value);
    }, [props, value]);

    return null;
}

describe("useWritingGuide", () => {
    let container: HTMLDivElement;
    let root: ReturnType<typeof createRoot>;
    let latestValue: HookValue | null = null;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        latestValue = null;
        useGhostSettingsStoreMock.mockReturnValue({ writingGuideEnabled: true });
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        act(() => {
            root.unmount();
        });
        container.remove();
        vi.unstubAllGlobals();
        delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function renderHarness(props: {
        chinese?: string;
        userText: string;
        referenceText: string;
        disabled?: boolean;
    }) {
        act(() => {
            root.render(
                <StrictMode>
                    <HookHarness
                        {...props}
                        onValue={(value) => {
                            latestValue = value;
                        }}
                    />
                </StrictMode>,
            );
        });
    }

    it("waits 3 seconds before the first automatic guide request", async () => {
        fetchMock.mockImplementation(() => createFetchResponse({
            state: "unfinished",
            hasError: false,
            label: "🧱 理清结构",
            hint: "先把主句补完整。",
            grammarPoint: "",
            grammarExplain: "",
            focus: "main_clause",
            nextAction: "add_predicate",
        }));

        renderHarness({
            chinese: "虽然方案可行，但推进速度仍然太慢。",
            userText: "Although the plan",
            referenceText: "Although the plan is viable, progress is still too slow.",
        });

        await act(async () => {
            vi.advanceTimersByTime(2000);
            await flushPromises();
        });

        expect(fetchMock).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1000);
            await flushPromises();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does not escalate feeding hints after a valid alternative or near-finish response", async () => {
        fetchMock.mockImplementation(() => createFetchResponse({
            state: "valid_alternative",
            hasError: false,
            label: "✅ 可接受写法",
            hint: "意思已经对了，继续补完后半句。",
            grammarPoint: "",
            grammarExplain: "",
            focus: "finish_clause",
            nextAction: "continue",
        }));

        renderHarness({
            chinese: "虽然方案可行，但推进速度仍然太慢。",
            userText: "Although the plan works well",
            referenceText: "Although the plan is viable, progress is still too slow.",
        });

        await act(async () => {
            vi.advanceTimersByTime(3000);
            await flushPromises();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(latestValue?.activeGuideStep?.label).toBe("✅ 可接受写法");

        await act(async () => {
            vi.advanceTimersByTime(10000);
            await flushPromises();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("sends structured history on the follow-up request and aborts when input changes", async () => {
        const firstSignalStore: AbortSignal[] = [];

        fetchMock
            .mockImplementationOnce((_, init?: RequestInit) => {
                firstSignalStore.push(init?.signal as AbortSignal);
                return createFetchResponse({
                    state: "unfinished",
                    hasError: false,
                    label: "🧱 理清结构",
                    hint: "先把主句补完整。",
                    grammarPoint: "",
                    grammarExplain: "",
                    focus: "main_clause",
                    nextAction: "add_predicate",
                });
            })
            .mockImplementationOnce((_, init?: RequestInit) => {
                firstSignalStore.push(init?.signal as AbortSignal);
                return createFetchResponse({
                    state: "lexical_gap",
                    hasError: false,
                    label: "💡 单词速递",
                    hint: "这里把 viable 这类评价词补进去。",
                    grammarPoint: "词汇升级",
                    grammarExplain: "先把评价词补到主语后。",
                    focus: "viable",
                    nextAction: "add_keyword",
                });
            });

        renderHarness({
            chinese: "虽然方案可行，但推进速度仍然太慢。",
            userText: "Although the plan",
            referenceText: "Although the plan is viable, progress is still too slow.",
        });

        await act(async () => {
            vi.advanceTimersByTime(3000);
            await flushPromises();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            vi.advanceTimersByTime(10000);
            await flushPromises();
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
            history: Array<{ state: string; focus: string; nextAction: string }>;
        };
        expect(secondCallBody.history[0]).toMatchObject({
            state: "unfinished",
            focus: "main_clause",
            nextAction: "add_predicate",
        });

        renderHarness({
            chinese: "虽然方案可行，但推进速度仍然太慢。",
            userText: "Although the plan is viable",
            referenceText: "Although the plan is viable, progress is still too slow.",
        });

        expect(firstSignalStore[1]?.aborted).toBe(true);
    });
});
