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

        const revealButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Reveal Answer"));
        expect(revealButton).toBeTruthy();

        await act(async () => {
            revealButton?.click();
            await new Promise((resolve) => window.setTimeout(resolve, 350));
        });

        expect(container.querySelector('input[aria-label="编辑单词"]')).toBeTruthy();
        expect(container.querySelector('textarea[aria-label="编辑释义 v. 1"]')).toBeTruthy();
        expect(container.querySelector('[data-review-rating-bar="compact"]')).toBeTruthy();
        expect(Array.from(container.querySelectorAll('[data-review-rating-bar="compact"] button')).map((button) => button.textContent)).toHaveLength(4);

        await act(async () => {
            root.unmount();
        });
    });
});
