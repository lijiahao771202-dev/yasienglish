export interface AvatarPreset {
    id: string;
    name: string;
    emoji: string;
    baseFrom: string;
    baseTo: string;
    glow: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
    {
        id: "bubble-bear",
        name: "Dream Bear",
        emoji: "🐻",
        baseFrom: "#b79cff",
        baseTo: "#ffc0dc",
        glow: "#fff0f7",
    },
    {
        id: "peach-spark",
        name: "Peach Cat",
        emoji: "🐱",
        baseFrom: "#ffb38b",
        baseTo: "#ffd7b8",
        glow: "#fff4e9",
    },
    {
        id: "mint-orbit",
        name: "Mint Frog",
        emoji: "🐸",
        baseFrom: "#91e7c4",
        baseTo: "#d2fff0",
        glow: "#effff9",
    },
    {
        id: "plum-comet",
        name: "Plum Rabbit",
        emoji: "🐰",
        baseFrom: "#b9a0ff",
        baseTo: "#f3c6ff",
        glow: "#f7edff",
    },
    {
        id: "lemon-loop",
        name: "Lemon Chick",
        emoji: "🐥",
        baseFrom: "#ffe17d",
        baseTo: "#ffd199",
        glow: "#fff8da",
    },
    {
        id: "cloud-bloom",
        name: "Cloud Panda",
        emoji: "🐼",
        baseFrom: "#d6d8ff",
        baseTo: "#ffe7f1",
        glow: "#ffffff",
    },
];

export const AVATAR_PRESET_MAP = Object.fromEntries(
    AVATAR_PRESETS.map((preset) => [preset.id, preset]),
) as Record<string, AvatarPreset>;
