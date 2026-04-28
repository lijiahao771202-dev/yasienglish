/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { saveProfilePatchMock } = vi.hoisted(() => ({
    saveProfilePatchMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("dexie-react-hooks", () => ({
    useLiveQuery: () => ({
        ai_provider: "glm",
        deepseek_model: "deepseek-v4-flash",
        deepseek_thinking_mode: "off",
        deepseek_reasoning_effort: "high",
        glm_api_key: "",
        glm_model: "glm-5.1",
        glm_thinking_mode: "off",
        nvidia_api_key: "",
        nvidia_model: "z-ai/glm-5.1",
        github_api_key: "",
        github_model: "openai/gpt-4.1",
    }),
}));

vi.mock("framer-motion", async () => {
    const ReactModule = await import("react");

    const passthrough = (tag: string) => {
        return ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => {
            const {
                animate,
                exit,
                initial,
                layout,
                transition,
                variants,
                whileHover,
                whileTap,
                ...rest
            } = props;
            void animate;
            void exit;
            void initial;
            void layout;
            void transition;
            void variants;
            void whileHover;
            void whileTap;
            return ReactModule.createElement(tag, rest, children);
        };
    };

    return {
        AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
        motion: new Proxy({}, {
            get: (_target, key) => passthrough(typeof key === "string" ? key : "div"),
        }),
    };
});

vi.mock("@/lib/user-repository", () => ({
    saveProfilePatch: saveProfilePatchMock,
}));

vi.mock("@/lib/supabase/browser-auth", () => ({
    getBrowserSupabaseAuthHeaders: vi.fn().mockResolvedValue({}),
}));

import { AiModelSettingsModal } from "./AiModelSettingsModal";

describe("AiModelSettingsModal", () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
        saveProfilePatchMock.mockClear();
    });

    it("shows only the four curated GLM models directly without parameter clutter", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<AiModelSettingsModal isOpen onClose={vi.fn()} />);
        });

        expect(container.textContent).toContain("GLM-5.1");
        expect(container.textContent).toContain("GLM-5");
        expect(container.textContent).toContain("GLM-4.7");
        expect(container.textContent).toContain("GLM-4.7-FLASH");
        expect(container.textContent).not.toContain("GLM-4-FLASH");
        expect(container.textContent).not.toContain("兼容旧模型");
        expect(container.textContent).not.toContain("常用参数");
        expect(container.textContent).not.toContain("temperature");
        expect(container.textContent).not.toContain("刷新当前可用 GLM 模型");
        expect(container.textContent).toContain("这里不填时会使用服务器 GLM_API_KEY");
        expect(container.querySelector<HTMLInputElement>('input[name="glm_api_key_override"]')?.placeholder)
            .toBe("Using server GLM_API_KEY");

        await act(async () => {
            root.unmount();
        });
    });

    it("saves the selected GLM model and thinking mode", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<AiModelSettingsModal isOpen onClose={vi.fn()} />);
        });

        let thinkingToggle = container.querySelector<HTMLButtonElement>('button[aria-label="GLM Deep Thinking"]');
        expect(thinkingToggle).toBeTruthy();
        expect(thinkingToggle?.disabled).toBe(false);

        const flashButton = container.querySelector<HTMLButtonElement>('button[data-glm-model="glm-4.7-flash"]');
        expect(flashButton).toBeTruthy();

        await act(async () => {
            flashButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        thinkingToggle = container.querySelector<HTMLButtonElement>('button[aria-label="GLM Deep Thinking"]');
        expect(thinkingToggle?.disabled).toBe(false);

        await act(async () => {
            thinkingToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            vi.advanceTimersByTime(600);
        });

        expect(saveProfilePatchMock).toHaveBeenLastCalledWith(expect.objectContaining({
            ai_provider: "glm",
            glm_model: "glm-4.7-flash",
            glm_thinking_mode: "on",
        }));

        await act(async () => {
            root.unmount();
        });
    });
});
