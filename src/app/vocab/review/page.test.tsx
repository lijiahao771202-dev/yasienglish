/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    sortByMock,
    saveVocabularyMock,
    updateVocabularyEntryMock,
    confettiMock,
} = vi.hoisted(() => ({
    sortByMock: vi.fn(),
    saveVocabularyMock: vi.fn(),
    updateVocabularyEntryMock: vi.fn(),
    confettiMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
    db: {
        vocabulary: {
            where: vi.fn(() => ({
                belowOrEqual: vi.fn(() => ({
                    sortBy: sortByMock,
                })),
            })),
        },
    },
}));

vi.mock("@/lib/user-repository", () => ({
    saveVocabulary: saveVocabularyMock,
    updateVocabularyEntry: updateVocabularyEntryMock,
}));

vi.mock("canvas-confetti", () => ({
    default: confettiMock,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

import ReviewPage from "./page";

const baseCard = {
    word: "relay",
    phonetic: "/riːˈleɪ/",
    definition: "v. pass something to the next person",
    translation: "v. 转达; 传递",
    context: "",
    example: "She relayed the message to the team.",
    source_sentence: "The anchor relayed the update on air.",
    source_label: "TED",
    highlighted_meanings: ["转达"],
    timestamp: 1,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: 0,
    last_review: 0,
    due: Date.now() - 60_000,
  };

describe("vocab review page", () => {
    beforeEach(() => {
        sortByMock.mockReset();
        saveVocabularyMock.mockReset();
        updateVocabularyEntryMock.mockReset();
        confettiMock.mockReset();
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({}),
        }));
        vi.stubGlobal("Audio", class {
            play() {
                return Promise.resolve();
            }
        });
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("renders the review card without mouse tilt styling", async () => {
        sortByMock.mockResolvedValue([baseCard]);

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<ReviewPage />);
        });

        await act(async () => {
            await Promise.resolve();
        });

        expect(container.textContent).toContain("relay");
        expect(container.querySelector('[style*="transform-style: preserve-3d"]')).toBeFalsy();

        await act(async () => {
            root.unmount();
        });
    });

    it("uses a single-card revealed layout with a compact rating bar", async () => {
        sortByMock.mockResolvedValue([baseCard]);

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<ReviewPage />);
        });

        await act(async () => {
            await Promise.resolve();
        });

        const revealButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("看看答案"));
        expect(revealButton).toBeTruthy();

        await act(async () => {
            revealButton?.click();
            await new Promise((resolve) => window.setTimeout(resolve, 350));
        });

        expect(container.querySelector('textarea[aria-label="编辑单词"]')).toBeTruthy();
        expect(container.querySelector('textarea[aria-label="编辑释义 v. 1"]')).toBeTruthy();
        expect(container.textContent).toContain("重来");
        expect(container.textContent).toContain("困难");
        expect(container.textContent).toContain("熟悉");
        expect(container.textContent).toContain("简单");

        await act(async () => {
            root.unmount();
        });
    });

    it("requeues short-interval cards into the current review session after Again", async () => {
        sortByMock.mockResolvedValue([baseCard]);
        saveVocabularyMock.mockImplementation(async (item) => item);

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<ReviewPage />);
        });

        await act(async () => {
            await Promise.resolve();
        });

        const revealButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("看看答案"));
        expect(revealButton).toBeTruthy();

        await act(async () => {
            revealButton?.click();
            await new Promise((resolve) => window.setTimeout(resolve, 350));
        });

        const againButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("重来"));
        expect(againButton).toBeTruthy();

        vi.useFakeTimers();
        vi.setSystemTime(Date.now());

        await act(async () => {
            againButton?.click();
            await vi.advanceTimersByTimeAsync(200);
        });

        expect(container.textContent).toContain("短间隔词卡排队中");
        expect(container.textContent).toContain("01:00");
        expect(container.textContent).toContain("先关闭本轮");
        expect(container.textContent).not.toContain("今日已搞定");

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });

        expect(container.textContent).toContain("relay");
        expect(container.textContent).not.toContain("短间隔词卡排队中");

        await act(async () => {
            root.unmount();
        });
    });
});
