export interface AvatarPreset {
    id: string;
    name: string;
    emoji: string;
    bg: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
    {
        id: "sugar-bear",
        name: "Sugar Bear",
        emoji: "🧸",
        bg: "#fde68a", // pastel yellow
    },
    {
        id: "peach-cat",
        name: "Peach Cat",
        emoji: "🐱",
        bg: "#ffedd5", // pastel orange
    },
    {
        id: "mint-frog",
        name: "Mint Frog",
        emoji: "🐸",
        bg: "#dcfce7", // pastel green
    },
    {
        id: "plum-bunny",
        name: "Plum Bunny",
        emoji: "🐰",
        bg: "#f3e8ff", // pastel purple
    },
    {
        id: "lemon-chick",
        name: "Lemon Chick",
        emoji: "🐥",
        bg: "#fef08a", // bright yellow
    },
    {
        id: "cloud-panda",
        name: "Cloud Panda",
        emoji: "🐼",
        bg: "#f1f5f9", // soft gray blue
    },
];

export const AVATAR_PRESET_MAP = Object.fromEntries(
    AVATAR_PRESETS.map((preset) => [preset.id, preset]),
) as Record<string, AvatarPreset>;
