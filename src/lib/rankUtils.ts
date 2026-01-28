
export const ELO_RANKS = [
    { title: "新手", min: 0, color: "text-stone-500", bg: "bg-stone-100", border: "border-stone-200" },
    { title: "青铜", min: 1000, color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200" },
    { title: "白银", min: 1400, color: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200" },
    { title: "黄金", min: 1800, color: "text-yellow-600", bg: "bg-yellow-100", border: "border-yellow-200" },
    { title: "铂金", min: 2200, color: "text-cyan-600", bg: "bg-cyan-100", border: "border-cyan-200" },
    { title: "王者", min: 2500, color: "text-purple-600", bg: "bg-purple-100", border: "border-purple-200" },
] as const;

export function getRank(elo: number) {
    // Find the highest rank where min <= elo
    const rankIndex = ELO_RANKS.reduce((acc, rank, idx) => {
        return elo >= rank.min ? idx : acc;
    }, 0);

    const rank = ELO_RANKS[rankIndex];
    const nextRank = ELO_RANKS[rankIndex + 1];

    // Calculate progress to next rank
    let progress = 0;
    let distToNext = 0;

    if (nextRank) {
        const totalDist = nextRank.min - rank.min;
        const currentDist = elo - rank.min;
        progress = Math.min(100, (currentDist / totalDist) * 100);
        distToNext = nextRank.min - elo;
    } else {
        progress = 100; // Max level
    }

    return {
        ...rank,
        nextRank,
        progress,
        distToNext
    };
}
