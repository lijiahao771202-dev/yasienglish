import {
    db,
    type CachedArticle,
    type DailyPlanItem,
    type DailyPlanRecord,
    type EloHistoryItem,
    type InventoryState,
    type LocalUserProfile,
    type ReadingNoteItem,
    type ReadArticleItem,
    type SyncStatus,
    type VocabSourceKind,
    type VocabItem,
    type WritingEntry,
    inferSmartPlanExamTrack,
    normalizeSmartPlanExamTrack,
    normalizeSmartPlanTaskType,
} from "./db";
import {
    normalizeHighlightedMeanings,
    normalizeMorphologyNotes,
    normalizeWordBreakdown,
    type MeaningGroup,
} from "./vocab-meanings";
import {
    applyTranslationEloReset,
    DEFAULT_TRANSLATION_ELO,
} from "./translation-elo-reset";
import {
    type AiProvider,
    DEFAULT_GLM_MODEL,
    DEFAULT_GLM_THINKING_MODE,
    DEFAULT_DEEPSEEK_MODEL,
    DEFAULT_DEEPSEEK_REASONING_EFFORT,
    DEFAULT_DEEPSEEK_THINKING_MODE,
    DEFAULT_AVATAR_PRESET,
    DEFAULT_LEARNING_PREFERENCES,
    DEFAULT_PROFILE_USERNAME,
    type LearningPreferences,
    normalizeAiProvider,
    normalizeAvatarPreset,
    normalizeProfileGlmApiKey,
    normalizeProfileGithubApiKey,
    normalizeProfileGithubModel,
    normalizeProfileNvidiaApiKey,
    normalizeProfileNvidiaModel,
    normalizeProfileDeepSeekApiKey,
    normalizeProfileDeepSeekModel,
    normalizeProfileDeepSeekReasoningEffort,
    normalizeProfileDeepSeekThinkingMode,
    normalizeLearningPreferences,
    normalizeProfileBio,
    normalizeProfileUsername,
} from "./profile-settings";

export {
    normalizeAiProvider,
    DEFAULT_AVATAR_PRESET,
    DEFAULT_DEEPSEEK_MODEL,
    DEFAULT_DEEPSEEK_REASONING_EFFORT,
    DEFAULT_DEEPSEEK_THINKING_MODE,
    DEFAULT_GLM_MODEL,
    DEFAULT_GLM_THINKING_MODE,
    DEFAULT_LEARNING_PREFERENCES,
    DEFAULT_PROFILE_USERNAME,
    normalizeAvatarPreset,
    normalizeProfileGlmApiKey,
    normalizeProfileGithubApiKey,
    normalizeProfileGithubModel,
    normalizeProfileNvidiaApiKey,
    normalizeProfileNvidiaModel,
    normalizeProfileDeepSeekApiKey,
    normalizeProfileDeepSeekModel,
    normalizeProfileDeepSeekReasoningEffort,
    normalizeProfileDeepSeekThinkingMode,
    normalizeLearningPreferences,
    normalizeProfileBio,
    normalizeProfileUsername,
} from "./profile-settings";

export {
    normalizeProfileGlmModel,
    normalizeProfileGlmThinkingMode,
} from "./profile-settings";

export {
    applyTranslationEloReset,
    DEFAULT_TRANSLATION_ELO,
} from "./translation-elo-reset";

export interface RemoteProfileRow {
    user_id: string;
    translation_elo: number;
    listening_elo: number;
    rebuild_hidden_elo?: number;
    rebuild_elo?: number;
    dictation_elo?: number;
    streak_count: number;
    listening_streak?: number;
    rebuild_streak?: number;
    dictation_streak?: number;
    max_translation_elo: number;
    max_listening_elo: number;
    rebuild_max_elo?: number;
    dictation_max_elo?: number;
    coins: number;
    inventory: InventoryState;
    owned_themes: string[];
    active_theme: string;
    username?: string;
    avatar_preset?: string;
    bio?: string;
    ai_provider?: AiProvider;
    deepseek_api_key?: string;
    deepseek_model?: string;
    deepseek_thinking_mode?: "off" | "on";
    deepseek_reasoning_effort?: "high" | "max";
    glm_api_key?: string;
    nvidia_api_key?: string;
    nvidia_model?: string;
    github_api_key?: string;
    github_model?: string;
    learning_preferences?: LearningPreferences;
    reading_coins?: number;
    reading_streak?: number;
    reading_last_daily_grant_at?: string | null;
    cat_score?: number;
    cat_level?: number;
    cat_theta?: number;
    cat_se?: number;
    cat_points?: number;
    cat_current_band?: number;
    cat_updated_at?: string | null;
    exam_date?: string | null;
    exam_type?: string | null;
    exam_goal_score?: number | null;
    daily_plan_snapshots?: DailyPlanRecord[] | null;
    updated_at: string;
    last_practice_at: string;
}

