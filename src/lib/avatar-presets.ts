export interface AvatarPreset {
    id: string;
    name: string;
    emoji: string;
    gradientFrom: string;
    gradientTo: string;
    aura: string;
    ring: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
    {
        id: "bubble-bear",
        name: "Sugar Bear",
        emoji: "🧸",
        gradientFrom: "#9eb5ff",
        gradientTo: "#f8bbd9",
        aura: "#ffe8f4",
        ring: "#ffffff",
    },
    {
        id: "peach-spark",
        name: "Peach Cat",
        emoji: "🐱",
        gradientFrom: "#ffbf9e",
        gradientTo: "#ffe3c9",
        aura: "#fff4e8",
        ring: "#fff7f0",
    },
    {
        id: "mint-orbit",
        name: "Mint Frog",
        emoji: "🐸",
        gradientFrom: "#8be5cf",
        gradientTo: "#d0fff2",
        aura: "#ebfff8",
        ring: "#effff9",
    },
    {
        id: "plum-comet",
        name: "Plum Bunny",
        emoji: "🐰",
        gradientFrom: "#b8a0ff",
        gradientTo: "#efc5ff",
        aura: "#f9edff",
        ring: "#fef6ff",
    },
    {
        id: "lemon-loop",
        name: "Lemon Chick",
        emoji: "🐥",
        gradientFrom: "#ffe27e",
        gradientTo: "#ffd19c",
        aura: "#fff9dc",
        ring: "#fffdf1",
    },
    {
        id: "cloud-bloom",
        name: "Cloud Panda",
        emoji: "🐼",
        gradientFrom: "#d8dbff",
        gradientTo: "#ffe7f0",
        aura: "#ffffff",
        ring: "#ffffff",
    },
];

export const AVATAR_PRESET_MAP = Object.fromEntries(
    AVATAR_PRESETS.map((preset) => [preset.id, preset]),
) as Record<string, AvatarPreset>;
