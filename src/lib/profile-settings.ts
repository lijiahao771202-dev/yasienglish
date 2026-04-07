export type LearningTargetMode = "read" | "battle" | "vocab";
export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type UiThemePreference = "bubblegum_pop" | "starlight_arcade" | "peach_glow";
export const RANDOM_ENGLISH_TTS_VOICE = "random-en-voice-excluding-in" as const;
export type TtsVoice =
    | "en-AU-NatashaNeural"
    | "en-AU-WilliamMultilingualNeural"
    | "en-CA-ClaraNeural"
    | "en-CA-LiamNeural"
    | "en-GB-LibbyNeural"
    | "en-GB-MaisieNeural"
    | "en-GB-RyanNeural"
    | "en-GB-SoniaNeural"
    | "en-GB-ThomasNeural"
    | "en-HK-SamNeural"
    | "en-HK-YanNeural"
    | "en-IE-ConnorNeural"
    | "en-IE-EmilyNeural"
    | "en-IN-NeerjaExpressiveNeural"
    | "en-IN-NeerjaNeural"
    | "en-IN-PrabhatNeural"
    | "en-KE-AsiliaNeural"
    | "en-KE-ChilembaNeural"
    | "en-NG-AbeoNeural"
    | "en-NG-EzinneNeural"
    | "en-NZ-MitchellNeural"
    | "en-NZ-MollyNeural"
    | "en-PH-JamesNeural"
    | "en-PH-RosaNeural"
    | "en-SG-LunaNeural"
    | "en-SG-WayneNeural"
    | "en-TZ-ElimuNeural"
    | "en-TZ-ImaniNeural"
    | "en-US-AvaNeural"
    | "en-US-AriaNeural"
    | "en-US-EmmaNeural"
    | "en-US-JennyNeural"
    | "en-US-AnaNeural"
    | "en-US-AndrewNeural"
    | "en-US-BrianNeural"
    | "en-US-ChristopherNeural"
    | "en-US-EricNeural"
    | "en-US-GuyNeural"
    | "en-US-MichelleNeural"
    | "en-US-RogerNeural"
    | "en-US-SteffanNeural"
    | "en-US-AndrewMultilingualNeural"
    | "en-US-AvaMultilingualNeural"
    | "en-US-BrianMultilingualNeural"
    | "en-US-EmmaMultilingualNeural"
    | "en-ZA-LeahNeural"
    | "en-ZA-LukeNeural"
    | "zh-CN-XiaoxiaoNeural"
    | "zh-CN-XiaoyiNeural"
    | "zh-CN-YunjianNeural"
    | "zh-CN-YunxiNeural"
    | "zh-CN-YunxiaNeural"
    | "zh-CN-YunyangNeural"
    | "zh-CN-XiaobeiNeural"
    | "zh-CN-XiaoniNeural";
export type LearningPreferenceTtsVoice = TtsVoice | typeof RANDOM_ENGLISH_TTS_VOICE;

export interface TtsVoiceOption {
    voice: TtsVoice;
    label: string;
    description: string;
}

export interface LearningPreferences {
    target_mode: LearningTargetMode;
    english_level: EnglishLevel;
    daily_goal_minutes: number;
    ui_theme_preference: UiThemePreference;
    tts_voice: LearningPreferenceTtsVoice;
    rebuild_auto_open_shadowing_prompt?: boolean;
}

export const DEFAULT_PROFILE_USERNAME = "Yasi Learner";
export const DEFAULT_AVATAR_PRESET = "bubble-bear";
export const DEFAULT_TTS_VOICE: TtsVoice = "en-US-JennyNeural";

