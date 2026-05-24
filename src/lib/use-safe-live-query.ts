"use client";

import { useLiveQuery } from "dexie-react-hooks";

function formatSafeQueryError(error: unknown, label?: string) {
    if (error instanceof Error) {
        return label ? `[safe-live-query:${label}] ${error.message}` : error.message;
    }

    const message = String(error);
    return label ? `[safe-live-query:${label}] ${message}` : message;
}

export function useSafeLiveQuery<T, TDefault>(
    querier: () => Promise<T> | T,
    deps: unknown[],
    defaultResult: TDefault,
    label?: string,
) {
    return useLiveQuery<T | TDefault, TDefault>(
        () => {
            try {
                const result = querier();
                if (result && typeof (result as PromiseLike<T>).then === "function") {
                    return Promise.resolve(result).catch((error) => {
                        console.error(formatSafeQueryError(error, label), error);
                        return defaultResult as T | TDefault;
                    });
                }
                return result;
            } catch (error) {
                console.error(formatSafeQueryError(error, label), error);
                return defaultResult as T | TDefault;
            }
        },
        deps,
        defaultResult,
    );
}
