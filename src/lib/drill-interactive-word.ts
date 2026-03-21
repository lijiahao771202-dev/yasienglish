const ACTIVE_WORD_CLASS = "text-rose-700 bg-rose-100 ring-2 ring-rose-200 shadow-sm scale-110 z-10 font-bold";
const KARAOKE_WORD_CLASS = "text-rose-600 bg-rose-50/80 backdrop-blur-sm font-bold shadow-[0_0_15px_rgba(244,63,94,0.15)] ring-1 ring-rose-100/50 scale-110 z-10";
const IDLE_WORD_CLASS = "text-stone-700";

export function getBattleInteractiveWordClassName(params: {
    isActive: boolean;
    isKaraokeActive: boolean;
    karaokeEnabled?: boolean;
}) {
    if (params.isActive) {
        return ACTIVE_WORD_CLASS;
    }

    if (params.karaokeEnabled && params.isKaraokeActive) {
        return KARAOKE_WORD_CLASS;
    }

    return IDLE_WORD_CLASS;
}