export interface RemoteDailyPlanRow {
    user_id: string;
    date: string;
    items: DailyPlanItem[];
    updated_at: string;
    created_at?: string;
}

const MAX_DAILY_PLAN_SNAPSHOTS = 90;

function normalizeDailyPlanItems(input: unknown): DailyPlanItem[] {
    if (!Array.isArray(input)) {
        return [];
    }

    return input
        .map((item) => {
            if (!item || typeof item !== "object") {
                return null;
            }

            const rawItem = item as Record<string, unknown>;
            const id = typeof rawItem.id === "string" ? rawItem.id.trim() : "";
            const text = typeof rawItem.text === "string" ? rawItem.text.trim() : "";

            if (!id || !text) {
                return null;
            }

            const type = normalizeSmartPlanTaskType(rawItem.type);
            const examTrack = normalizeSmartPlanExamTrack(rawItem.exam_track)
                ?? ((type === "cat" || type === "reading_ai") ? inferSmartPlanExamTrack(text) : undefined);
            const target = typeof rawItem.target === "number" && Number.isFinite(rawItem.target) ? rawItem.target : undefined;
            const current = typeof rawItem.current === "number" && Number.isFinite(rawItem.current) ? rawItem.current : undefined;
            const chunkSize = typeof rawItem.chunk_size === "number" && Number.isFinite(rawItem.chunk_size) ? rawItem.chunk_size : undefined;
            const source = typeof rawItem.source === "string" ? rawItem.source : undefined;

            return {
                id,
                text,
                completed: Boolean(rawItem.completed),
                ...(type ? { type } : {}),
                ...(examTrack ? { exam_track: examTrack } : {}),
                ...(target !== undefined ? { target } : {}),
                ...(current !== undefined ? { current } : {}),
                ...(chunkSize !== undefined ? { chunk_size: chunkSize } : {}),
                ...(source ? { source } : {}),
            };
        })
        .filter((item): item is DailyPlanItem => Boolean(item));
}

function normalizeDailyPlanSnapshots(input: unknown): DailyPlanRecord[] {
    if (!Array.isArray(input)) {
        return [];
    }

    return input
        .map((record) => {
            if (!record || typeof record !== "object") {
                return null;
            }

            const raw = record as Record<string, unknown>;
            const date = typeof raw.date === "string" ? raw.date.trim() : "";
            const updatedAt = Number(raw.updated_at);
            const rawItems = Array.isArray(raw.items) ? raw.items : [];

            if (!date) {
                return null;
            }

            const items = normalizeDailyPlanItems(rawItems);

            return {
                date,
                items,
                updated_at: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
            };
        })
        .filter((record): record is DailyPlanRecord => Boolean(record))
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, MAX_DAILY_PLAN_SNAPSHOTS);
}

export function toRemoteDailyPlanRow(userId: string, record: DailyPlanRecord): RemoteDailyPlanRow {
    return {
        user_id: userId,
        date: record.date,
        items: normalizeDailyPlanItems(record.items),
        updated_at: new Date(record.updated_at).toISOString(),
    };
}

export function toLocalDailyPlanRecord(remote: RemoteDailyPlanRow): DailyPlanRecord {
    const updatedAt = Date.parse(remote.updated_at);
    return {
        date: remote.date,
        items: normalizeDailyPlanItems(remote.items),
        updated_at: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    };
}

export interface RemoteVocabularyRow {
    id?: string;
    user_id: string;
    word: string;
    word_key: string;
    definition: string;
    translation: string;
    context: string;
    example: string;
    phonetic?: string;
    meaning_groups?: MeaningGroup[];
    highlighted_meanings?: string[];
    word_breakdown?: string[];
    morphology_notes?: string[];
    source_kind?: VocabSourceKind;
    source_label?: string;
    source_sentence?: string;
    source_note?: string;
    timestamp_ms: number;
    stability: number;
    difficulty: number;
    elapsed_days: number;
    scheduled_days: number;
    reps: number;
    lapses: number;
    learning_steps: number;
    state: number;
    last_review_ms: number;
    due_ms: number;
    archived_at_ms?: number | null;
    created_at?: string;
    updated_at: string;
}

