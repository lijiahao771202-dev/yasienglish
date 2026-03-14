/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileSettingsPanel } from "./ProfileSettingsPanel";

function setInputValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("ProfileSettingsPanel", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("submits profile edits and password changes through the provided callbacks", async () => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onChangePassword = vi.fn().mockResolvedValue(undefined);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <ProfileSettingsPanel
                    email="luna@yasi.app"
                    initialProfile={{
                        username: "Luna",
                        avatar_preset: "bubble-bear",
                        bio: "Practice makes flow.",
                        deepseek_api_key: "",
                        learning_preferences: {
                            target_mode: "read",
                            english_level: "B1",
                            daily_goal_minutes: 20,
                            ui_theme_preference: "bubblegum_pop",
                        },
                    }}
                    onSave={onSave}
                    onChangePassword={onChangePassword}
                />,
            );
        });

        const username = container.querySelector<HTMLInputElement>("#username");
        const bio = container.querySelector<HTMLTextAreaElement>("#bio");
        const deepSeekApiKey = container.querySelector<HTMLInputElement>("#deepseek-api-key");
        const targetMode = container.querySelector<HTMLSelectElement>("#target-mode");
        const englishLevel = container.querySelector<HTMLSelectElement>("#english-level");
        const dailyGoal = container.querySelector<HTMLInputElement>("#daily-goal");
        const uiTheme = container.querySelector<HTMLSelectElement>("#ui-theme");
        const avatar = container.querySelector<HTMLButtonElement>('button[data-avatar-id="mint-orbit"]');
        const profileForm = container.querySelector<HTMLFormElement>('form[data-form="profile"]');

        if (!username || !bio || !deepSeekApiKey || !targetMode || !englishLevel || !dailyGoal || !uiTheme || !avatar || !profileForm) {
            throw new Error("Missing profile inputs");
        }

        await act(async () => {
            setInputValue(username, "Nova");
            setInputValue(bio, "A sweeter dashboard helps me stay with it.");
            setInputValue(deepSeekApiKey, "sk-user-123");
            setInputValue(targetMode, "battle");
            setInputValue(englishLevel, "C1");
            setInputValue(dailyGoal, "45");
            setInputValue(uiTheme, "starlight_arcade");
            avatar.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        await act(async () => {
            profileForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });

        expect(onSave).toHaveBeenCalledWith({
            username: "Nova",
            avatar_preset: "mint-orbit",
            bio: "A sweeter dashboard helps me stay with it.",
            deepseek_api_key: "sk-user-123",
            learning_preferences: {
                target_mode: "battle",
                english_level: "C1",
                daily_goal_minutes: 45,
                ui_theme_preference: "starlight_arcade",
            },
        });

        const password = container.querySelector<HTMLInputElement>("#password");
        const confirmPassword = container.querySelector<HTMLInputElement>("#confirm-password");
        const passwordForm = container.querySelector<HTMLFormElement>('form[data-form="password"]');

        if (!password || !confirmPassword || !passwordForm) {
            throw new Error("Missing password inputs");
        }

        await act(async () => {
            setInputValue(password, "new-secret");
            setInputValue(confirmPassword, "new-secret");
        });

        await act(async () => {
            passwordForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });

        expect(onChangePassword).toHaveBeenCalledWith("new-secret");

        await act(async () => {
            root.unmount();
        });
    });
});