export const TTS_VOICE_OPTIONS: TtsVoiceOption[] = [
    {
        voice: "en-AU-NatashaNeural",
        label: "Natasha (AU)",
        description: "Australian English voice with a clear, natural rhythm.",
    },
    {
        voice: "en-AU-WilliamMultilingualNeural",
        label: "William Multilingual (AU)",
        description: "Australian multilingual male voice for broader accent exposure.",
    },
    {
        voice: "en-CA-ClaraNeural",
        label: "Clara (CA)",
        description: "Canadian English female voice with balanced pacing.",
    },
    {
        voice: "en-CA-LiamNeural",
        label: "Liam (CA)",
        description: "Canadian English male voice, steady and easy to follow.",
    },
    {
        voice: "en-GB-LibbyNeural",
        label: "Libby (UK)",
        description: "British English female voice, crisp and articulate.",
    },
    {
        voice: "en-GB-MaisieNeural",
        label: "Maisie (UK)",
        description: "British English female voice with a light, friendly tone.",
    },
    {
        voice: "en-GB-RyanNeural",
        label: "Ryan (UK)",
        description: "British English male voice, clear for dialogue practice.",
    },
    {
        voice: "en-GB-SoniaNeural",
        label: "Sonia (UK)",
        description: "British English female voice suited to explanatory speech.",
    },
    {
        voice: "en-GB-ThomasNeural",
        label: "Thomas (UK)",
        description: "British English male voice with stable cadence.",
    },
    {
        voice: "en-HK-SamNeural",
        label: "Sam (HK)",
        description: "Hong Kong English male voice, clean for mixed-accent listening.",
    },
    {
        voice: "en-HK-YanNeural",
        label: "Yan (HK)",
        description: "Hong Kong English female voice with calm delivery.",
    },
    {
        voice: "en-IE-ConnorNeural",
        label: "Connor (IE)",
        description: "Irish English male voice for accent variety.",
    },
    {
        voice: "en-IE-EmilyNeural",
        label: "Emily (IE)",
        description: "Irish English female voice, smooth and clear.",
    },
    {
        voice: "en-IN-NeerjaExpressiveNeural",
        label: "Neerja Expressive (IN)",
        description: "Indian English expressive female voice for lively narration.",
    },
    {
        voice: "en-IN-NeerjaNeural",
        label: "Neerja (IN)",
        description: "Indian English female voice with neutral pacing.",
    },
    {
        voice: "en-IN-PrabhatNeural",
        label: "Prabhat (IN)",
        description: "Indian English male voice, good for practical listening drills.",
    },
    {
        voice: "en-KE-AsiliaNeural",
        label: "Asilia (KE)",
        description: "Kenyan English female voice for broader accent exposure.",
    },
    {
        voice: "en-KE-ChilembaNeural",
        label: "Chilemba (KE)",
        description: "Kenyan English male voice with clear consonants.",
    },
    {
        voice: "en-NG-AbeoNeural",
        label: "Abeo (NG)",
        description: "Nigerian English male voice with natural prosody.",
    },
    {
        voice: "en-NG-EzinneNeural",
        label: "Ezinne (NG)",
        description: "Nigerian English female voice for accent adaptation.",
    },
    {
        voice: "en-NZ-MitchellNeural",
        label: "Mitchell (NZ)",
        description: "New Zealand English male voice, conversational style.",
    },
    {
        voice: "en-NZ-MollyNeural",
        label: "Molly (NZ)",
        description: "New Zealand English female voice, clear and warm.",
    },
    {
        voice: "en-PH-JamesNeural",
        label: "James (PH)",
        description: "Philippine English male voice for practical listening diversity.",
    },
    {
        voice: "en-PH-RosaNeural",
        label: "Rosa (PH)",
        description: "Philippine English female voice with a gentle pace.",
    },
    {
        voice: "en-SG-LunaNeural",
        label: "Luna (SG)",
        description: "Singapore English female voice, useful for regional accent training.",
    },
    {
        voice: "en-SG-WayneNeural",
        label: "Wayne (SG)",
        description: "Singapore English male voice with clear rhythm.",
    },
    {
        voice: "en-TZ-ElimuNeural",
        label: "Elimu (TZ)",
        description: "Tanzanian English male voice for additional accent exposure.",
    },
    {
        voice: "en-TZ-ImaniNeural",
        label: "Imani (TZ)",
        description: "Tanzanian English female voice with smooth pacing.",
    },
    {
        voice: "en-US-AvaNeural",
        label: "Ava",
        description: "Soft and clean for steady shadowing.",
    },
    {
        voice: "en-US-AriaNeural",
        label: "Aria",
        description: "Clear and modern. Best for shadowing and crisp repetition.",
    },
    {
        voice: "en-US-EmmaNeural",
        label: "Emma",
        description: "Gentle and polished. Good for slower explanation.",
    },
    {
        voice: "en-US-AndrewNeural",
        label: "Andrew",
        description: "Clear male voice. Works well for shadowing.",
    },
    {
        voice: "en-US-BrianNeural",
        label: "Brian",
        description: "Calm and steady. Good for slower teaching audio.",
    },
    {
        voice: "en-US-ChristopherNeural",
        label: "Christopher",
        description: "Deep and deliberate for slower explanation.",
    },
    {
        voice: "en-US-EricNeural",
        label: "Eric",
        description: "Neutral and articulate, easy on the ear.",
    },
    {
        voice: "en-US-GuyNeural",
        label: "Guy",
        description: "Natural and conversational.",
    },
    {
        voice: "en-US-MichelleNeural",
        label: "Michelle",
        description: "Measured and instructional.",
    },
    {
        voice: "en-US-RogerNeural",
        label: "Roger",
        description: "Older, slower cadence for detailed teaching.",
    },
    {
        voice: "en-US-SteffanNeural",
        label: "Steffan",
        description: "Balanced and slightly formal.",
    },
    {
        voice: "en-US-AnaNeural",
        label: "Ana",
        description: "Bright, concise, and easy to follow.",
    },
    {
        voice: "en-US-AndrewMultilingualNeural",
        label: "Andrew Multi",
        description: "Multilingual male voice with strong clarity.",
    },
    {
        voice: "en-US-AvaMultilingualNeural",
        label: "Ava Multi",
        description: "Multilingual female voice with a softer tone.",
    },
    {
        voice: "en-US-BrianMultilingualNeural",
        label: "Brian Multi",
        description: "Multilingual and steady for practice.",
    },
    {
        voice: "en-US-EmmaMultilingualNeural",
        label: "Emma Multi",
        description: "Multilingual, gentle, and easy to follow.",
    },
    {
        voice: "en-ZA-LeahNeural",
        label: "Leah (ZA)",
        description: "South African English female voice for accent broadening.",
    },
    {
        voice: "en-ZA-LukeNeural",
        label: "Luke (ZA)",
        description: "South African English male voice, clear and stable.",
    },
    {
        voice: "en-US-JennyNeural",
        label: "Jenny",
        description: "Balanced default voice for general learning.",
    },
    {
        voice: "zh-CN-XiaoxiaoNeural",
        label: "晓晓",
        description: "标准普通话女声，适合跟读和日常讲解。",
    },
    {
        voice: "zh-CN-XiaoyiNeural",
        label: "晓伊",
        description: "温和女声，适合慢速讲解。",
    },
    {
        voice: "zh-CN-YunjianNeural",
        label: "云健",
        description: "标准普通话男声，适合朗读和跟读。",
    },
    {
        voice: "zh-CN-YunxiNeural",
        label: "云希",
        description: "沉稳男声，适合慢速讲解。",
    },
    {
        voice: "zh-CN-YunxiaNeural",
        label: "云夏",
        description: "柔和女声，适合轻松听读。",
    },
    {
        voice: "zh-CN-YunyangNeural",
        label: "云扬",
        description: "清晰男声，适合朗读和句子拆解。",
    },
    {
        voice: "zh-CN-XiaobeiNeural",
        label: "小北",
        description: "东北口音女声，适合更有个性的听感。",
    },
    {
        voice: "zh-CN-XiaoniNeural",
        label: "晓妮",
        description: "陕西口音女声，适合方言风格练习。",
    },
];

