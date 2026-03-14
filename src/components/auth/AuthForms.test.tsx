/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
    createBrowserClientSingletonMock,
    replaceMock,
} = vi.hoisted(() => ({
    createBrowserClientSingletonMock: vi.fn(),
    replaceMock: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
    createBrowserClientSingleton: createBrowserClientSingletonMock,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        replace: replaceMock,
    }),
}));

import { DEFAULT_AVATAR_PRESET } from "@/lib/user-sync";

import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { ResetPasswordForm } from "./ResetPasswordForm";

async function renderElement(element: React.ReactNode) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
        root.render(element);
    });

    return {
        container,
        root,
        cleanup: async () => {
            await act(async () => {
                root.unmount();
            });
            container.remove();
        },
    };
}

function changeInput(container: HTMLElement, selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector);
    if (!input) {
        throw new Error(`Missing input: ${selector}`);
    }

    act(() => {
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

async function submitFirstForm(container: HTMLElement) {
    const form = container.querySelector("form");
    if (!form) {
        throw new Error("Missing form");
    }

    await act(async () => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
}

describe("auth forms", () => {
    beforeEach(() => {
        createBrowserClientSingletonMock.mockReset();
        replaceMock.mockReset();
        window.history.replaceState({}, "", "http://localhost:3000/login");
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("signs in with email and password, then redirects to home", async () => {
        const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
        createBrowserClientSingletonMock.mockReturnValue({
            auth: {
                signInWithPassword,
            },
        });

        const view = await renderElement(<LoginForm />);

        changeInput(view.container, "#email", "luna@yasi.app");
        changeInput(view.container, "#password", "super-secret");
        await submitFirstForm(view.container);

        expect(signInWithPassword).toHaveBeenCalledWith({
            email: "luna@yasi.app",
            password: "super-secret",
        });
        expect(replaceMock).toHaveBeenCalledWith("/");

        await view.cleanup();
    });

    it("signs up with username metadata and the default avatar preset", async () => {
        const signUp = vi.fn().mockResolvedValue({
            data: {
                session: { user: { id: "user-1" } },
            },
            error: null,
        });
        createBrowserClientSingletonMock.mockReturnValue({
            auth: {
                signUp,
            },
        });

        const view = await renderElement(<RegisterForm />);

        changeInput(view.container, "#username", "Luna");
        changeInput(view.container, "#email", "luna@yasi.app");
        changeInput(view.container, "#password", "super-secret");
        changeInput(view.container, "#confirm-password", "super-secret");
        await submitFirstForm(view.container);

        expect(signUp).toHaveBeenCalledWith({
            email: "luna@yasi.app",
            password: "super-secret",
            options: {
                data: {
                    username: "Luna",
                    avatar_preset: DEFAULT_AVATAR_PRESET,
                },
                emailRedirectTo: "http://localhost:3000/auth/callback",
            },
        });
        expect(replaceMock).toHaveBeenCalledWith("/");

        await view.cleanup();
    });

    it("sends password recovery links through the auth callback", async () => {
        const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
        createBrowserClientSingletonMock.mockReturnValue({
            auth: {
                resetPasswordForEmail,
            },
        });

        const view = await renderElement(<ForgotPasswordForm />);

        changeInput(view.container, "#email", "luna@yasi.app");
        await submitFirstForm(view.container);

        expect(resetPasswordForEmail).toHaveBeenCalledWith("luna@yasi.app", {
            redirectTo: "http://localhost:3000/auth/callback?next=%2Freset-password",
        });

        await view.cleanup();
    });

    it("updates the password on the recovery screen and redirects home", async () => {
        const updateUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
        createBrowserClientSingletonMock.mockReturnValue({
            auth: {
                updateUser,
            },
        });

        const view = await renderElement(<ResetPasswordForm />);

        changeInput(view.container, "#password", "new-secret");
        changeInput(view.container, "#confirm-password", "new-secret");
        await submitFirstForm(view.container);

        expect(updateUser).toHaveBeenCalledWith({
            password: "new-secret",
        });
        expect(replaceMock).toHaveBeenCalledWith("/?password=updated");

        await view.cleanup();
    });
});
