import re

with open("src/lib/ghost-settings-store.ts", "r", encoding="utf-8") as f:
    text = f.read()

# Add to interface
text = text.replace(
    "    setAlgorithmMode: (mode: 'auto' | 'deterministic' | 'vector' | 'nlp') => void;",
    """    setAlgorithmMode: (mode: 'auto' | 'deterministic' | 'vector' | 'nlp') => void;
    // NLP 专属参数
    nlpShowMorphologyUI: boolean;
    nlpWaterfallDepth: number;
    setNlpShowMorphologyUI: (v: boolean) => void;
    setNlpWaterfallDepth: (v: number) => void;"""
)

# Add to default state
text = text.replace(
    "    algorithmMode: 'auto',",
    """    algorithmMode: 'auto',
            nlpShowMorphologyUI: true,
            nlpWaterfallDepth: 1,"""
)

# Add to setters
text = text.replace(
    "    setAlgorithmMode: (v) => set({ algorithmMode: v }),",
    """    setAlgorithmMode: (v) => set({ algorithmMode: v }),
            setNlpShowMorphologyUI: (v) => set({ nlpShowMorphologyUI: v }),
            setNlpWaterfallDepth: (v) => set({ nlpWaterfallDepth: v }),"""
)

with open("src/lib/ghost-settings-store.ts", "w", encoding="utf-8") as f:
    f.write(text)