const TTS_VOICE_SET = new Set<TtsVoice>(TTS_VOICE_OPTIONS.map((option) => option.voice));
const RANDOMIZED_ENGLISH_TTS_VOICE_OPTIONS = TTS_VOICE_OPTIONS.filter((option) => (
    option.voice.startsWith("en-") && !option.voice.startsWith("en-IN-")
));

export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
    target_mode: "read",
    english_level: "B1",
    daily_goal_minutes: 20,
    ui_theme_preference: "bubblegum_pop",
    tts_voice: DEFAULT_TTS_VOICE,
    rebuild_auto_open_shadowing_prompt: true,
};

const TARGET_MODES = new Set<LearningTargetMode>(["read", "battle", "vocab"]);
const ENGLISH_LEVELS = new Set<EnglishLevel>(["A1", "A2", "B1", "B2", "C1", "C2"]);
const UI_THEME_PREFERENCES = new Set<UiThemePreference>(["bubblegum_pop", "starlight_arcade", "peach_glow"]);

export function normalizeProfileUsername(username?: string | null) {
    const trimmed = username?.trim();
    return trimmed ? trimmed.slice(0, 40) : DEFAULT_PROFILE_USERNAME;
}

export function normalizeAvatarPreset(avatarPreset?: string | null) {
    const trimmed = avatarPreset?.trim();
    return trimmed ? trimmed : DEFAULT_AVATAR_PRESET;
}

