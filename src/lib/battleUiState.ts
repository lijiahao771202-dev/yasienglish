export interface BattleDrillSelection {
    type: "scenario";
    topic: string;
    topicLine?: string;
    topicPrompt?: string;
    rebuildVariant?: "sentence" | "passage";
    segmentCount?: 2 | 3 | 5;
    translationVariant?: "sentence" | "passage";
    isQuickMatch?: boolean;
}

export interface DrillSurfacePhaseInput {
    isProfileLoaded: boolean;
    isGeneratingDrill: boolean;
    hasDrillData: boolean;
}

export interface ShopInventoryDockInput {
    hasHoverSupport: boolean;
    isShopHovered: boolean;
}

export type DrillSurfacePhase = "bootstrap" | "loading" | "ready";

export function shouldResetQuickMatchTopic(
    generatedDrillCount: number,
    topicResetInterval: number,
): boolean {
    if (generatedDrillCount <= 0 || topicResetInterval <= 0) {
        return false;
    }

    return generatedDrillCount % topicResetInterval === 0;
}

export function shouldRefreshBattleChart(
    previousActiveDrill: BattleDrillSelection | null,
    nextActiveDrill: BattleDrillSelection | null,
): boolean {
    return previousActiveDrill !== null && nextActiveDrill === null;
}

export function getDrillSurfacePhase({
    isProfileLoaded,
    isGeneratingDrill,
    hasDrillData,
}: DrillSurfacePhaseInput): DrillSurfacePhase {
    if (!isProfileLoaded) {
        return "bootstrap";
    }

    if (hasDrillData) {
        return "ready";
    }

    if (isGeneratingDrill || !hasDrillData) {
        return "loading";
    }

    return "loading";
}

export function shouldExpandShopInventoryDock({
    hasHoverSupport,
    isShopHovered,
}: ShopInventoryDockInput): boolean {
    if (!hasHoverSupport) {
        return true;
    }

    return isShopHovered;
}
