/* @vitest-environment jsdom */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import RewritePracticePage from "./page";

const mountedRoots: Root[] = [];

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    useSearchParams: () => ({
        get: () => null,
    }),
}));

vi.mock("@/components/ui/PretextTextarea", () => ({
    PretextTextarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

async function renderPage() {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoots.push(root);

    await act(async () => {
        root.render(<RewritePracticePage />);
    });

    return container;
}

afterEach(async () => {
    await act(async () => {
        while (mountedRoots.length > 0) {
            mountedRoots.pop()?.unmount();
        }
    });
    document.body.innerHTML = "";
});

describe("RewritePracticePage", () => {
    it("guides users to the full test rewrite practice instead of the removed paragraph toolbar entry", async () => {
        const container = await renderPage();

        expect(container.textContent).toContain("完整测试");
        expect(container.textContent).not.toContain("段落工具栏");
    });
});
