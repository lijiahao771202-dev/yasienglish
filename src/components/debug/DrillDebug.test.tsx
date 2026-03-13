/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { DrillDebug } from "./DrillDebug";

describe("DrillDebug", () => {
    it("opens the panel and triggers the gacha preview action", async () => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true;
        const onTriggerBoss = vi.fn();
        const onTriggerEconomyFx = vi.fn();
        const onTriggerLootDrop = vi.fn();
        const onTriggerGacha = vi.fn();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);

        await act(async () => {
            root.render(
                <DrillDebug
                    onTriggerBoss={onTriggerBoss}
                    onTriggerEconomyFx={onTriggerEconomyFx}
                    onTriggerLootDrop={onTriggerLootDrop}
                    onTriggerGacha={onTriggerGacha}
                />,
            );
        });

        const openButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "DBG");
        expect(openButton).toBeTruthy();

        await act(async () => {
            openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        const gachaButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Preview Gacha"));
        expect(gachaButton).toBeTruthy();

        await act(async () => {
            gachaButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });

        expect(onTriggerGacha).toHaveBeenCalledTimes(1);

        await act(async () => {
            root.unmount();
        });
        container.remove();
    });
});
