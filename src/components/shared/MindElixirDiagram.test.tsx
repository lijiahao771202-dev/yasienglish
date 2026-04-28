/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    mindCtorMock,
    initMock,
    destroyMock,
    scaleFitMock,
    toCenterMock,
    clearHistoryMock,
    plaintextToMindElixirMock,
} = vi.hoisted(() => {
    const init = vi.fn();
    const destroy = vi.fn();
    const scaleFit = vi.fn();
    const toCenter = vi.fn();
    const clearHistory = vi.fn();
    const ctor = vi.fn(function MindElixirMock(this: Record<string, unknown>, options: Record<string, unknown>) {
        this.options = options;
        this.init = init;
        this.destroy = destroy;
        this.scaleFit = scaleFit;
        this.toCenter = toCenter;
        this.clearHistory = clearHistory;
    });
    return {
        mindCtorMock: ctor,
        initMock: init,
        destroyMock: destroy,
        scaleFitMock: scaleFit,
        toCenterMock: toCenter,
        clearHistoryMock: clearHistory,
        plaintextToMindElixirMock: vi.fn(() => ({
            nodeData: {
                id: "root",
                topic: "核心逻辑",
                children: [
                    { id: "a", topic: "主干" },
                ],
            },
            direction: 2,
        })),
    };
});

vi.mock("mind-elixir", () => ({
    default: mindCtorMock,
    SIDE: 2,
}));

vi.mock("mind-elixir/plaintextConverter", () => ({
    plaintextToMindElixir: plaintextToMindElixirMock,
}));

import { MindElixirDiagram } from "./MindElixirDiagram";

const mountedRoots: Root[] = [];

async function renderDiagram(outline: string) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(<MindElixirDiagram outline={outline} />);
    });

    await act(async () => {
        await Promise.resolve();
    });

    return container;
}

beforeEach(() => {
    mindCtorMock.mockClear();
    initMock.mockClear();
    destroyMock.mockClear();
    scaleFitMock.mockClear();
    toCenterMock.mockClear();
    clearHistoryMock.mockClear();
    plaintextToMindElixirMock.mockClear();
});

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("MindElixirDiagram", () => {
    it("converts plaintext outline into read-only Mind Elixir data", async () => {
        const container = await renderDiagram([
            "- 核心逻辑",
            "  - 主干",
            "  - 从句",
        ].join("\n"));

        expect(plaintextToMindElixirMock).toHaveBeenCalledWith([
            "- 核心逻辑",
            "  - 主干",
            "  - 从句",
        ].join("\n"), "逻辑图");
        expect(mindCtorMock).toHaveBeenCalledWith(expect.objectContaining({
            editable: false,
            contextMenu: false,
            toolBar: false,
            keypress: false,
            allowUndo: false,
            direction: 2,
        }));
        expect(initMock).toHaveBeenCalledWith(expect.objectContaining({
            nodeData: expect.objectContaining({
                topic: "核心逻辑",
            }),
        }));
        expect(container.querySelector('[data-testid="mind-elixir-canvas"]')).toBeTruthy();
    });

    it("opens an enlarged lightbox when the rendered mind map is clicked", async () => {
        const container = await renderDiagram([
            "- 核心逻辑",
            "  - 主干",
        ].join("\n"));

        const previewButton = container.querySelector<HTMLButtonElement>('button[aria-label="放大思维导图"]');
        expect(previewButton).toBeTruthy();

        await act(async () => {
            previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.body.querySelector('[data-testid="mindmap-lightbox"]')).toBeTruthy();
        expect(document.body.textContent).toContain("放大查看脑图");
    });
});
