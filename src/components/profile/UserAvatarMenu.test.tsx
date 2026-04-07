/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_LEARNING_PREFERENCES, RANDOM_ENGLISH_TTS_VOICE } from "@/lib/profile-settings";

const { replaceMock } = vi.hoisted(() => ({
    replaceMock: vi.fn(),
}));

const { saveProfilePatchMock } = vi.hoisted(() => ({
    saveProfilePatchMock: vi.fn().mockResolvedValue(undefined),
}));

const { requestTtsPayloadMock } = vi.hoisted(() => ({
    requestTtsPayloadMock: vi.fn().mockResolvedValue({
        audio: "data:audio/mpeg;base64,",
        audioDataUrl: "data:audio/mpeg;base64,",
        marks: [],
    }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        replace: replaceMock,
    }),
}));

vi.mock("@/lib/user-repository", () => ({
    getUserFacingSyncError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    saveProfilePatch: saveProfilePatchMock,
    syncNow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tts-client", () => ({
    requestTtsPayload: requestTtsPayloadMock,
    resolveTtsAudioBlob: vi.fn(),
}));

import { UserAvatarMenu } from "./UserAvatarMenu";

describe("UserAvatarMenu", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        document.body.innerHTML = "";
    });

    it("opens a user menu that shows profile and sync details", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <UserAvatarMenu
                    email="luna@yasi.app"
                    displayName="Luna"
                    avatarPreset="bubble-bear"
                    learningPreferences={DEFAULT_LEARNING_PREFERENCES}
                    syncLabel="Synced"
                    syncDescription="Last sync 2 minutes ago"
                />,
            );
        });

        const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Open profile menu"]');
        expect(trigger).toBeTruthy();

        await act(async () => {
            trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.querySelector('[data-avatar-menu-placement="floating"]')).toBeTruthy();
        expect(container.textContent).toContain("Luna");
        expect(container.textContent).toContain("luna@yasi.app");
        expect(container.textContent).toContain("Synced");
        expect(container.textContent).toContain("Last sync 2 minutes ago");
        expect(container.querySelector('a[href="/profile"]')).toBeTruthy();
        expect(container.textContent).toContain("发言人");
        expect(container.textContent).toContain("断开连接");

        await act(async () => {
            root.unmount();
        });
    });

    it("supports the sidebar placement for the home rail account area", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <UserAvatarMenu
                    email="luna@yasi.app"
                    displayName="Luna"
                    avatarPreset="bubble-bear"
                    learningPreferences={DEFAULT_LEARNING_PREFERENCES}
                    syncLabel="Syncing"
                    syncDescription="Restoring your cloud mirror"
                    placement="sidebar"
                />,
            );
        });

        expect(container.querySelector('[data-avatar-menu-placement="sidebar"]')).toBeTruthy();
        expect(container.textContent).toContain("Account center");

        const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Open profile menu"]');

        await act(async () => {
            trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(container.textContent).toContain("Restoring your cloud mirror");

        await act(async () => {
            root.unmount();
        });
    });

    it("opens the voice picker and saves a selected speaker", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        const audioPlayMock = vi.fn().mockResolvedValue(undefined);
        const audioPauseMock = vi.fn();
        vi.stubGlobal("Audio", class MockAudio {
            src: string;
            onended: null | (() => void) = null;

            constructor(src: string) {
                this.src = src;
            }

            play = audioPlayMock;
            pause = audioPauseMock;
        } as unknown as typeof Audio);
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <UserAvatarMenu
                    email="luna@yasi.app"
                    displayName="Luna"
                    avatarPreset="bubble-bear"
                    learningPreferences={{
                        ...DEFAULT_LEARNING_PREFERENCES,
                        tts_voice: "en-US-JennyNeural",
                    }}
                    syncLabel="Synced"
                    syncDescription="Last sync just now"
                />,
            );
        });

        const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Open profile menu"]');
        if (!trigger) {
            throw new Error("Missing profile trigger");
        }

        await act(async () => {
            trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const voiceToggle = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("发言人"));
        if (!(voiceToggle instanceof HTMLButtonElement)) {
            throw new Error("Missing voice toggle");
        }

        await act(async () => {
            voiceToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(document.body.textContent).toContain("发言人列表");
        expect(document.body.textContent).toContain("选择一个声音");
        expect(document.body.textContent).toContain("中文发言人");
        expect(document.body.textContent).toContain("英文发言人");
        expect(document.body.textContent).toContain("当前：");
        expect(document.body.textContent).toContain("全部");
        expect(document.body.textContent).toContain("英文");
        expect(document.body.textContent).toContain("中文");
        expect(document.body.textContent).toContain("随机英文");

        const xiaoxiaoPreview = document.body.querySelector<HTMLButtonElement>('button[aria-label="试听 晓晓"]');
        if (!xiaoxiaoPreview) {
            throw new Error("Missing Xiaoxiao preview button");
        }

        await act(async () => {
            xiaoxiaoPreview.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(requestTtsPayloadMock).toHaveBeenCalledWith(
            "This is a preview of your speaking voice.",
            "zh-CN-XiaoxiaoNeural",
        );
        expect(audioPlayMock).toHaveBeenCalledTimes(1);

        const emmaButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="选择 Emma"]');
        if (!emmaButton) {
            throw new Error("Missing Emma option");
        }

        await act(async () => {
            emmaButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(saveProfilePatchMock).toHaveBeenCalledWith({
            learning_preferences: expect.objectContaining({
                tts_voice: "en-US-EmmaNeural",
            }),
        });

        await act(async () => {
            trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const voiceToggleAgain = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("发言人"));
        if (!(voiceToggleAgain instanceof HTMLButtonElement)) {
            throw new Error("Missing voice toggle on second open");
        }

        await act(async () => {
            voiceToggleAgain.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const randomVoiceButton = document.body.querySelector<HTMLButtonElement>('button[aria-label="选择 随机英文"]');
        if (!randomVoiceButton) {
            throw new Error("Missing random english option");
        }

        await act(async () => {
            randomVoiceButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(saveProfilePatchMock).toHaveBeenLastCalledWith({
            learning_preferences: expect.objectContaining({
                tts_voice: RANDOM_ENGLISH_TTS_VOICE,
            }),
        });

        await act(async () => {
            root.unmount();
        });
    });
});
