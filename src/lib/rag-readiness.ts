export type EnsureRagReady = () => Promise<boolean>;

export function waitForRagReady(ensureReady: EnsureRagReady, timeoutMs = 4500): Promise<boolean> {
    if (timeoutMs <= 0) {
        return ensureReady().catch(() => false);
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<boolean>((resolve) => {
        timeoutId = setTimeout(() => resolve(false), timeoutMs);
    });

    return Promise.race([
        ensureReady().catch(() => false),
        timeout,
    ]).finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
    });
}
