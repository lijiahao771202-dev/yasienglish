const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
let worker: Worker | null = null;
let requestCounter = 0;

export type BGEStatus = 'idle' | 'loading' | 'ready' | 'error';
let currentStatus: BGEStatus = 'idle';
let currentError: string | null = null;
const statusListeners = new Set<(status: BGEStatus, error: string | null) => void>();

export function subscribeBGEStatus(listener: (status: BGEStatus, error: string | null) => void) {
    statusListeners.add(listener);
    listener(currentStatus, currentError);
    return () => statusListeners.delete(listener);
}

function updateStatus(status: BGEStatus, error: string | null = null) {
    currentStatus = status;
    currentError = error;
    statusListeners.forEach(listener => listener(status, error));
}

export function initBGEWorker() {
    if (typeof window === 'undefined') return;
    if (worker) return;

    worker = new Worker(new URL('../worker/ai-worker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
        const { id, type, payload } = e.data;
        
        if (type === 'init_ready') {
            updateStatus('ready');
        } else if (type === 'init_error') {
            updateStatus('error', payload);
        } else if (id !== undefined && pendingRequests.has(id)) {
            const { resolve, reject } = pendingRequests.get(id)!;
            if (type.endsWith('_done')) resolve(payload);
            else if (type.endsWith('_error')) reject(new Error(payload));
            pendingRequests.delete(id);
        }
    };

    updateStatus('loading');
    worker.postMessage({ type: 'init', payload: { modelId: 'Xenova/all-MiniLM-L6-v2' } });
}

export function requestPrefixCompletion(input: string, reference: string): Promise<string> {
    if (!worker || currentStatus !== 'ready') return Promise.resolve("");
    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        worker!.postMessage({ id, type: 'predict', payload: { input, reference } });
    });
}

export function requestSemanticGrade(input: string, reference: string): Promise<number> {
    if (!worker || currentStatus !== 'ready') return Promise.reject(new Error("BGE not ready"));
    const id = ++requestCounter;
    return new Promise((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        worker!.postMessage({ id, type: 'grade', payload: { input, reference } });
    });
}
