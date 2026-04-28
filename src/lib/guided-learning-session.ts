import {
    buildGuidedClozeHint,
    buildGuidedHintLines,
    createGuidedClozeState,
    type GuidedClozeState,
    type GuidedScript,
    type GuidedSessionState,
} from "@/lib/guidedLearning";

export type GuidedInnerMode = "teacher_guided" | "gestalt_cloze";

export interface GuidedHintRequestContext {
    attempt: number;
    leftContext: string;
    localHint: string;
    rightContext: string;
    slot: GuidedScript["slots"][number];
}

interface ResolveGuidedHintRequestContextParams {
    guidedChoicesVisible: boolean;
    guidedClozeState: GuidedClozeState | null;
    guidedCurrentAttemptCount: number;
    guidedCurrentStepIndex: number;
    guidedFilledFragments: Record<string, string>;
    guidedInnerMode: GuidedInnerMode;
    guidedRevealReady: boolean;
    guidedScript: GuidedScript | null;
    guidedSession: GuidedSessionState;
}

export function resolveGuidedHintRequestContext({
    guidedChoicesVisible,
    guidedClozeState,
    guidedCurrentAttemptCount,
    guidedCurrentStepIndex,
    guidedFilledFragments,
    guidedInnerMode,
    guidedRevealReady,
    guidedScript,
    guidedSession,
}: ResolveGuidedHintRequestContextParams): GuidedHintRequestContext | null {
    if (!guidedScript) return null;

    const slot = guidedInnerMode === "gestalt_cloze"
        ? guidedScript.slots.find((item) => item.id === guidedClozeState?.blankSlotIds[guidedClozeState.currentBlankIndex])
        : guidedScript.slots[guidedCurrentStepIndex];
    if (!slot) return null;

    const slotIndex = guidedScript.slots.findIndex((item) => item.id === slot.id);
    if (slotIndex < 0) return null;

    const filledMap = guidedInnerMode === "gestalt_cloze"
        ? (guidedClozeState?.filledFragments ?? {})
        : guidedFilledFragments;

    let leftContext = "";
    let rightContext = "";

    for (let index = slotIndex - 1; index >= 0; index -= 1) {
        const visible = filledMap[guidedScript.slots[index]?.id ?? ""];
        if (visible) {
            leftContext = visible;
            break;
        }
    }

    for (let index = slotIndex + 1; index < guidedScript.slots.length; index += 1) {
        const visible = filledMap[guidedScript.slots[index]?.id ?? ""];
        if (visible) {
            rightContext = visible;
            break;
        }
    }

    const localHint = guidedInnerMode === "gestalt_cloze"
        ? buildGuidedClozeHint(guidedScript, guidedClozeState ?? createGuidedClozeState(guidedScript))?.primary ?? ""
        : buildGuidedHintLines(guidedScript, guidedSession)?.primary ?? "";
    const attempt = guidedInnerMode === "gestalt_cloze"
        ? Math.max(guidedClozeState?.currentAttemptCount ?? 0, guidedClozeState?.revealReady ? 3 : 0)
        : Math.max(guidedCurrentAttemptCount, (guidedChoicesVisible || guidedRevealReady) ? 3 : 0);

    return {
        attempt,
        leftContext,
        localHint,
        rightContext,
        slot,
    };
}