export interface RemoteWritingHistoryRow {
    id: string;
    user_id: string;
    article_title: string;
    content: string;
    score: number;
    timestamp_ms: number;
    created_at?: string;
    updated_at: string;
}

export interface RemoteReadArticleRow {
    id: string;
    user_id: string;
    url: string;
    read_at: string;
    timestamp_ms: number;
    article_key?: string | null;
    article_title?: string | null;
    article_payload?: CachedArticle | null;
    reading_notes_payload?: Array<Omit<ReadingNoteItem, "id">> | null;
    grammar_payload?: Array<{
        key: string;
        data: unknown;
        timestamp: number;
    }> | null;
    ask_payload?: Array<{
        key: string;
        data: unknown;
        timestamp: number;
    }> | null;
    updated_at: string;
}

export interface RemoteEloHistoryRow {
    id: string;
    user_id: string;
    mode: "translation" | "listening" | "rebuild" | "dictation";
    elo: number;
    change: number;
    timestamp_ms: number;
    source: string;
    created_at?: string;
    updated_at: string;
}

export interface RemoteErrorLedgerRow {
    id: string;
    user_id: string;
    text: string;
    tag?: string;
    created_at: number;
    updated_at: string;
}

export const DEFAULT_BASE_ELO = 400;
export const DEFAULT_STARTING_COINS = 500;
export const DEFAULT_FREE_THEME = "morning_coffee";
export const DEFAULT_READING_COINS = 40;
export const DEFAULT_CAT_SCORE = 1000;
export const DEFAULT_CAT_LEVEL = 1;
export const DEFAULT_CAT_THETA = 0;
export const DEFAULT_CAT_SE = 1.15;
export const DEFAULT_CAT_POINTS = 0;
export const DEFAULT_CAT_BAND = 3;
export const DEFAULT_INVENTORY: Required<InventoryState> = {
    capsule: 10,
    hint_ticket: 10,
    vocab_ticket: 10,
    audio_ticket: 10,
    refresh_ticket: 10,
};

export function normalizeWordKey(word: string) {
    return word.trim().toLowerCase();
}

export function normalizeVocabSourceKind(value?: string | null): VocabSourceKind {
    switch (value) {
        case "manual":
        case "read":
        case "rebuild":
        case "translation":
        case "listening":
        case "dictation":
        case "legacy_local":
            return value;
        default:
            return "legacy_local";
    }
}

export function defaultVocabSourceLabel(kind?: VocabSourceKind) {
    switch (kind) {
        case "manual":
            return "手动添加";
        case "read":
            return "来自 Read";
        case "rebuild":
            return "来自 Rebuild";
        case "translation":
            return "来自 Translation";
        case "listening":
            return "来自 Listening";
        case "dictation":
            return "来自 Dictation";
        case "legacy_local":
        default:
            return "本地旧卡片";
    }
}

export function normalizeInventory(inventory?: InventoryState, legacyCapsule?: number) {
    return {
        capsule: typeof inventory?.capsule === "number" ? inventory.capsule : (legacyCapsule ?? DEFAULT_INVENTORY.capsule),
        hint_ticket: typeof inventory?.hint_ticket === "number" ? inventory.hint_ticket : DEFAULT_INVENTORY.hint_ticket,
        vocab_ticket: typeof inventory?.vocab_ticket === "number" ? inventory.vocab_ticket : DEFAULT_INVENTORY.vocab_ticket,
        audio_ticket: typeof inventory?.audio_ticket === "number" ? inventory.audio_ticket : DEFAULT_INVENTORY.audio_ticket,
        refresh_ticket: typeof inventory?.refresh_ticket === "number" ? inventory.refresh_ticket : DEFAULT_INVENTORY.refresh_ticket,
    };
}

