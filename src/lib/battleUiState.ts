export interface BattleDrillSelection {
    type: "scenario";
    topic: string;
}

export interface DrillSurfacePhaseInput {
    isProfileLoaded: boolean;
    isGeneratingDrill: boolean;
    hasDrillData: boolean;
}

export type DrillSurfacePhase = "bootstrap" | "loading" | "ready";

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
