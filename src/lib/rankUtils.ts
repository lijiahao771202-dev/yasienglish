import { Shield, Sword, Trophy, Medal, Gem, Crown, Skull, CircleDashed, LucideIcon } from "lucide-react";

// Define types for tier configurations
interface BaseTierConfig {
    name: string;
    minElo: number;
    color: string;
    bg: string;
    border: string;
    gradient: string;
    icon: LucideIcon;
}

interface NormalTierConfig extends BaseTierConfig {
    divisions: number;
    eloPerDiv: number;
}

interface KingTierConfig extends BaseTierConfig {
    isKing: true;
    maxStars: number;
    eloPerStar: number;
}

interface ExecutionTierConfig extends BaseTierConfig {
    isExecution: true;
}

type TierConfig = NormalTierConfig | KingTierConfig | ExecutionTierConfig;

// ELO Ranges per tier - Unified 400 Elo per tier
const TIER_CONFIG: TierConfig[] = [
    // 0-400: 新手 (A1)
    { name: "新手", minElo: 0, color: "text-stone-500", bg: "bg-stone-100", border: "border-stone-200", gradient: "from-stone-400 to-stone-600", icon: CircleDashed, divisions: 4, eloPerDiv: 100 },
    // 400-800: 青铜 (A2-)
    { name: "青铜", minElo: 400, color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200", gradient: "from-amber-600 to-amber-800", icon: Shield, divisions: 4, eloPerDiv: 100 },
    // 800-1200: 白银 (A2+)
    { name: "白银", minElo: 800, color: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200", gradient: "from-slate-400 to-slate-600", icon: Sword, divisions: 4, eloPerDiv: 100 },
    // 1200-1600: 黄金 (B1)
    { name: "黄金", minElo: 1200, color: "text-yellow-600", bg: "bg-yellow-100", border: "border-yellow-200", gradient: "from-yellow-400 to-yellow-600", icon: Trophy, divisions: 4, eloPerDiv: 100 },
    // 1600-2000: 铂金 (B2)
    { name: "铂金", minElo: 1600, color: "text-cyan-600", bg: "bg-cyan-100", border: "border-cyan-200", gradient: "from-cyan-400 to-cyan-600", icon: Medal, divisions: 4, eloPerDiv: 100 },
    // 2000-2400: 钻石 (C1)
    { name: "钻石", minElo: 2000, color: "text-blue-500", bg: "bg-blue-100", border: "border-blue-200", gradient: "from-blue-400 to-blue-600", icon: Gem, divisions: 4, eloPerDiv: 100 },
    // 2400-2800: 大师 (C2)
    { name: "大师", minElo: 2400, color: "text-fuchsia-600", bg: "bg-fuchsia-100", border: "border-fuchsia-200", gradient: "from-fuchsia-400 to-fuchsia-600", icon: Crown, divisions: 4, eloPerDiv: 100 },
    // 2800-3200: 王者 (C2+)
    { name: "王者", minElo: 2800, color: "text-purple-600", bg: "bg-gradient-to-r from-purple-100 to-amber-100", border: "border-purple-300", gradient: "from-purple-500 to-indigo-600", icon: Crown, isKing: true, maxStars: 4, eloPerStar: 100 },
    // 3200+: 处决 (Russian Roulette Execution Only)
    { name: "处决", minElo: 3200, color: "text-red-500", bg: "bg-red-950", border: "border-red-500", gradient: "from-red-600 to-red-900", icon: Skull, isExecution: true },
];

// Helper to get Roman numeral (for display like "青铜 IV")
function toRoman(num: number): string {
    const romanNumerals: { [key: number]: string } = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
    return romanNumerals[num] || num.toString();
}

// Legacy compatibility - for components that still use the old ELO_RANKS format
export const ELO_RANKS = [
    { title: "新手", min: 0, color: "text-stone-500", bg: "bg-stone-100", border: "border-stone-200" },
    { title: "青铜", min: 400, color: "text-amber-700", bg: "bg-amber-100", border: "border-amber-200" },
    { title: "白银", min: 800, color: "text-slate-500", bg: "bg-slate-100", border: "border-slate-200" },
    { title: "黄金", min: 1200, color: "text-yellow-600", bg: "bg-yellow-100", border: "border-yellow-200" },
    { title: "铂金", min: 1600, color: "text-cyan-600", bg: "bg-cyan-100", border: "border-cyan-200" },
    { title: "钻石", min: 2000, color: "text-blue-500", bg: "bg-blue-100", border: "border-blue-200" },
    { title: "大师", min: 2400, color: "text-fuchsia-600", bg: "bg-fuchsia-100", border: "border-fuchsia-200" },
    { title: "王者", min: 2800, color: "text-purple-600", bg: "bg-purple-100", border: "border-purple-200" },
    { title: "处决", min: 3200, color: "text-red-500", bg: "bg-red-950", border: "border-red-500" },
] as const;

export function getRank(elo: number) {
    // Find the correct tier (but cap at 王者 for normal display, 处决 is special)
    let tierIndex = 0;
    for (let i = TIER_CONFIG.length - 1; i >= 0; i--) {
        if (elo >= TIER_CONFIG[i].minElo) {
            tierIndex = i;
            break;
        }
    }

    const tier = TIER_CONFIG[tierIndex];
    const nextTier = TIER_CONFIG[tierIndex + 1];

    // Calculate division within tier
    const eloInTier = elo - tier.minElo;

    let division: number | undefined;
    let stars: number | undefined;
    let displayName = tier.name;
    let progress = 0;
    let distToNext = 0;

    // Type guard for Execution tier
    if ('isExecution' in tier) {
        // Execution tier: special display
        displayName = `☠️ ${tier.name}`;
        progress = 100;
        distToNext = 0;
    }
    // Type guard for King tier
    else if ('isKing' in tier) {
        // King tier: use stars (1-4)
        const starIndex = Math.min(tier.maxStars, Math.floor(eloInTier / tier.eloPerStar) + 1);
        stars = starIndex;
        displayName = `${tier.name} ${'★'.repeat(stars)}`;

        // Progress to next star
        const eloForCurrentStar = (starIndex - 1) * tier.eloPerStar;
        const eloToNextStar = starIndex * tier.eloPerStar;
        if (starIndex < tier.maxStars) {
            progress = ((eloInTier - eloForCurrentStar) / tier.eloPerStar) * 100;
            distToNext = tier.minElo + eloToNextStar - elo;
        } else if (nextTier) {
            // Progress to execution tier
            progress = ((eloInTier - eloForCurrentStar) / tier.eloPerStar) * 100;
            distToNext = nextTier.minElo - elo;
        } else {
            progress = 100; // Max stars
        }
    } else {
        // Normal tier: use divisions (4 → 1, with 4 being lowest)
        const divIndex = Math.min(tier.divisions - 1, Math.floor(eloInTier / tier.eloPerDiv));
        division = tier.divisions - divIndex; // Reverse: 4 is lowest, 1 is highest
        displayName = `${tier.name} ${toRoman(division)}`;

        // Progress to next division or tier
        const eloForCurrentDiv = divIndex * tier.eloPerDiv;
        const eloToNextDiv = (divIndex + 1) * tier.eloPerDiv;

        if (divIndex < tier.divisions - 1) {
            // Progress to next division
            progress = ((eloInTier - eloForCurrentDiv) / tier.eloPerDiv) * 100;
            distToNext = tier.minElo + eloToNextDiv - elo;
        } else if (nextTier) {
            // Progress to next tier
            progress = ((eloInTier - eloForCurrentDiv) / tier.eloPerDiv) * 100;
            distToNext = nextTier.minElo - elo;
        } else {
            progress = 100;
        }
    }

    return {
        title: displayName,
        shortTitle: tier.name,
        division,
        stars,
        color: tier.color,
        bg: tier.bg,
        border: tier.border,
        gradient: tier.gradient,
        icon: tier.icon,
        nextRank: nextTier ? { title: nextTier.name, min: nextTier.minElo } : null,
        progress: Math.max(0, Math.min(100, progress)),
        distToNext: Math.max(0, distToNext),
        minElo: tier.minElo,
        elo
    };
}

// Get display name with division/stars
export function getRankDisplayName(elo: number): string {
    return getRank(elo).title;
}
