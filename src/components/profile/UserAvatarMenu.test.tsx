/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { UserAvatarMenu } from "./UserAvatarMenu";

describe("UserAvatarMenu", () => {
    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("opens a user menu that shows profile and sync details", async () => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <UserAvatarMenu
                    email="luna@yasi.app"
                    displayName="Luna"
                    avatarPreset="bubble-bear"
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
        expect(container.querySelector('a[href="/logout"]')).toBeTruthy();

        await act(async () => {
            root.unmount();
        });
    });

    it("supports the sidebar placement for the home rail account area", async () => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <UserAvatarMenu
                    email="luna@yasi.app"
                    displayName="Luna"
                    avatarPreset="bubble-bear"
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
});
