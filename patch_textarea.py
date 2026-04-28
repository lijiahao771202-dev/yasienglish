import re

with open("src/components/vocab/GhostTextarea.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# Destructure new vars
text = text.replace(
    ", semanticBranchingEnabled, grammarCompensationEnabled } = useGhostSettingsStore.getState();",
    ", semanticBranchingEnabled, grammarCompensationEnabled, nlpShowMorphologyUI, nlpWaterfallDepth } = useGhostSettingsStore.getState();"
)

# Apply nlpWaterfallDepth in nlpComplete call and check nlpShowMorphologyUI
# We look for `detResult = effectiveMode === 'nlp'`
find_code = """            const detResult = effectiveMode === 'nlp' 
                ? nlpComplete(clean, referenceAnswer, clampedAlts, stuckExtras, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled)
                : deterministicComplete(clean, referenceAnswer, clampedAlts, stuckExtras, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled);"""

replace_code = """            const detResult = effectiveMode === 'nlp' 
                ? nlpComplete(clean, referenceAnswer, clampedAlts, stuckExtras > 0 ? stuckExtras : nlpWaterfallDepth, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled)
                : deterministicComplete(clean, referenceAnswer, clampedAlts, stuckExtras, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled);"""

text = text.replace(find_code, replace_code)

# Handle UI toggle
text = text.replace(
    "setMorphologyWarning(effectiveMode === 'nlp' ? (detResult as any).morphologyDiff : null);",
    "setMorphologyWarning(effectiveMode === 'nlp' && nlpShowMorphologyUI ? (detResult as any).morphologyDiff : null);"
)

with open("src/components/vocab/GhostTextarea.tsx", "w", encoding="utf-8") as f:
    f.write(text)