export function normalizeProfileBio(bio?: string | null) {
    return bio?.trim().slice(0, 280) ?? "";
}

export function normalizeProfileDeepSeekApiKey(apiKey?: string | null) {
    return apiKey?.trim().slice(0, 200) ?? "";
}

export function normalizeTtsVoice(voice?: string | null): TtsVoice {
    const trimmed = voice?.trim();
    return trimmed && TTS_VOICE_SET.has(trimmed as TtsVoice)
        ? trimmed as TtsVoice
        : DEFAULT_TTS_VOICE;
}

export function isRandomEnglishTtsVoicePreference(voice?: string | null): voice is typeof RANDOM_ENGLISH_TTS_VOICE {
    return voice?.trim() === RANDOM_ENGLISH_TTS_VOICE;
}

export function normalizeLearningPreferenceTtsVoice(voice?: string | null): LearningPreferenceTtsVoice {
    if (isRandomEnglishTtsVoicePreference(voice)) {
        return RANDOM_ENGLISH_TTS_VOICE;
    }

    return normalizeTtsVoice(voice);
}

export function resolveRandomEnglishTtsVoice(randomValue = Math.random()): TtsVoice {
    const safePool = RANDOMIZED_ENGLISH_TTS_VOICE_OPTIONS.length > 0
        ? RANDOMIZED_ENGLISH_TTS_VOICE_OPTIONS
        : TTS_VOICE_OPTIONS.filter((option) => option.voice.startsWith("en-"));

    const normalizedRandom = Number.isFinite(randomValue)
        ? Math.min(0.999999, Math.max(0, randomValue))
        : 0;
    const index = Math.floor(normalizedRandom * safePool.length);
    return safePool[index]?.voice ?? DEFAULT_TTS_VOICE;
}

export function resolveLearningPreferenceTtsVoice(
    voice?: string | null,
    randomValue = Math.random(),
): TtsVoice {
    const normalized = normalizeLearningPreferenceTtsVoice(voice);
    if (normalized === RANDOM_ENGLISH_TTS_VOICE) {
        return resolveRandomEnglishTtsVoice(randomValue);
    }

    return normalized;
}

export function normalizeLearningPreferences(
    preferences?: Partial<LearningPreferences> | null,
): LearningPreferences {
    const dailyGoal = Number(preferences?.daily_goal_minutes);

    return {
        target_mode: TARGET_MODES.has(preferences?.target_mode as LearningTargetMode)
            ? preferences?.target_mode as LearningTargetMode
            : DEFAULT_LEARNING_PREFERENCES.target_mode,
        english_level: ENGLISH_LEVELS.has(preferences?.english_level as EnglishLevel)
            ? preferences?.english_level as EnglishLevel
            : DEFAULT_LEARNING_PREFERENCES.english_level,
        daily_goal_minutes: Number.isFinite(dailyGoal)
            ? Math.min(180, Math.max(10, Math.round(dailyGoal)))
            : DEFAULT_LEARNING_PREFERENCES.daily_goal_minutes,
        ui_theme_preference: UI_THEME_PREFERENCES.has(preferences?.ui_theme_preference as UiThemePreference)
            ? preferences?.ui_theme_preference as UiThemePreference
            : DEFAULT_LEARNING_PREFERENCES.ui_theme_preference,
        tts_voice: normalizeLearningPreferenceTtsVoice(preferences?.tts_voice),
        rebuild_auto_open_shadowing_prompt: typeof preferences?.rebuild_auto_open_shadowing_prompt === "boolean"
            ? preferences.rebuild_auto_open_shadowing_prompt
            : DEFAULT_LEARNING_PREFERENCES.rebuild_auto_open_shadowing_prompt,
    };
}