export function createDefaultLocalProfile(userId: string): LocalUserProfile {
    const inventory = normalizeInventory();
    const now = Date.now();

    return applyTranslationEloReset({
        user_id: userId,
        elo_rating: DEFAULT_TRANSLATION_ELO,
        streak_count: 0,
        max_elo: DEFAULT_TRANSLATION_ELO,
        last_practice: now,
        listening_scoring_version: 2,
        listening_elo: DEFAULT_BASE_ELO,
        rebuild_hidden_elo: DEFAULT_BASE_ELO,
        rebuild_elo: DEFAULT_BASE_ELO,
        rebuild_streak: 0,
        rebuild_max_elo: DEFAULT_BASE_ELO,
        listening_streak: 0,
        listening_max_elo: DEFAULT_BASE_ELO,
        dictation_elo: DEFAULT_BASE_ELO,
        dictation_streak: 0,
        dictation_max_elo: DEFAULT_BASE_ELO,
        coins: DEFAULT_STARTING_COINS,
        hints: inventory.capsule,
        inventory,
        owned_themes: [DEFAULT_FREE_THEME],
        active_theme: DEFAULT_FREE_THEME,
        username: DEFAULT_PROFILE_USERNAME,
        avatar_preset: DEFAULT_AVATAR_PRESET,
        bio: "",
        ai_provider: "deepseek",
        deepseek_api_key: "",
        deepseek_model: DEFAULT_DEEPSEEK_MODEL,
        deepseek_thinking_mode: DEFAULT_DEEPSEEK_THINKING_MODE,
        deepseek_reasoning_effort: DEFAULT_DEEPSEEK_REASONING_EFFORT,
        glm_api_key: "",
        glm_model: DEFAULT_GLM_MODEL,
        glm_thinking_mode: DEFAULT_GLM_THINKING_MODE,
        nvidia_api_key: "",
        nvidia_model: normalizeProfileNvidiaModel(undefined),
        github_api_key: "",
        github_model: normalizeProfileGithubModel(undefined),
        learning_preferences: DEFAULT_LEARNING_PREFERENCES,
        reading_coins: DEFAULT_READING_COINS,
        reading_streak: 0,
        reading_last_daily_grant_at: null,
        cat_score: DEFAULT_CAT_SCORE,
        cat_level: DEFAULT_CAT_LEVEL,
        cat_theta: DEFAULT_CAT_THETA,
        cat_se: DEFAULT_CAT_SE,
        cat_points: DEFAULT_CAT_POINTS,
        cat_current_band: DEFAULT_CAT_BAND,
        cat_updated_at: new Date(now).toISOString(),
        exam_date: undefined,
        exam_type: undefined,
        exam_goal_score: undefined,
        daily_plan_snapshots: [],
        updated_at: new Date(now).toISOString(),
        sync_status: "pending",
    });
}

