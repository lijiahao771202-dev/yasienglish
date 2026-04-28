/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { initializeMock, renderMock, sanitizeMock } = vi.hoisted(() => ({
    initializeMock: vi.fn(),
    renderMock: vi.fn(),
    sanitizeMock: vi.fn((value: string) => value),
}));

vi.mock("mermaid", () => ({
    default: {
        initialize: initializeMock,
        render: renderMock,
    },
}));

vi.mock("dompurify", () => ({
    default: {
        sanitize: sanitizeMock,
    },
}));

import { MermaidDiagram } from "./MermaidDiagram";

const mountedRoots: Root[] = [];

async function renderDiagram(chart: string) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(<MermaidDiagram chart={chart} />);
    });

    await act(async () => {
        await Promise.resolve();
    });

    return container;
}

beforeEach(() => {
    initializeMock.mockReset();
    renderMock.mockReset();
    sanitizeMock.mockClear();
    renderMock.mockResolvedValue({
        svg: "<svg><text>Regular sleep</text></svg>",
    });
});

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("MermaidDiagram", () => {
    it("initializes mermaid with html labels disabled so node text stays in SVG text nodes", async () => {
        const container = await renderDiagram("flowchart TD\nA[Regular sleep]-->B[Better recovery]");

        expect(initializeMock).toHaveBeenCalledWith(expect.objectContaining({
            htmlLabels: false,
            securityLevel: "loose",
            startOnLoad: false,
            suppressErrorRendering: true,
            theme: "neutral",
        }));
        expect(renderMock).toHaveBeenCalledWith(expect.stringContaining("ask-mermaid-"), "flowchart TD\nA[Regular sleep]-->B[Better recovery]");
        expect(sanitizeMock).toHaveBeenCalledWith("<svg><text>Regular sleep</text></svg>");
        expect(container.innerHTML).toContain("Regular sleep");
    });

    it("opens an enlarged lightbox when the rendered diagram is clicked", async () => {
        const container = await renderDiagram("flowchart TD\nA[Regular sleep]-->B[Better recovery]");

        const previewButton = container.querySelector<HTMLButtonElement>('button[aria-label="放大 Mermaid 图示"]');
        expect(previewButton).toBeTruthy();

        await act(async () => {
            previewButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.body.querySelector('[data-testid="mermaid-lightbox"]')).toBeTruthy();
        expect(document.body.textContent).toContain("放大查看");
    });
});
