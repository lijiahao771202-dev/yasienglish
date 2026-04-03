export type RebuildShadowingScope =
    | { kind: "sentence" }
    | { kind: "segment"; segmentIndex: number };

export interface RebuildShadowingEntry<TAudio = unknown, TResult = unknown> {
    wavBlob: TAudio | null;
    result: TResult | null;
    submitError: string | null;
    updatedAt: number;
}

export interface RebuildShadowingState<TAudio = unknown, TResult = unknown> {
    sentence: RebuildShadowingEntry<TAudio, TResult>;
    bySegment: Record<number, RebuildShadowingEntry<TAudio, TResult>>;
}

export const REBUILD_SHADOWING_AFFECTS_ELO = false;

export function createRebuildShadowingEntry<TAudio = unknown, TResult = unknown>(
    timestamp = 0,
): RebuildShadowingEntry<TAudio, TResult> {
    return {
        wavBlob: null,
        result: null,
        submitError: null,
        updatedAt: timestamp,
    };
}

export function createRebuildShadowingState<TAudio = unknown, TResult = unknown>() : RebuildShadowingState<TAudio, TResult> {
    return {
        sentence: createRebuildShadowingEntry<TAudio, TResult>(),
        bySegment: {},
    };
}

export function getRebuildShadowingEntry<TAudio = unknown, TResult = unknown>(
    state: RebuildShadowingState<TAudio, TResult>,
    scope: RebuildShadowingScope,
) {
    if (scope.kind === "sentence") {
        return state.sentence;
    }

    return state.bySegment[scope.segmentIndex] ?? createRebuildShadowingEntry<TAudio, TResult>();
}

export function upsertRebuildShadowingEntry<TAudio = unknown, TResult = unknown>(
    state: RebuildShadowingState<TAudio, TResult>,
    scope: RebuildShadowingScope,
    patch: Partial<RebuildShadowingEntry<TAudio, TResult>>,
    now = Date.now(),
) {
    if (scope.kind === "sentence") {
        return {
            ...state,
            sentence: {
                ...state.sentence,
                ...patch,
                updatedAt: now,
            },
        };
    }

    const previousSegment = state.bySegment[scope.segmentIndex] ?? createRebuildShadowingEntry<TAudio, TResult>();
    return {
        ...state,
        bySegment: {
            ...state.bySegment,
            [scope.segmentIndex]: {
                ...previousSegment,
                ...patch,
                updatedAt: now,
            },
        },
    };
}
