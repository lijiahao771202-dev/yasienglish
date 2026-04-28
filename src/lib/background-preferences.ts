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
    | "ice-blue"
    | "obsidian-gold"
    | "zen-frost"
    | "nordic-aurora"
    | "crimson-velvet"
    | "silver-matrix"
    | "kyoto-matcha"
    | "autumn-amber"
    | "ocean-pearl"
    | "desert-dune"
    | "emerald-mist"
    | "platinum-ghost"
    | "sakura-silk"
    | "glacier-sapphire"
    | "velvet-midnight"
    | "carbon-fiber"
    | "bonsai-shadow"
    | "tuscan-sun"
    | "vintage-leather"
    | "lilac-cloud"
    | "neon-tokyo"
    | "crystal-frost"
    | "arctic-ocean"
    | "polar-aurora"
    | "sapphire-lake"
    | "winter-breeze";

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
    {
        id: "obsidian-gold",
        name: "Obsidian Gold",
        description: "暗金黑曜：极致奢华黑与液态暗金",
        baseLayer: "bg-[#0a0a0b]",
        glassLayer: "bg-black/40 backdrop-blur-[24px] backdrop-saturate-[180%]",
        glowLayer: "bg-[radial-gradient(100%_100%_at_50%_0%,rgba(212,175,55,0.15),transparent_50%),radial-gradient(80%_80%_at_80%_100%,rgba(184,134,11,0.12),transparent_50%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(0,0,0,0.8)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]",
        transitionFilm: "bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02),transparent_60%)]",
        coverGradient: "linear-gradient(135deg, #18181b 0%, #000 50%, #3f2e04 100%)",
    },
    {
        id: "zen-frost",
        name: "Zen Frost",
        description: "霜白枯山水：极简冷调与微弱青瓷光斑",
        baseLayer: "bg-[#f8f9fa]",
        glassLayer: "bg-white/40 backdrop-blur-[30px] backdrop-saturate-[120%]",
        glowLayer: "bg-[radial-gradient(120%_80%_at_20%_10%,rgba(178,223,219,0.35),transparent_60%),radial-gradient(100%_100%_at_80%_90%,rgba(224,242,241,0.45),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(255,255,255,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(240,244,248,0.5)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)",
    },
    {
        id: "nordic-aurora",
        name: "Nordic Aurora",
        description: "极光秘境：深海蓝与游动的青紫交织",
        baseLayer: "bg-[#020617]",
        glassLayer: "bg-slate-900/40 backdrop-blur-[20px] backdrop-saturate-[150%]",
        glowLayer: "bg-[radial-gradient(ellipse_120%_80%_at_20%_20%,rgba(45,212,191,0.25),transparent_60%),radial-gradient(ellipse_100%_100%_at_80%_80%,rgba(168,85,247,0.2),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(2,6,23,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.5)_100%)]",
        transitionFilm: "bg-[radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.1),transparent_50%)]",
        coverGradient: "linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e1b4b 100%)",
    },
    {
        id: "crimson-velvet",
        name: "Crimson Velvet",
        description: "丝绒勃艮第：高级艺术馆的醇厚深红",
        baseLayer: "bg-[#3f0a1d]",
        glassLayer: "bg-[#2a0410]/30 backdrop-blur-[24px] backdrop-saturate-[140%]",
        glowLayer: "bg-[radial-gradient(ellipse_80%_80%_at_20%_10%,rgba(225,29,72,0.2),transparent_70%),radial-gradient(ellipse_100%_100%_at_80%_90%,rgba(244,63,94,0.15),transparent_70%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(30,0,10,0.8)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(20,0,10,0.6)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #4c0519 0%, #881337 50%, #3f0a1d 100%)",
    },
    {
        id: "silver-matrix",
        name: "Silver Matrix",
        description: "秘银序列：科幻未来感的铂金灰",
        baseLayer: "bg-[#cbd5e1]",
        glassLayer: "bg-slate-100/50 backdrop-blur-[32px] backdrop-saturate-[110%]",
        glowLayer: "bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.9),transparent_40%),radial-gradient(circle_at_80%_70%,rgba(186,230,253,0.5),transparent_50%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(148,163,184,0.4)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(100,116,139,0.3)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 50%, #94a3b8 100%)",
    },
    {
        id: "kyoto-matcha",
        name: "Kyoto Matcha",
        description: "京都庭院：清晨竹雾与温和抹茶静谧",
        baseLayer: "bg-[#f0ece1]",
        glassLayer: "bg-[#f8f5ec]/50 backdrop-blur-[24px] backdrop-saturate-[110%]",
        glowLayer: "bg-[radial-gradient(120%_100%_at_20%_0%,rgba(212,224,204,0.6),transparent_60%),radial-gradient(100%_100%_at_80%_100%,rgba(193,210,181,0.5),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(240,236,225,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(224,217,204,0.6)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #f8f5ec 0%, #f0ece1 50%, #d4e0cc 100%)",
    },
    {
        id: "autumn-amber",
        name: "Autumn Amber",
        description: "秋日琥珀：落叶陶土色带点蜂蜜的光泽",
        baseLayer: "bg-[#e6d5c3]",
        glassLayer: "bg-[#f3eadf]/40 backdrop-blur-[28px] backdrop-saturate-[130%]",
        glowLayer: "bg-[radial-gradient(120%_100%_at_30%_10%,rgba(224,142,54,0.18),transparent_60%),radial-gradient(100%_100%_at_70%_90%,rgba(205,103,43,0.15),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(230,213,195,0.8)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(201,177,152,0.5)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #f3eadf 0%, #e6d5c3 50%, #cd672b 100%)",
    },
    {
        id: "ocean-pearl",
        name: "Ocean Pearl",
        description: "深海珍珠：极深海蓝透着幻彩贝母微光",
        baseLayer: "bg-[#061826]",
        glassLayer: "bg-[#061826]/40 backdrop-blur-[32px] backdrop-saturate-[120%]",
        glowLayer: "bg-[radial-gradient(100%_100%_at_20%_20%,rgba(61,164,171,0.25),transparent_60%),radial-gradient(100%_100%_at_80%_80%,rgba(240,230,234,0.15),transparent_70%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(6,24,38,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.6)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #0f2c42 0%, #061826 50%, #3da4ab 100%)",
    },
    {
        id: "desert-dune",
        name: "Desert Dune",
        description: "大漠流沙：极其克制的高级中性石材暖沙",
        baseLayer: "bg-[#d2c9bd]",
        glassLayer: "bg-[#e2ddd5]/45 backdrop-blur-[24px] backdrop-saturate-[105%]",
        glowLayer: "bg-[radial-gradient(120%_120%_at_10%_10%,rgba(255,255,255,0.4),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(210,201,189,0.8)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(186,174,157,0.4)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #e2ddd5 0%, #d2c9bd 50%, #baae9d 100%)",
    },
    {
        id: "emerald-mist",
        name: "Emerald Mist",
        description: "翡翠薄雾：浓郁暗调祖母绿笼罩白色冷雾",
        baseLayer: "bg-[#042417]",
        glassLayer: "bg-[#042417]/30 backdrop-blur-[36px] backdrop-saturate-[150%]",
        glowLayer: "bg-[radial-gradient(150%_150%_at_50%_0%,rgba(255,255,255,0.08),transparent_50%),radial-gradient(120%_120%_at_80%_100%,rgba(52,211,153,0.12),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(4,36,23,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.7)_100%)]",
        transitionFilm: "bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.01),transparent_60%)]",
        coverGradient: "linear-gradient(135deg, #064e3b 0%, #042417 50%, #34d399 100%)",
    },
    {
        id: "platinum-ghost",
        name: "Platinum Ghost",
        description: "幻影铂金：带有微弱极光色散的高级冷白",
        baseLayer: "bg-[#f8f9fa]",
        glassLayer: "bg-white/50 backdrop-blur-[40px] backdrop-saturate-[105%]",
        glowLayer: "bg-[radial-gradient(ellipse_120%_80%_at_0%_0%,rgba(196,181,253,0.15),transparent_50%),radial-gradient(ellipse_100%_100%_at_100%_100%,rgba(186,230,253,0.2),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(241,245,249,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(226,232,240,0.6)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #e2e8f0 100%)",
    },
    {
        id: "sakura-silk",
        name: "Sakura Silk",
        description: "初樱柔丝：顶级护肤品的通透霜粉色",
        baseLayer: "bg-[#fdf2f8]",
        glassLayer: "bg-[#fce7f3]/50 backdrop-blur-[32px] backdrop-saturate-[115%]",
        glowLayer: "bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.7),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(251,207,232,0.6),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(253,242,248,0.85)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(251,207,232,0.4)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #fff5f8 0%, #fce7f3 50%, #fbcfe8 100%)",
    },
    {
        id: "glacier-sapphire",
        name: "Glacier Sapphire",
        description: "冰川蓝宝石：高对比冷冽宝石棱晶反光",
        baseLayer: "bg-[#020617]",
        glassLayer: "bg-[#0f172a]/40 backdrop-blur-[32px] backdrop-saturate-[180%]",
        glowLayer: "bg-[radial-gradient(120%_100%_at_20%_0%,rgba(56,189,248,0.25),transparent_50%),radial-gradient(80%_80%_at_80%_100%,rgba(14,165,233,0.15),transparent_50%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(2,6,23,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.8)_100%)]",
        transitionFilm: "bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_40%)]",
        coverGradient: "linear-gradient(135deg, #0f172a 0%, #020617 50%, #0284c7 100%)",
    },
    {
        id: "velvet-midnight",
        name: "Velvet Midnight",
        description: "丝绒午夜：极深吸音材质与微弱香槟金",
        baseLayer: "bg-[#050508]",
        glassLayer: "bg-[#050508]/60 backdrop-blur-[48px] backdrop-saturate-[105%]",
        glowLayer: "bg-[radial-gradient(circle_at_30%_20%,rgba(212,175,55,0.08),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(212,175,55,0.05),transparent_50%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(5,5,8,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-black/40",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #18181b 0%, #050508 50%, #271c04 100%)",
    },
    {
        id: "carbon-fiber",
        name: "Carbon Fiber",
        description: "暗影碳脉：哑面深灰隐形涂装与暗红点缀",
        baseLayer: "bg-[#111111]",
        glassLayer: "bg-[#171717]/80 backdrop-blur-[12px] backdrop-saturate-[100%]",
        glowLayer: "bg-[radial-gradient(ellipse_150%_10%_at_50%_0%,rgba(220,38,38,0.15),transparent_80%),radial-gradient(circle_at_50%_100%,rgba(239,68,68,0.1),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(17,17,17,0.95)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_10%,rgba(0,0,0,0.6)_100%)]",
        transitionFilm: "bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,0.01)_2px,rgba(255,255,255,0.01)_4px)]",
        coverGradient: "linear-gradient(135deg, #262626 0%, #111111 50%, #991b1b 100%)",
    },
    {
        id: "bonsai-shadow",
        name: "Bonsai Shadow",
        description: "盆景幽影：深极黑白底座透露微弱苔藓绿",
        baseLayer: "bg-[#0d120e]",
        glassLayer: "bg-[#0d120e]/50 backdrop-blur-[36px] backdrop-saturate-[120%]",
        glowLayer: "bg-[radial-gradient(100%_100%_at_20%_10%,rgba(101,163,13,0.12),transparent_70%),radial-gradient(100%_100%_at_80%_90%,rgba(77,124,15,0.12),transparent_70%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(13,18,14,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.8)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #141f18 0%, #0d120e 50%, #3f6212 100%)",
    },
    {
        id: "tuscan-sun",
        name: "Tuscan Sun",
        description: "托斯卡纳艳阳：南欧极暖的下午石灰岩",
        baseLayer: "bg-[#fde68a]",
        glassLayer: "bg-[#fef3c7]/60 backdrop-blur-[24px] backdrop-saturate-[140%]",
        glowLayer: "bg-[radial-gradient(120%_80%_at_0%_0%,rgba(245,158,11,0.3),transparent_60%),radial-gradient(100%_100%_at_100%_50%,rgba(217,119,6,0.2),transparent_70%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(253,230,138,0.8)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(217,119,6,0.25)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #d97706 100%)",
    },
    {
        id: "vintage-leather",
        name: "Vintage Leather",
        description: "复古马鞍：英伦深桃花心木与暖炉火光",
        baseLayer: "bg-[#3e2723]",
        glassLayer: "bg-[#4e342e]/40 backdrop-blur-[28px] backdrop-saturate-[110%]",
        glowLayer: "bg-[radial-gradient(circle_at_30%_30%,rgba(216,67,21,0.15),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(255,143,0,0.1),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(46,27,22,0.85)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(20,10,5,0.7)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #5d4037 0%, #3e2723 50%, #bf360c 100%)",
    },
    {
        id: "lilac-cloud",
        name: "Lilac Cloud",
        description: "丁香云境：极其轻盈高频的治愈系柔紫",
        baseLayer: "bg-[#f5f3ff]",
        glassLayer: "bg-[#faf5ff]/45 backdrop-blur-[36px] backdrop-saturate-[130%]",
        glowLayer: "bg-[radial-gradient(100%_100%_at_20%_10%,rgba(216,180,254,0.35),transparent_60%),radial-gradient(120%_80%_at_80%_90%,rgba(232,121,249,0.25),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(245,243,255,0.85)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(221,214,254,0.5)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #faf5ff 0%, #f3e8ff 50%, #d8b4fe 100%)",
    },
    {
        id: "neon-tokyo",
        name: "Neon Tokyo",
        description: "霓虹幻夜：克制的深紫外空与青紫霓虹",
        baseLayer: "bg-[#0b0314]",
        glassLayer: "bg-[#180a2b]/35 backdrop-blur-[24px] backdrop-saturate-[160%]",
        glowLayer: "bg-[radial-gradient(ellipse_120%_80%_at_10%_0%,rgba(217,70,239,0.25),transparent_60%),radial-gradient(ellipse_120%_100%_at_90%_100%,rgba(6,182,212,0.25),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(11,3,20,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_10%,rgba(0,0,0,0.8)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #2e1065 0%, #0b0314 50%, #d946ef 100%)",
    },
    {
        id: "crystal-frost",
        name: "Crystal Frost",
        description: "极寒水晶：透射着极致冷感的浅蓝冰晶",
        baseLayer: "bg-[#f0f9ff]",
        glassLayer: "bg-[#e0f2fe]/40 backdrop-blur-[32px] backdrop-saturate-[120%]",
        glowLayer: "bg-[radial-gradient(ellipse_100%_100%_at_20%_20%,rgba(186,230,253,0.4),transparent_60%),radial-gradient(ellipse_100%_100%_at_80%_80%,rgba(125,211,252,0.3),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(240,249,255,0.8)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(186,230,253,0.3)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #7dd3fc 100%)",
    },
    {
        id: "arctic-ocean",
        name: "Arctic Ocean",
        description: "北冰洋蓝：深邃神秘的极地深海冷调",
        baseLayer: "bg-[#082f49]",
        glassLayer: "bg-[#0c4a6e]/50 backdrop-blur-[24px] backdrop-saturate-[110%]",
        glowLayer: "bg-[radial-gradient(ellipse_100%_100%_at_30%_30%,rgba(2,132,199,0.2),transparent_60%),radial-gradient(ellipse_100%_100%_at_70%_70%,rgba(3,105,161,0.2),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(8,47,73,0.9)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_10%,rgba(4,24,38,0.8)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #0c4a6e 0%, #082f49 50%, #0284c7 100%)",
    },
    {
        id: "polar-aurora",
        name: "Polar Aurora",
        description: "极冠蔚蓝：冰原之上划过的天青色极光",
        baseLayer: "bg-[#0f172a]",
        glassLayer: "bg-[#1e293b]/45 backdrop-blur-[36px] backdrop-saturate-[140%]",
        glowLayer: "bg-[radial-gradient(ellipse_120%_80%_at_10%_0%,rgba(56,189,248,0.25),transparent_60%),radial-gradient(ellipse_120%_100%_at_90%_100%,rgba(14,165,233,0.2),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(15,23,42,0.85)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(2,6,23,0.7)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #38bdf8 100%)",
    },
    {
        id: "sapphire-lake",
        name: "Sapphire Lake",
        description: "蓝宝石湖：清透如镜的高山冰封湖面",
        baseLayer: "bg-[#ecfeff]",
        glassLayer: "bg-[#cffafe]/30 backdrop-blur-[20px] backdrop-saturate-[125%]",
        glowLayer: "bg-[radial-gradient(ellipse_100%_100%_at_50%_0%,rgba(165,243,252,0.5),transparent_60%),radial-gradient(ellipse_100%_100%_at_50%_100%,rgba(103,232,249,0.4),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(236,254,255,0.8)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(165,243,252,0.3)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #cffafe 0%, #ecfeff 50%, #67e8f9 100%)",
    },
    {
        id: "winter-breeze",
        name: "Winter Breeze",
        description: "凛冬微风：裹挟着雪花的灰蓝色气流",
        baseLayer: "bg-[#f1f5f9]",
        glassLayer: "bg-[#e2e8f0]/50 backdrop-blur-[24px] backdrop-saturate-[105%]",
        glowLayer: "bg-[radial-gradient(ellipse_100%_100%_at_0%_50%,rgba(203,213,225,0.4),transparent_60%),radial-gradient(ellipse_100%_100%_at_100%_50%,rgba(148,163,184,0.3),transparent_60%)]",
        bottomLayer: "bg-[linear-gradient(to_top,rgba(241,245,249,0.85)_0%,transparent_100%)]",
        vignetteLayer: "bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(203,213,225,0.4)_100%)]",
        transitionFilm: "bg-transparent",
        coverGradient: "linear-gradient(135deg, #e2e8f0 0%, #f1f5f9 50%, #94a3b8 100%)",
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
