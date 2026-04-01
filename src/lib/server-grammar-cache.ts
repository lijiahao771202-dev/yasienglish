const DEFAULT_TTL_MS = 1000 * 60 * 30;

interface GrammarCacheEntry {
    expiresAt: number;
    payload: unknown;
}

const globalForGrammarCache = globalThis as typeof globalThis & {
    __yasiGrammarServerCache?: Map<string, GrammarCacheEntry>;
};

function getCacheMap() {
    if (!globalForGrammarCache.__yasiGrammarServerCache) {
        globalForGrammarCache.__yasiGrammarServerCache = new Map<string, GrammarCacheEntry>();
    }
    return globalForGrammarCache.__yasiGrammarServerCache;
}

export function getServerGrammarCache<T>(key: string): T | null {
    const cache = getCacheMap();
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.payload as T;
}

export function setServerGrammarCache<T>(key: string, payload: T, ttlMs = DEFAULT_TTL_MS) {
    const cache = getCacheMap();
    cache.set(key, {
        payload,
        expiresAt: Date.now() + Math.max(1, ttlMs),
    });

    if (cache.size > 800) {
        const firstKey = cache.keys().next().value;
        if (typeof firstKey === "string") cache.delete(firstKey);
    }
}
