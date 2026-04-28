export function resolveNextDrillEffectiveElo(params: {
    currentElo: number;
    forcedElo?: number;
}) {
    const { currentElo, forcedElo } = params;
    return Math.max(0, forcedElo ?? currentElo);
}
