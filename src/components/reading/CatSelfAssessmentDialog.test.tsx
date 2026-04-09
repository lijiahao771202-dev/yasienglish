/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatSelfAssessmentDialog } from "./CatSelfAssessmentDialog";

const mountedRoots: Root[] = [];

async function renderDialog(props: Partial<React.ComponentProps<typeof CatSelfAssessmentDialog>> = {}) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(
            <CatSelfAssessmentDialog
                open
                isSubmitting={false}
                onSelect={vi.fn()}
                onClose={vi.fn()}
                {...props}
            />,
        );
    });

    return { container, root };
}

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("CatSelfAssessmentDialog", () => {
    it("renders the three CAT self-assessment options", async () => {
        const { container } = await renderDialog();

        expect(container.textContent).toContain("简单");
        expect(container.textContent).toContain("刚好");
        expect(container.textContent).toContain("偏难");
    });

    it("invokes onSelect with the chosen self-assessment", async () => {
        const onSelect = vi.fn();
        const { container } = await renderDialog({ onSelect });
        const button = Array.from(container.querySelectorAll("button"))
            .find((candidate) => candidate.textContent?.includes("偏难"));

        expect(button).toBeTruthy();

        await act(async () => {
            button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onSelect).toHaveBeenCalledWith("hard");
    });
});
