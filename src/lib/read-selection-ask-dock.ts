export const READ_SELECTION_ASK_DOCK_EVENT = "read:selection-ask-dock";

export function dispatchReadSelectionAskDockEvent(open: boolean) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(READ_SELECTION_ASK_DOCK_EVENT, {
        detail: { open },
    }));
}