export function toLocalProfile(remote: RemoteProfileRow): LocalUserProfile {
    const inventory = normalizeInventory(remote.inventory);
    const dictationElo = typeof remote.dictation_elo === "number" ? remote.dictation_elo : remote.listening_elo;
    const dictationStreak = typeof remote.dictation_streak === "number" ? remote.dictation_streak : remote.listening_streak ?? 0;
    const dictationMaxElo = typeof remote.dictation_max_elo === "number" ? remote.dictation_max_elo : remote.max_listening_elo;
    const examType = remote.exam_type === "cet4" || remote.exam_type === "cet6" || remote.exam_type === "postgrad" || remote.exam_type === "ielts"
        ? remote.exam_type
        : undefined;

    return {
        user_id: remote.user_id,
        remote_id: remote.user_id,
        elo_rating: remote.translation_elo,
        streak_count: remote.streak_count,
        max_elo: remote.max_translation_elo,
        last_practice: Date.parse(remote.last_practice_at),
        listening_scoring_version: 0,
        listening_elo: remote.listening_elo,
        rebuild_hidden_elo: typeof remote.rebuild_hidden_elo === "number" ? remote.rebuild_hidden_elo : remote.listening_elo,
        rebuild_elo: typeof remote.rebuild_elo === "number"
            ? remote.rebuild_elo
            : (typeof remote.rebuild_hidden_elo === "number" ? remote.rebuild_hidden_elo : remote.listening_elo),
        rebuild_streak: remote.rebuild_streak ?? 0,
        rebuild_max_elo: typeof remote.rebuild_max_elo === "number"
            ? remote.rebuild_max_elo
            : (typeof remote.rebuild_elo === "number"
                ? remote.rebuild_elo
                : (typeof remote.rebuild_hidden_elo === "number" ? remote.rebuild_hidden_elo : remote.listening_elo)),
        listening_streak: remote.listening_streak ?? 0,
        listening_max_elo: remote.max_listening_elo,
        dictation_elo: dictationElo,
        dictation_streak: dictationStreak,
        dictation_max_elo: dictationMaxElo,
        coins: remote.coins,
        hints: inventory.capsule,
        inventory,
        owned_themes: remote.owned_themes,
        active_theme: remote.active_theme,
        username: normalizeProfileUsername(remote.username),
        avatar_preset: normalizeAvatarPreset(remote.avatar_preset),
        bio: normalizeProfileBio(remote.bio),
        ai_provider: normalizeAiProvider(remote.ai_provider),
        deepseek_api_key: normalizeProfileDeepSeekApiKey(remote.deepseek_api_key),
        deepseek_model: normalizeProfileDeepSeekModel(remote.deepseek_model),
        deepseek_thinking_mode: normalizeProfileDeepSeekThinkingMode(remote.deepseek_thinking_mode),
        deepseek_reasoning_effort: normalizeProfileDeepSeekReasoningEffort(remote.deepseek_reasoning_effort),
        glm_api_key: normalizeProfileGlmApiKey(remote.glm_api_key),
        glm_model: DEFAULT_GLM_MODEL,
        glm_thinking_mode: DEFAULT_GLM_THINKING_MODE,
        nvidia_api_key: normalizeProfileNvidiaApiKey(remote.nvidia_api_key),
        nvidia_model: normalizeProfileNvidiaModel(remote.nvidia_model),
        github_api_key: normalizeProfileGithubApiKey(remote.github_api_key),
        github_model: normalizeProfileGithubModel(remote.github_model),
        learning_preferences: normalizeLearningPreferences(remote.learning_preferences),
        reading_coins: typeof remote.reading_coins === "number" ? remote.reading_coins : DEFAULT_READING_COINS,
        reading_streak: typeof remote.reading_streak === "number" ? remote.reading_streak : 0,
        reading_last_daily_grant_at: remote.reading_last_daily_grant_at || null,
        cat_score: typeof remote.cat_score === "number" ? remote.cat_score : DEFAULT_CAT_SCORE,
        cat_level: typeof remote.cat_level === "number" ? remote.cat_level : DEFAULT_CAT_LEVEL,
        cat_theta: typeof remote.cat_theta === "number" ? remote.cat_theta : DEFAULT_CAT_THETA,
        cat_se: typeof remote.cat_se === "number" ? remote.cat_se : DEFAULT_CAT_SE,
        cat_points: typeof remote.cat_points === "number" ? remote.cat_points : DEFAULT_CAT_POINTS,
        cat_current_band: typeof remote.cat_current_band === "number" ? remote.cat_current_band : DEFAULT_CAT_BAND,
        cat_updated_at: remote.cat_updated_at || remote.updated_at,
        exam_date: remote.exam_date || undefined,
        exam_type: examType,
        exam_goal_score: typeof remote.exam_goal_score === "number" ? remote.exam_goal_score : undefined,
        daily_plan_snapshots: normalizeDailyPlanSnapshots(remote.daily_plan_snapshots),
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function buildProfilePatch(
    patch: Partial<
        Pick<
            LocalUserProfile,
            "coins" | "inventory" | "owned_themes" | "active_theme" | "username" | "avatar_preset" | "bio" | "learning_preferences"
            | "ai_provider" | "deepseek_api_key" | "deepseek_model" | "deepseek_thinking_mode" | "deepseek_reasoning_effort" | "glm_api_key" | "nvidia_api_key" | "nvidia_model" | "github_api_key" | "github_model" | "reading_coins" | "reading_streak" | "reading_last_daily_grant_at"
            | "cat_score" | "cat_level" | "cat_theta" | "cat_points" | "cat_current_band" | "cat_updated_at"
            | "cat_se" | "dictation_elo" | "dictation_streak" | "dictation_max_elo"
            | "rebuild_hidden_elo" | "rebuild_elo" | "rebuild_streak" | "rebuild_max_elo"
            | "exam_date" | "exam_type" | "exam_goal_score" | "daily_plan_snapshots"
        >
    > & {
        last_practice_at?: string | number | null;
    },
) {
    const nextPatch: Record<string, unknown> = {};

    if (patch.coins !== undefined) nextPatch.coins = patch.coins;
    if (patch.inventory !== undefined) nextPatch.inventory = patch.inventory;
    if (patch.owned_themes !== undefined) nextPatch.owned_themes = patch.owned_themes;
    if (patch.active_theme !== undefined) nextPatch.active_theme = patch.active_theme;
    if (patch.username !== undefined) nextPatch.username = normalizeProfileUsername(patch.username);
    if (patch.avatar_preset !== undefined) nextPatch.avatar_preset = normalizeAvatarPreset(patch.avatar_preset);
    if (patch.bio !== undefined) nextPatch.bio = normalizeProfileBio(patch.bio);
    if (patch.ai_provider !== undefined) nextPatch.ai_provider = normalizeAiProvider(patch.ai_provider);
    if (patch.deepseek_api_key !== undefined) nextPatch.deepseek_api_key = normalizeProfileDeepSeekApiKey(patch.deepseek_api_key);
    if (patch.deepseek_model !== undefined) nextPatch.deepseek_model = normalizeProfileDeepSeekModel(patch.deepseek_model);
    if (patch.deepseek_thinking_mode !== undefined) nextPatch.deepseek_thinking_mode = normalizeProfileDeepSeekThinkingMode(patch.deepseek_thinking_mode);
    if (patch.deepseek_reasoning_effort !== undefined) nextPatch.deepseek_reasoning_effort = normalizeProfileDeepSeekReasoningEffort(patch.deepseek_reasoning_effort);
    if (patch.glm_api_key !== undefined) nextPatch.glm_api_key = normalizeProfileGlmApiKey(patch.glm_api_key);
    if (patch.nvidia_api_key !== undefined) nextPatch.nvidia_api_key = normalizeProfileNvidiaApiKey(patch.nvidia_api_key);
    if (patch.nvidia_model !== undefined) nextPatch.nvidia_model = normalizeProfileNvidiaModel(patch.nvidia_model);
    if (patch.github_api_key !== undefined) nextPatch.github_api_key = normalizeProfileGithubApiKey(patch.github_api_key);
    if (patch.github_model !== undefined) nextPatch.github_model = normalizeProfileGithubModel(patch.github_model);
    if (patch.learning_preferences !== undefined) {
        nextPatch.learning_preferences = normalizeLearningPreferences(patch.learning_preferences);
    }
    if (patch.reading_coins !== undefined) nextPatch.reading_coins = patch.reading_coins;
    if (patch.reading_streak !== undefined) nextPatch.reading_streak = patch.reading_streak;
    if (patch.reading_last_daily_grant_at !== undefined) {
        nextPatch.reading_last_daily_grant_at = patch.reading_last_daily_grant_at || null;
    }
    if (patch.cat_score !== undefined) nextPatch.cat_score = patch.cat_score;
    if (patch.cat_level !== undefined) nextPatch.cat_level = patch.cat_level;
    if (patch.cat_theta !== undefined) nextPatch.cat_theta = patch.cat_theta;
    if (patch.cat_se !== undefined) nextPatch.cat_se = patch.cat_se;
    if (patch.cat_points !== undefined) nextPatch.cat_points = patch.cat_points;
    if (patch.cat_current_band !== undefined) nextPatch.cat_current_band = patch.cat_current_band;
    if (patch.cat_updated_at !== undefined) {
        nextPatch.cat_updated_at = patch.cat_updated_at ? new Date(patch.cat_updated_at).toISOString() : null;
    }
    if (patch.dictation_elo !== undefined) nextPatch.dictation_elo = patch.dictation_elo;
    if (patch.dictation_streak !== undefined) nextPatch.dictation_streak = patch.dictation_streak;
    if (patch.dictation_max_elo !== undefined) nextPatch.dictation_max_elo = patch.dictation_max_elo;
    if (patch.rebuild_hidden_elo !== undefined) nextPatch.rebuild_hidden_elo = patch.rebuild_hidden_elo;
    if (patch.rebuild_elo !== undefined) nextPatch.rebuild_elo = patch.rebuild_elo;
    if (patch.rebuild_streak !== undefined) nextPatch.rebuild_streak = patch.rebuild_streak;
    if (patch.rebuild_max_elo !== undefined) nextPatch.rebuild_max_elo = patch.rebuild_max_elo;
    if (patch.exam_date !== undefined) nextPatch.exam_date = patch.exam_date || null;
    if (patch.exam_type !== undefined) nextPatch.exam_type = patch.exam_type || null;
    if (patch.exam_goal_score !== undefined) nextPatch.exam_goal_score = patch.exam_goal_score ?? null;
    if (patch.daily_plan_snapshots !== undefined) {
        nextPatch.daily_plan_snapshots = normalizeDailyPlanSnapshots(patch.daily_plan_snapshots);
    }
    if (patch.last_practice_at !== undefined && patch.last_practice_at !== null) {
        nextPatch.last_practice_at = new Date(patch.last_practice_at).toISOString();
    }

    return nextPatch;
}

export function createLocalVocabularyItem(userId: string, item: VocabItem): VocabItem {
    const sourceKind = normalizeVocabSourceKind(item.source_kind);
    const sourceSentence = item.source_sentence?.trim() || item.context?.trim() || "";
    return {
        ...item,
        user_id: userId,
        word_key: normalizeWordKey(item.word),
        phonetic: item.phonetic?.trim() || "",
        meaning_groups: Array.isArray(item.meaning_groups) ? item.meaning_groups : [],
        highlighted_meanings: normalizeHighlightedMeanings(item.highlighted_meanings),
        word_breakdown: normalizeWordBreakdown(item.word_breakdown),
        morphology_notes: normalizeMorphologyNotes(item.morphology_notes),
        source_kind: sourceKind,
        source_label: item.source_label?.trim() || defaultVocabSourceLabel(sourceKind),
        source_sentence: sourceSentence,
        source_note: item.source_note?.trim() || "",
        lapses: item.lapses ?? 0,
        learning_steps: item.learning_steps ?? 0,
        archived_at: typeof item.archived_at === "number" ? item.archived_at : undefined,
        updated_at: new Date().toISOString(),
        sync_status: "pending",
    };
}

export function toRemoteVocabularyRow(userId: string, item: VocabItem): RemoteVocabularyRow {
    return {
        id: item.remote_id,
        user_id: userId,
        word: item.word,
        word_key: item.word_key || normalizeWordKey(item.word),
        definition: item.definition,
        translation: item.translation,
        context: item.context,
        example: item.example,
        phonetic: item.phonetic,
        meaning_groups: item.meaning_groups,
        highlighted_meanings: normalizeHighlightedMeanings(item.highlighted_meanings),
        word_breakdown: normalizeWordBreakdown(item.word_breakdown),
        morphology_notes: normalizeMorphologyNotes(item.morphology_notes),
        source_kind: item.source_kind,
        source_label: item.source_label,
        source_sentence: item.source_sentence,
        source_note: item.source_note,
        timestamp_ms: item.timestamp,
        stability: item.stability,
        difficulty: item.difficulty,
        elapsed_days: item.elapsed_days,
        scheduled_days: item.scheduled_days,
        reps: item.reps,
        lapses: item.lapses,
        learning_steps: item.learning_steps,
        state: item.state,
        last_review_ms: item.last_review,
        due_ms: item.due,
        archived_at_ms: item.archived_at ?? null,
        updated_at: item.updated_at || new Date().toISOString(),
    };
}

export function toLocalVocabularyItem(remote: RemoteVocabularyRow): VocabItem {
    const sourceKind = normalizeVocabSourceKind(remote.source_kind);
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        word: remote.word,
        word_key: remote.word_key,
        definition: remote.definition,
        translation: remote.translation,
        context: remote.context,
        example: remote.example,
        phonetic: remote.phonetic || "",
        meaning_groups: Array.isArray(remote.meaning_groups) ? remote.meaning_groups : [],
        highlighted_meanings: normalizeHighlightedMeanings(remote.highlighted_meanings),
        word_breakdown: normalizeWordBreakdown(remote.word_breakdown),
        morphology_notes: normalizeMorphologyNotes(remote.morphology_notes),
        source_kind: sourceKind,
        source_label: remote.source_label || defaultVocabSourceLabel(sourceKind),
        source_sentence: remote.source_sentence || remote.context || "",
        source_note: remote.source_note || "",
        timestamp: remote.timestamp_ms,
        stability: remote.stability,
        difficulty: remote.difficulty,
        elapsed_days: remote.elapsed_days,
        scheduled_days: remote.scheduled_days,
        reps: remote.reps,
        lapses: remote.lapses ?? 0,
        learning_steps: remote.learning_steps ?? 0,
        state: remote.state,
        last_review: remote.last_review_ms,
        due: remote.due_ms,
        archived_at: typeof remote.archived_at_ms === "number" ? remote.archived_at_ms : undefined,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function toRemoteWritingEntry(userId: string, entry: WritingEntry): RemoteWritingHistoryRow {
    return {
        id: entry.remote_id || crypto.randomUUID(),
        user_id: userId,
        article_title: entry.articleTitle,
        content: entry.content,
        score: entry.score,
        timestamp_ms: entry.timestamp,
        updated_at: entry.updated_at || new Date().toISOString(),
    };
}

export function toLocalWritingEntry(remote: RemoteWritingHistoryRow): WritingEntry {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        articleTitle: remote.article_title,
        content: remote.content,
        score: remote.score,
        timestamp: remote.timestamp_ms,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function toRemoteReadArticle(userId: string, item: ReadArticleItem): RemoteReadArticleRow {
    return {
        id: item.remote_id || crypto.randomUUID(),
        user_id: userId,
        url: item.url,
        read_at: new Date(item.read_at || item.timestamp).toISOString(),
        timestamp_ms: item.timestamp,
        article_key: item.article_key || null,
        article_title: item.article_title || null,
        article_payload: item.article_payload || null,
        reading_notes_payload: item.reading_notes_payload || null,
        grammar_payload: item.grammar_payload || null,
        ask_payload: item.ask_payload || null,
        updated_at: item.updated_at || new Date().toISOString(),
    };
}

export function toLocalReadArticle(remote: RemoteReadArticleRow): ReadArticleItem {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        url: remote.url,
        timestamp: remote.timestamp_ms,
        read_at: Date.parse(remote.read_at),
        article_key: remote.article_key || undefined,
        article_title: remote.article_title || undefined,
        article_payload: remote.article_payload || undefined,
        reading_notes_payload: remote.reading_notes_payload || undefined,
        grammar_payload: remote.grammar_payload || undefined,
        ask_payload: remote.ask_payload || undefined,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function toRemoteEloHistoryRow(userId: string, item: EloHistoryItem): RemoteEloHistoryRow {
    return {
        id: item.remote_id || crypto.randomUUID(),
        user_id: userId,
        mode: item.mode,
        elo: item.elo,
        change: item.change,
        timestamp_ms: item.timestamp,
        source: item.source || "battle",
        updated_at: item.updated_at || new Date().toISOString(),
    };
}

export function toLocalEloHistoryItem(remote: RemoteEloHistoryRow): EloHistoryItem {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        mode: remote.mode,
        elo: remote.elo,
        change: remote.change,
        timestamp: remote.timestamp_ms,
        source: remote.source,
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export function toRemoteErrorLedgerRow(userId: string, item: import("./db").ErrorLedgerItem): RemoteErrorLedgerRow {
    return {
        id: item.remote_id || crypto.randomUUID(),
        user_id: userId,
        text: item.text,
        tag: item.tag,
        created_at: item.created_at,
        updated_at: item.updated_at || new Date().toISOString(),
    };
}

export function toLocalErrorLedgerItem(remote: RemoteErrorLedgerRow): import("./db").ErrorLedgerItem {
    return {
        remote_id: remote.id,
        user_id: remote.user_id,
        text: remote.text,
        tag: remote.tag,
        created_at: Number(remote.created_at),
        updated_at: remote.updated_at,
        sync_status: "synced",
    };
}

export async function replaceLocalCoreData({
    profile,
    vocabulary,
}: {
    profile: LocalUserProfile;
    vocabulary: VocabItem[];
}) {
    await db.transaction("rw", db.user_profile, db.vocabulary, async () => {
        await db.user_profile.clear();
        await db.vocabulary.clear();
        await db.user_profile.add(profile);
        if (vocabulary.length > 0) {
            await db.vocabulary.bulkPut(vocabulary);
        }
    });
}

export async function upsertLocalProfile(
    profile: LocalUserProfile,
    syncStatus: SyncStatus = "pending",
) {
    const existing = await db.user_profile.orderBy("id").first();
    const nextProfile = {
        ...existing,
        ...profile,
        updated_at: profile.updated_at || new Date().toISOString(),
        sync_status: syncStatus,
    };

    if (existing?.id) {
        await db.user_profile.put({
            ...nextProfile,
            id: existing.id,
        });
        return;
    }

    await db.user_profile.add(nextProfile);
}
