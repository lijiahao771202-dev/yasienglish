import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VectorEngineState {
    vectorModelId: string;
    setVectorModelId: (modelId: string) => void;
}

export const useVectorEngineStore = create<VectorEngineState>()(
    persist(
        (set) => ({
            vectorModelId: 'Xenova/bge-m3', // Default global model
            setVectorModelId: (modelId) => set({ vectorModelId: modelId }),
        }),
        {
            name: 'vector-engine-storage',
        }
    )
);
