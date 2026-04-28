export const DEFAULT_TRANSLATION_ELO = 200;

type TranslationEloShape = {
    elo_rating: number;
    max_elo: number;
};

export function applyTranslationEloReset<T extends TranslationEloShape>(profile: T): T {
    profile.elo_rating = DEFAULT_TRANSLATION_ELO;
    profile.max_elo = DEFAULT_TRANSLATION_ELO;
    return profile;
}
