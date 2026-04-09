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
    {
        id: "berry-fox",
        name: "Berry Fox",
        emoji: "🦊",
        bg: "#fed7aa", // pastel orange-red
    },
    {
        id: "choco-monkey",
        name: "Choco Monkey",
        emoji: "🐵",
        bg: "#e7e5e4", // stone gray
    },
    {
        id: "marshmallow-pig",
        name: "M. Piggy",
        emoji: "🐷",
        bg: "#fce7f3", // pastel pink
    },
    {
        id: "snow-owl",
        name: "Snow Owl",
        emoji: "🦉",
        bg: "#e0f2fe", // light sky blue
    },
    {
        id: "magic-unicorn",
        name: "Unicorn",
        emoji: "🦄",
        bg: "#fae8ff", // fuchsia pink
    },
    {
        id: "camo-turtle",
        name: "Turtle",
        emoji: "🐢",
        bg: "#d9f99d", // lime green
    },
    {
        id: "ocean-dolphin",
        name: "Dolphin",
        emoji: "🐬",
        bg: "#bae6fd", // cyan blue
    },
    {
        id: "honey-bee",
        name: "Honey Bee",
        emoji: "🐝",
        bg: "#fef08a", // bright yellow
    },
    {
        id: "cherry-crab",
        name: "Crab",
        emoji: "🦀",
        bg: "#fecaca", // pastel red
    },
    {
        id: "star-alien",
        name: "Alien",
        emoji: "👽",
        bg: "#e9d5ff", // light purple
    },
];

export const AVATAR_PRESET_MAP = Object.fromEntries(
    AVATAR_PRESETS.map((preset) => [preset.id, preset]),
) as Record<string, AvatarPreset>;
