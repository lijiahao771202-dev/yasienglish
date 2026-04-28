import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GhostSettingsState {
    // 自动挂机救援 (Passive Rescue)
    passiveRescueEnabled: boolean;
    passiveRescueTimeoutSeconds: number;

    // 手动首字母破局连击 (Active Rescue)
    activeRescueEnabled: boolean;
    activeRescueTimeoutSeconds: number;

    // 纠错与预测参数
    autocorrectEnabled: boolean;
    allowDuplicates: boolean;
    fuzzyTolerance: number; // 0 = 严苛精确, 1 = 正常模糊(拼写1/词缀), 2 = 极度宽容(拼写2)
    passiveRescueWordCount: number;
    activeRescueWordCount: number;
    maxReferenceAlternatives: number;
    rescueColor: 'emerald' | 'blue' | 'purple' | 'rose' | 'amber';
    algorithmMode: 'auto' | 'deterministic' | 'vector' | 'nlp';
    
    // 智能造句引导
    writingGuideEnabled: boolean;

    // 进阶智能
    semanticBranchingEnabled: boolean;
    grammarCompensationEnabled: boolean;

    setPassiveRescueEnabled: (v: boolean) => void;
    setPassiveRescueTimeoutSeconds: (v: number) => void;
    setActiveRescueEnabled: (v: boolean) => void;
    setActiveRescueTimeoutSeconds: (v: number) => void;
    setAutocorrectEnabled: (v: boolean) => void;
    setAllowDuplicates: (v: boolean) => void;
    setSemanticBranchingEnabled: (v: boolean) => void;
    setGrammarCompensationEnabled: (v: boolean) => void;
    setFuzzyTolerance: (v: number) => void;
    setPassiveRescueWordCount: (v: number) => void;
    setActiveRescueWordCount: (v: number) => void;
    setMaxReferenceAlternatives: (v: number) => void;
    setRescueColor: (color: 'emerald' | 'blue' | 'purple' | 'rose' | 'amber') => void;
    setAlgorithmMode: (mode: 'auto' | 'deterministic' | 'vector' | 'nlp') => void;
    setWritingGuideEnabled: (v: boolean) => void;

    // NLP 专属参数 (隔离区)
    nlpShowMorphologyUI: boolean;
    nlpChunkWaterfallEnabled: boolean;
    nlpWaterfallDepth: number;
    nlpAutocorrectEnabled: boolean;
    nlpFuzzyTolerance: number;
    nlpSemanticBranchingEnabled: boolean;
    nlpGrammarCompensationEnabled: boolean;

    setNlpShowMorphologyUI: (v: boolean) => void;
    setNlpChunkWaterfallEnabled: (v: boolean) => void;
    setNlpWaterfallDepth: (v: number) => void;
    setNlpAutocorrectEnabled: (v: boolean) => void;
    setNlpFuzzyTolerance: (v: number) => void;
    setNlpSemanticBranchingEnabled: (v: boolean) => void;
    setNlpGrammarCompensationEnabled: (v: boolean) => void;
}

export const useGhostSettingsStore = create<GhostSettingsState>()(
    persist(
        (set) => ({
            passiveRescueEnabled: true,
            passiveRescueTimeoutSeconds: 4.0,

            activeRescueEnabled: true,
            activeRescueTimeoutSeconds: 3.0,

            autocorrectEnabled: true,
            allowDuplicates: false,
            semanticBranchingEnabled: true,
            grammarCompensationEnabled: true,
            fuzzyTolerance: 2, // 默认极度宽容(Typo 2)
            passiveRescueWordCount: 0,
            activeRescueWordCount: 0,
            maxReferenceAlternatives: 4,
            rescueColor: 'emerald',
            algorithmMode: 'auto',
            writingGuideEnabled: true,

            // NLP defaults
            nlpShowMorphologyUI: true,
            nlpChunkWaterfallEnabled: true,
            nlpWaterfallDepth: 1,
            nlpAutocorrectEnabled: true,
            nlpFuzzyTolerance: 2,
            nlpSemanticBranchingEnabled: true,
            nlpGrammarCompensationEnabled: true,

            setPassiveRescueEnabled: (v) => set({ passiveRescueEnabled: v }),
            setPassiveRescueTimeoutSeconds: (v) => set({ passiveRescueTimeoutSeconds: v }),
            setActiveRescueEnabled: (v) => set({ activeRescueEnabled: v }),
            setActiveRescueTimeoutSeconds: (v) => set({ activeRescueTimeoutSeconds: v }),
            setAutocorrectEnabled: (v) => set({ autocorrectEnabled: v }),
            setAllowDuplicates: (v) => set({ allowDuplicates: v }),
            setSemanticBranchingEnabled: (v) => set({ semanticBranchingEnabled: v }),
            setGrammarCompensationEnabled: (v) => set({ grammarCompensationEnabled: v }),
            setFuzzyTolerance: (v) => set({ fuzzyTolerance: v }),
            setPassiveRescueWordCount: (v) => set({ passiveRescueWordCount: v }),
            setActiveRescueWordCount: (v) => set({ activeRescueWordCount: v }),
            setMaxReferenceAlternatives: (v) => set({ maxReferenceAlternatives: v }),
            setRescueColor: (v) => set({ rescueColor: v }),
            setAlgorithmMode: (v) => set({ algorithmMode: v }),
            setWritingGuideEnabled: (v) => set({ writingGuideEnabled: v }),

            setNlpShowMorphologyUI: (v) => set({ nlpShowMorphologyUI: v }),
            setNlpChunkWaterfallEnabled: (v) => set({ nlpChunkWaterfallEnabled: v }),
            setNlpWaterfallDepth: (v) => set({ nlpWaterfallDepth: v }),
            setNlpAutocorrectEnabled: (v) => set({ nlpAutocorrectEnabled: v }),
            setNlpFuzzyTolerance: (v) => set({ nlpFuzzyTolerance: v }),
            setNlpSemanticBranchingEnabled: (v) => set({ nlpSemanticBranchingEnabled: v }),
            setNlpGrammarCompensationEnabled: (v) => set({ nlpGrammarCompensationEnabled: v }),
        }),
        {
            name: 'ghost-settings-storage', // saves to localStorage
        }
    )
);
