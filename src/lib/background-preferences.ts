export const BACKGROUND_CHANGED_EVENT = "yasi:background-changed";

export type BackgroundThemeId =
    | "default-mist"
    | "rose-milk"
    | "sky-frost"
    | "lavender-cloud"
    | "peach-dawn"
    | "moon-pearl"
    | "mint-haze"
    | "coral-pop"
    | "sunset-jelly"
    | "forest-glass"
    | "midnight-neon"
    | "noir-rose";

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
}

export const DEFAULT_BACKGROUND_THEME: BackgroundThemeId = "default-mist";

export const BACKGROUND_THEMES: BackgroundThemeSpec[] = [
    {
        id: "default-mist",
        name: "Iris Mist",
        description: "蓝紫奶雾，层次更细",
        baseLayer: "bg-[linear-gradient(170deg,#7588d9_0%,#95a6e5_24%,#c6cef3_52%,#d8ddf8_76%,#b7c2ee_100%)]",
        glassLayer: "bg-white/15 backdrop-blur-[18px] backdrop-saturate-[225%] backdrop-contrast-124",
        glowLayer: "bg-[radial-gradient(78%_30%_at_16%_10%,rgba(255,184,122,0.38),transparent_62%),radial-gradient(104%_46%_at_82%_22%,rgba(222,233,255,0.54),transparent_62%),radial-gradient(110%_62%_at_50%_100%,rgba(238,243,255,0.72),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(230,238,255,0)_0%,rgba(218,229,255,0.62)_44%,rgba(195,209,246,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(220%_120%_at_50%_120%,rgba(255,255,255,0.24),transparent_72%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(233,243,255,0.16),rgba(186,210,255,0.44)_40%,rgba(142,176,246,0.64)_68%,rgba(107,137,221,0.86)_100%)]",
    },
    {
        id: "rose-milk",
        name: "Rose Milk",
        description: "高甜粉奶油",
        baseLayer: "bg-[linear-gradient(170deg,#f3b9d8_0%,#f8cfe5_30%,#fbe5f1_56%,#f6d4e6_78%,#e9b8d2_100%)]",
        glassLayer: "bg-white/17 backdrop-blur-[18px] backdrop-saturate-[232%] backdrop-contrast-121",
        glowLayer: "bg-[radial-gradient(88%_36%_at_16%_12%,rgba(255,157,201,0.46),transparent_62%),radial-gradient(96%_44%_at_84%_20%,rgba(255,220,236,0.58),transparent_62%),radial-gradient(118%_66%_at_50%_100%,rgba(255,244,250,0.64),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(255,238,247,0)_0%,rgba(255,216,233,0.64)_44%,rgba(245,188,216,0.86)_100%)]",
        vignetteLayer: "bg-[radial-gradient(228%_130%_at_50%_118%,rgba(255,255,255,0.3),transparent_70%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(255,235,246,0.16),rgba(255,178,214,0.44)_40%,rgba(241,126,183,0.62)_68%,rgba(205,86,150,0.84)_100%)]",
    },
    {
        id: "sky-frost",
        name: "Sky Frost",
        description: "冰蓝高透，偏理性",
        baseLayer: "bg-[linear-gradient(172deg,#6fa3d6_0%,#8fc0eb_26%,#bee1f8_54%,#d7ecfb_78%,#aad0ef_100%)]",
        glassLayer: "bg-white/13 backdrop-blur-[18px] backdrop-saturate-[210%] backdrop-contrast-130",
        glowLayer: "bg-[radial-gradient(80%_34%_at_12%_16%,rgba(125,220,255,0.36),transparent_64%),radial-gradient(90%_40%_at_85%_14%,rgba(196,240,255,0.48),transparent_62%),radial-gradient(118%_64%_at_50%_100%,rgba(233,248,255,0.62),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(225,242,255,0)_0%,rgba(205,230,250,0.6)_44%,rgba(172,207,236,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(224%_124%_at_50%_118%,rgba(255,255,255,0.2),transparent_74%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(229,247,255,0.12),rgba(163,224,255,0.38)_42%,rgba(118,191,238,0.58)_68%,rgba(84,143,206,0.82)_100%)]",
    },
    {
        id: "lavender-cloud",
        name: "Lavender Cloud",
        description: "柔紫云，轻梦幻",
        baseLayer: "bg-[linear-gradient(170deg,#9b91d8_0%,#b3a9e7_28%,#d3cef5_56%,#e0daf8_76%,#b6afe7_100%)]",
        glassLayer: "bg-white/15 backdrop-blur-[17px] backdrop-saturate-[215%] backdrop-contrast-124",
        glowLayer: "bg-[radial-gradient(84%_36%_at_18%_12%,rgba(188,160,255,0.4),transparent_64%),radial-gradient(100%_46%_at_80%_20%,rgba(226,213,255,0.52),transparent_64%),radial-gradient(120%_66%_at_50%_100%,rgba(244,240,255,0.64),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(240,235,255,0)_0%,rgba(222,213,248,0.62)_44%,rgba(196,184,235,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(224%_126%_at_50%_120%,rgba(255,255,255,0.24),transparent_72%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(236,227,255,0.16),rgba(191,170,246,0.42)_42%,rgba(147,119,231,0.62)_68%,rgba(108,83,193,0.84)_100%)]",
    },
    {
        id: "peach-dawn",
        name: "Peach Dawn",
        description: "暖杏+晨曦橘",
        baseLayer: "bg-[linear-gradient(172deg,#f0b692_0%,#f8caa8_28%,#fde2c6_56%,#f7d7be_78%,#eeb08f_100%)]",
        glassLayer: "bg-white/15 backdrop-blur-[17px] backdrop-saturate-[218%] backdrop-contrast-122",
        glowLayer: "bg-[radial-gradient(84%_34%_at_16%_10%,rgba(255,154,99,0.44),transparent_62%),radial-gradient(100%_44%_at_84%_18%,rgba(255,220,176,0.52),transparent_62%),radial-gradient(120%_64%_at_50%_100%,rgba(255,241,222,0.62),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(255,238,219,0)_0%,rgba(254,214,177,0.62)_44%,rgba(239,174,132,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(224%_126%_at_50%_120%,rgba(255,255,255,0.24),transparent_73%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(255,245,231,0.14),rgba(255,204,147,0.42)_42%,rgba(245,156,98,0.62)_68%,rgba(209,115,62,0.84)_100%)]",
    },
    {
        id: "moon-pearl",
        name: "Moon Pearl",
        description: "珍珠灰蓝，极简",
        baseLayer: "bg-[linear-gradient(170deg,#96a3bf_0%,#aeb9cf_28%,#cfd7e5_56%,#d9dfe8_78%,#a8b4c6_100%)]",
        glassLayer: "bg-white/12 backdrop-blur-[17px] backdrop-saturate-[188%] backdrop-contrast-125",
        glowLayer: "bg-[radial-gradient(80%_32%_at_16%_12%,rgba(180,197,221,0.3),transparent_64%),radial-gradient(96%_44%_at_84%_18%,rgba(216,225,238,0.42),transparent_64%),radial-gradient(118%_66%_at_50%_100%,rgba(237,242,250,0.54),transparent_78%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(232,238,247,0)_0%,rgba(211,220,234,0.56)_44%,rgba(176,188,208,0.8)_100%)]",
        vignetteLayer: "bg-[radial-gradient(220%_126%_at_50%_120%,rgba(255,255,255,0.18),transparent_75%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(241,246,252,0.12),rgba(188,202,224,0.4)_42%,rgba(147,165,192,0.58)_68%,rgba(110,129,158,0.82)_100%)]",
    },
    {
        id: "mint-haze",
        name: "Mint Haze",
        description: "薄荷青透气感",
        baseLayer: "bg-[linear-gradient(170deg,#83cbbf_0%,#9fdccf_26%,#c7efe4_56%,#d7f3ea_78%,#9ed9cd_100%)]",
        glassLayer: "bg-white/14 backdrop-blur-[18px] backdrop-saturate-[222%] backdrop-contrast-122",
        glowLayer: "bg-[radial-gradient(82%_34%_at_14%_12%,rgba(101,223,198,0.38),transparent_64%),radial-gradient(96%_44%_at_84%_16%,rgba(208,248,236,0.5),transparent_62%),radial-gradient(120%_64%_at_50%_100%,rgba(237,254,248,0.62),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(230,252,244,0)_0%,rgba(196,238,225,0.6)_44%,rgba(151,214,198,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(224%_124%_at_50%_120%,rgba(255,255,255,0.22),transparent_73%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(233,255,248,0.12),rgba(153,236,214,0.4)_42%,rgba(89,200,171,0.62)_68%,rgba(54,152,132,0.84)_100%)]",
    },
    {
        id: "coral-pop",
        name: "Coral Pop",
        description: "珊瑚甜橘，高饱和",
        baseLayer: "bg-[linear-gradient(168deg,#ff9f9f_0%,#ffb28d_24%,#ffd0a7_50%,#ffd9ba_74%,#ffac97_100%)]",
        glassLayer: "bg-white/14 backdrop-blur-[18px] backdrop-saturate-[240%] backdrop-contrast-118",
        glowLayer: "bg-[radial-gradient(84%_34%_at_16%_12%,rgba(255,122,122,0.42),transparent_64%),radial-gradient(94%_44%_at_84%_18%,rgba(255,214,157,0.52),transparent_62%),radial-gradient(120%_66%_at_50%_100%,rgba(255,240,220,0.58),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(255,232,211,0)_0%,rgba(255,198,169,0.6)_44%,rgba(244,141,127,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(222%_126%_at_50%_120%,rgba(255,255,255,0.22),transparent_73%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(255,233,224,0.12),rgba(255,175,154,0.4)_40%,rgba(255,122,102,0.62)_68%,rgba(221,84,66,0.84)_100%)]",
    },
    {
        id: "sunset-jelly",
        name: "Sunset Jelly",
        description: "橘紫果冻转色",
        baseLayer: "bg-[linear-gradient(165deg,#f0896f_0%,#f2a36e_18%,#d59ad9_52%,#ad8ee2_76%,#7b8ad8_100%)]",
        glassLayer: "bg-white/13 backdrop-blur-[20px] backdrop-saturate-[235%] backdrop-contrast-120",
        glowLayer: "bg-[radial-gradient(80%_32%_at_10%_12%,rgba(255,162,94,0.44),transparent_62%),radial-gradient(96%_44%_at_84%_18%,rgba(181,153,255,0.52),transparent_62%),radial-gradient(120%_64%_at_50%_100%,rgba(228,224,255,0.58),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(233,221,255,0)_0%,rgba(201,178,243,0.58)_44%,rgba(139,139,213,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(220%_126%_at_50%_120%,rgba(255,255,255,0.18),transparent_73%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(255,230,206,0.12),rgba(244,161,126,0.38)_34%,rgba(180,133,226,0.58)_66%,rgba(102,120,205,0.84)_100%)]",
    },
    {
        id: "forest-glass",
        name: "Forest Glass",
        description: "深林绿玻璃",
        baseLayer: "bg-[linear-gradient(170deg,#33554a_0%,#3f6b5c_26%,#6da088_54%,#95c0a9_78%,#4f7f6d_100%)]",
        glassLayer: "bg-white/10 backdrop-blur-[18px] backdrop-saturate-[190%] backdrop-contrast-128",
        glowLayer: "bg-[radial-gradient(82%_34%_at_16%_10%,rgba(76,168,136,0.32),transparent_62%),radial-gradient(94%_42%_at_84%_16%,rgba(176,219,196,0.44),transparent_62%),radial-gradient(118%_64%_at_50%_100%,rgba(215,236,223,0.56),transparent_76%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(216,236,224,0)_0%,rgba(140,188,165,0.52)_44%,rgba(68,114,95,0.82)_100%)]",
        vignetteLayer: "bg-[radial-gradient(220%_124%_at_50%_120%,rgba(255,255,255,0.12),transparent_76%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(217,245,231,0.1),rgba(116,187,158,0.34)_42%,rgba(70,137,111,0.58)_68%,rgba(42,87,72,0.84)_100%)]",
    },
    {
        id: "midnight-neon",
        name: "Midnight Neon",
        description: "深夜电光蓝紫",
        baseLayer: "bg-[linear-gradient(166deg,#0d1632_0%,#172b53_24%,#223f74_48%,#2f3f7f_72%,#1a2346_100%)]",
        glassLayer: "bg-black/20 backdrop-blur-[18px] backdrop-saturate-[210%] backdrop-contrast-140",
        glowLayer: "bg-[radial-gradient(86%_34%_at_16%_12%,rgba(70,160,255,0.4),transparent_62%),radial-gradient(92%_40%_at_82%_16%,rgba(145,116,255,0.46),transparent_62%),radial-gradient(120%_64%_at_50%_100%,rgba(98,136,247,0.24),transparent_78%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(53,91,193,0)_0%,rgba(39,63,145,0.42)_44%,rgba(17,28,72,0.84)_100%)]",
        vignetteLayer: "bg-[radial-gradient(220%_126%_at_50%_120%,rgba(255,255,255,0.08),transparent_78%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(99,176,255,0.12),rgba(72,121,247,0.36)_40%,rgba(82,71,214,0.58)_68%,rgba(23,33,94,0.86)_100%)]",
    },
    {
        id: "noir-rose",
        name: "Noir Rose",
        description: "黑莓玫瑰电影感",
        baseLayer: "bg-[linear-gradient(165deg,#271724_0%,#3d2138_26%,#5a2c4f_52%,#7a4367_76%,#3a2235_100%)]",
        glassLayer: "bg-black/22 backdrop-blur-[19px] backdrop-saturate-[205%] backdrop-contrast-132",
        glowLayer: "bg-[radial-gradient(80%_32%_at_14%_12%,rgba(228,102,165,0.34),transparent_62%),radial-gradient(94%_42%_at_84%_16%,rgba(190,130,255,0.34),transparent_64%),radial-gradient(118%_64%_at_50%_100%,rgba(255,183,221,0.2),transparent_78%)]",
        bottomLayer: "bg-[linear-gradient(180deg,rgba(168,78,132,0)_0%,rgba(110,52,95,0.46)_44%,rgba(37,21,34,0.86)_100%)]",
        vignetteLayer: "bg-[radial-gradient(220%_126%_at_50%_120%,rgba(255,255,255,0.08),transparent_80%)]",
        transitionFilm: "bg-[radial-gradient(120%_96%_at_50%_50%,rgba(255,171,221,0.1),rgba(174,94,151,0.36)_40%,rgba(110,57,103,0.58)_68%,rgba(35,20,35,0.88)_100%)]",
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
