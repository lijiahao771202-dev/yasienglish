import { create } from "zustand";

export type SyncPhase = "idle" | "bootstrapping" | "syncing" | "synced" | "error";

interface SyncStatusState {
    phase: SyncPhase;
    ready: boolean;
    error: string | null;
    setPhase: (phase: SyncPhase, error?: string | null) => void;
    setReady: (ready: boolean) => void;
    reset: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
    phase: "idle",
    ready: false,
    error: null,
    setPhase: (phase, error = null) => set({ phase, error }),
    setReady: (ready) => set({ ready }),
    reset: () => set({ phase: "idle", ready: false, error: null }),
}));
