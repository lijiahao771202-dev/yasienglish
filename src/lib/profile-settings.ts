export type LearningTargetMode = "read" | "battle" | "vocab";
export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type UiThemePreference = "bubblegum_pop" | "starlight_arcade" | "peach_glow";
export type TtsVoice =
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
    | "zh-CN-XiaoxiaoNeural"
    | "zh-CN-XiaoyiNeural"
    | "zh-CN-YunjianNeural"
    | "zh-CN-YunxiNeural"
    | "zh-CN-YunxiaNeural"
    | "zh-CN-YunyangNeural"
    | "zh-CN-XiaobeiNeural"
    | "zh-CN-XiaoniNeural";

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
    tts_voice: TtsVoice;
}

export const DEFAULT_PROFILE_USERNAME = "Yasi Learner";
export const DEFAULT_AVATAR_PRESET = "bubble-bear";
export const DEFAULT_TTS_VOICE: TtsVoice = "en-US-JennyNeural";

export const TTS_VOICE_OPTIONS: TtsVoiceOption[] = [
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

export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
    target_mode: "read",
    english_level: "B1",
    daily_goal_minutes: 20,
    ui_theme_preference: "bubblegum_pop",
    tts_voice: DEFAULT_TTS_VOICE,
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
        tts_voice: normalizeTtsVoice(preferences?.tts_voice),
    };
}
