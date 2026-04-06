export const BACKGROUND_CHANGED_EVENT = "yasi:background-changed";

export type BackgroundThemeId =
    | "default-mist"
    | "banana-bubble"
    | "mint-candy"
    | "retro-mac"
    | "cyber-night"
    | "peachy-dawn"
    | "cloudy-sky"
    | "lavender-pop"
    | "matcha-latte"
    | "noir-rose"
    | "ice-blue";

export interface BackgroundThemeSpec {
    id: BackgroundThemeId;
    name: string;
    description: string;
    baseLayer: string;
    glassLayer: string;
    glowLayer: string;
    bottomLayer: string;
    vignetteLayer: string;
    transitionFilm: string;
    coverGradient?: string;
}

export const DEFAULT_BACKGROUND_THEME: BackgroundThemeId = "default-mist";

export const BACKGROUND_THEMES: BackgroundThemeSpec[] = [
    {
        id: "default-mist",
        name: "Iris Mist (Default)",
        description: "混合风格：梦幻玻璃背景 + 明黄UI",
        baseLayer: "bg-[linear-gradient(170deg,#7588d9_0%,#95a6e5_24%,#c6cef3_52%,#d8ddf8_76%,#b7c2ee_100%)]",
        glassLayer: "bg-white/15 backdrop-blur-[18px] backdrop-saturate-[225%] backdrop-contrast-124",
        glowLayer: "bg-[radial-gradient(78%_30%_at_16%_10%,rgba(255,184,122,0.38),transparent_62%),radial-gradient(104%_46%_at_82%_22%,rgba(222,233,255,0.54),transparent_62%),radial-gradient(110%_62%_at_50%_100%,rgba(238,243,255,0.72),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(230,238,255,0)_0%,rgba(218,229,255,0.62)_44%,rgba(195,209,246,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(220%_120%_at_50%_120%,rgba(255,255,255,0.24),transparent_72%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(233,243,255,0.16),rgba(186,210,255,0.44)_40%,rgba(142,176,246,0.64)_68%,rgba(107,137,221,0.86)_100%)]",
    },
    {
        id: "banana-bubble",
        name: "Banana Bubble",
        description: "香蕉起泡：漫画黄单色",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(135deg, var(--module-listen-bg) 0%, transparent 50%, var(--module-read-bg) 100%)",
    },
    {
        id: "mint-candy",
        name: "Mint Candy",
        description: "薄荷糖：清脆鲜绿",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(45deg, var(--module-daily-bg) 0%, transparent 60%, var(--module-vocab-bg) 100%)",
    },
    {
        id: "retro-mac",
        name: "Retro Mac",
        description: "上世纪：复古米灰与像素蓝",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(180deg, var(--module-read-bg) 0%, transparent 40%, var(--module-battle-bg) 100%)",
    },
    {
        id: "cyber-night",
        name: "Cyber Night",
        description: "赛博黑客：纯暗黑与荧光交织",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(to right, var(--module-listen-bg) 0%, transparent 50%, var(--module-daily-bg) 100%)",
    },
    {
        id: "peachy-dawn",
        name: "Peachy Dawn",
        description: "蜜桃晨曦：暖粉橘与砖红",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(120deg, var(--module-vocab-bg) 0%, transparent 40%, var(--module-read-bg) 100%)",
    },
    {
        id: "cloudy-sky",
        name: "Cloudy Sky",
        description: "多云天：极简冷白与婴儿蓝",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(to bottom right, var(--module-listen-bg) 20%, transparent 60%, var(--module-daily-bg) 100%)",
    },
    {
        id: "lavender-pop",
        name: "Lavender Pop",
        description: "紫薯波普：亮紫与橘黄强烈撞色",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(135deg, var(--module-read-bg) 0%, transparent 50%, var(--module-battle-bg) 100%)",
    },
    {
        id: "matcha-latte",
        name: "Matcha Latte",
        description: "抹茶拿铁：静怡灰绿日式书卷",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(45deg, var(--module-daily-bg) 0%, transparent 50%, var(--module-vocab-bg) 100%)",
    },
    {
        id: "noir-rose",
        name: "Noir Rose",
        description: "暗夜玫瑰：浓郁紫红的高级感",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(160deg, var(--module-listen-bg) 0%, transparent 50%, var(--module-read-bg) 100%)",
    },
    {
        id: "ice-blue",
        name: "Ice Blue",
        description: "高级透霜：如雪般纯白透着微风蓝",
        baseLayer: "bg-theme-base-bg",
        glassLayer: "", glowLayer: "", bottomLayer: "", vignetteLayer: "", transitionFilm: "",
        coverGradient: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)",
    },
];

function buildBackgroundStorageKey(userId?: string | null) {
    return userId ? `yasi:bg:${userId}` : "yasi:bg:guest";
}

export function getSavedBackgroundTheme(userId?: string | null): BackgroundThemeId {
    if (typeof window === "undefined") return DEFAULT_BACKGROUND_THEME;
    const raw = window.localStorage.getItem(buildBackgroundStorageKey(userId));
    return BACKGROUND_THEMES.some((theme) => theme.id === raw)
        ? (raw as BackgroundThemeId)
        : DEFAULT_BACKGROUND_THEME;
}

export function setSavedBackgroundTheme(themeId: BackgroundThemeId, userId?: string | null) {
    if (typeof window === "undefined") return;
    const key = buildBackgroundStorageKey(userId);
    window.localStorage.setItem(key, themeId);
    document.documentElement.setAttribute("data-bg-theme", themeId);
    window.dispatchEvent(new CustomEvent(BACKGROUND_CHANGED_EVENT, { detail: { themeId } }));
}

export function getBackgroundThemeSpec(themeId: BackgroundThemeId): BackgroundThemeSpec {
    return BACKGROUND_THEMES.find((theme) => theme.id === themeId) ?? BACKGROUND_THEMES[0];
}

export function applyBackgroundThemeToDocument(themeId: BackgroundThemeId) {
    if (typeof window === "undefined") return;
    document.documentElement.setAttribute("data-bg-theme", themeId);
}
