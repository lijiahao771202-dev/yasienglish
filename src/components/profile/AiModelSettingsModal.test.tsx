/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getBrowserSupabaseAuthHeadersMock, saveProfilePatchMock } = vi.hoisted(() => ({
    getBrowserSupabaseAuthHeadersMock: vi.fn().mockResolvedValue({}),
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
        mimo_api_key: "",
        mimo_model: "mimo-v2.5-pro",
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
    getBrowserSupabaseAuthHeaders: getBrowserSupabaseAuthHeadersMock,
}));

import { AiModelSettingsModal } from "./AiModelSettingsModal";

describe("AiModelSettingsModal", () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
        saveProfilePatchMock.mockClear();
        getBrowserSupabaseAuthHeadersMock.mockClear();
        vi.unstubAllGlobals();
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
        expect(container.textContent).toContain("API key 统一使用本地服务器环境变量");
        expect(container.querySelector<HTMLInputElement>('input[name="glm_api_key_override"]')).toBeNull();

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

    it("shows and saves Xiaomi MiMo model settings", async () => {
        vi.useFakeTimers();
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<AiModelSettingsModal isOpen onClose={vi.fn()} />);
        });

        const mimoProvider = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("Xiaomi MiMo"));
        expect(mimoProvider).toBeTruthy();

        await act(async () => {
            mimoProvider?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).toContain("MIMO_API_KEY");
        expect(container.querySelector<HTMLInputElement>('input[name="mimo_api_key_override"]')).toBeNull();

        const mimoV25Button = container.querySelector<HTMLButtonElement>('button[data-mimo-model="mimo-v2.5"]');
        expect(mimoV25Button).toBeTruthy();

        await act(async () => {
            mimoV25Button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            vi.advanceTimersByTime(600);
        });

        expect(saveProfilePatchMock).toHaveBeenLastCalledWith(expect.objectContaining({
            ai_provider: "mimo",
            mimo_model: "mimo-v2.5",
        }));
        expect(saveProfilePatchMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("mimo_api_key");

        await act(async () => {
            root.unmount();
        });
    });

    it("tests local AI providers without sending oversized browser auth headers", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ message: "Connection OK." }),
        }));
        vi.stubGlobal("fetch", fetchMock);
        getBrowserSupabaseAuthHeadersMock.mockResolvedValue({ Authorization: "Bearer local-session" });

        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(<AiModelSettingsModal isOpen onClose={vi.fn()} />);
        });

        const testButton = Array.from(container.querySelectorAll("button"))
            .find((button) => button.textContent?.includes("Test Connection"));
        expect(testButton).toBeTruthy();

        await act(async () => {
            testButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(getBrowserSupabaseAuthHeadersMock).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledWith("/api/profile/test-ai-provider", expect.objectContaining({
            credentials: "omit",
            headers: { "Content-Type": "application/json" },
        }));

        await act(async () => {
            root.unmount();
        });
    });
});
