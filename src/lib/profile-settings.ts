export type LearningTargetMode = "read" | "battle" | "vocab";
export type EnglishLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type UiThemePreference = "bubblegum_pop" | "starlight_arcade" | "peach_glow";

export interface LearningPreferences {
    target_mode: LearningTargetMode;
    english_level: EnglishLevel;
    daily_goal_minutes: number;
    ui_theme_preference: UiThemePreference;
}

export const DEFAULT_PROFILE_USERNAME = "Yasi Learner";
export const DEFAULT_AVATAR_PRESET = "bubble-bear";
export const DEFAULT_LEARNING_PREFERENCES: LearningPreferences = {
    target_mode: "read",
    english_level: "B1",
    daily_goal_minutes: 20,
    ui_theme_preference: "bubblegum_pop",
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
    };
}
