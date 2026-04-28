import re

with open('/Users/lijiahao/yasi/src/components/vocab/GhostTextarea.tsx', 'r') as f:
    content = f.read()

# 1. Add shareStem function
share_stem_code = """function shareStem(u: string, r: string): boolean {
    if (u.length <= 3) return false;
    // VERY primitive English stem sharing: check if they share first 4 chars
    return u.substring(0, 4) === r.substring(0, 4);
}

"""

# 2. Replace isSameRoot with shareStem in deterministicComplete
det_start = content.find('function deterministicComplete')
det_end = content.find('// Stem matching fully outsourced to NLP module isSameRoot()', det_start)
det_code = content[det_start:det_end]

nlp_code = det_code.replace('deterministicComplete', 'nlpComplete').replace(
    '): { ghost: string; isReplacement?: boolean; fuzzy?: boolean } | null {',
    '): { ghost: string; isReplacement?: boolean; fuzzy?: boolean; morphologyDiff?: { uWord: string, rWord: string, type: import("@/lib/nlp").MorphologyDiffType } } | null {'
)

# NLP code already uses isSameRoot. We just need to add morphology diff logic.
nlp_code = nlp_code.replace('const cost = isSameRoot(uWord, rWord) ? 0.3 : 0.8;', '''
                        let diffObj = null;
                        const isRoot = isSameRoot(uWord, rWord);
                        const cost = isRoot ? 0.3 : 0.8;
                        if (isRoot) {
                            const diffType = getMorphologyDiffType(uWord, rWord);
                            if (diffType) {
                                diffObj = { uWord, rWord, type: diffType };
                            }
                        }
''')
nlp_code = nlp_code.replace('bestCandidate = { cost, refIndex: j - 1, ghostStr, isRep, uWordMatchEnded };', 'bestCandidate = { cost, refIndex: j - 1, ghostStr, isRep, uWordMatchEnded, diffObj };')
nlp_code = nlp_code.replace('let { ghostStr, isRep, uWordMatchEnded, refIndex } = bestCandidate;', 'let { ghostStr, isRep, uWordMatchEnded, refIndex, diffObj } = bestCandidate;')
nlp_code = nlp_code.replace('if (ghostStr) return { ghost: ghostStr, isReplacement: isRep };', 'if (ghostStr) return { ghost: ghostStr, isReplacement: isRep, morphologyDiff: diffObj };')


# Now det_code needs to revert to shareStem
det_code_reverted = det_code.replace('isSameRoot(uWord, rWord)', 'shareStem(uWord, rWord)')

new_content = content.replace(content[det_start:det_end], share_stem_code + det_code_reverted + '\n' + nlp_code)

new_content = new_content.replace('import { isSameRoot } from \'@/lib/nlp\';', 'import { isSameRoot, getMorphologyDiffType, MorphologyDiffType } from \'@/lib/nlp\';')


# Update runCompletion route
run_comp_old = '''        // Layer 1: Deterministic (position-aware + fuzzy + stem, current word only)
        if (effectiveMode === 'auto' || effectiveMode === 'deterministic') {
            const detResult = deterministicComplete(clean, referenceAnswer, clampedAlts, stuckExtras, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled);
            if (detResult) {
                setGhostText(detResult.ghost);
                setGhostSource('deterministic');
                setIsReplacement(!!detResult.isReplacement);
                setReplaceWordCount(detResult.isReplacement ? 1 : 0);
                setGhostConfidence(1);
                prevGhostRef.current = detResult.ghost;
                return;
            }
            if (predictionMode === 'deterministic') {
                clearGhost();
                return;
            }
        }'''

run_comp_new = '''        // Layer 1: Deterministic / NLP
        if (effectiveMode === 'auto' || effectiveMode === 'deterministic' || effectiveMode === 'nlp') {
            const detResult = effectiveMode === 'nlp' 
                ? nlpComplete(clean, referenceAnswer, clampedAlts, stuckExtras, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled)
                : deterministicComplete(clean, referenceAnswer, clampedAlts, stuckExtras, autocorrectEnabled, fuzzyTolerance, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled);
            
            if (detResult) {
                setGhostText(detResult.ghost);
                setGhostSource(effectiveMode === 'nlp' ? 'nlp' : 'deterministic');
                setIsReplacement(!!detResult.isReplacement);
                setReplaceWordCount(detResult.isReplacement ? 1 : 0);
                setGhostConfidence(1);
                setMorphologyWarning(effectiveMode === 'nlp' ? (detResult as any).morphologyDiff : null);
                prevGhostRef.current = detResult.ghost;
                return;
            }
            if (predictionMode === 'deterministic' || effectiveMode === 'nlp') {
                clearGhost();
                setMorphologyWarning(null);
                return;
            }
        }'''

new_content = new_content.replace(run_comp_old, run_comp_new)
new_content = new_content.replace('const [ghostConfidence, setGhostConfidence] = useState(1);', 'const [ghostConfidence, setGhostConfidence] = useState(1);\n    const [morphologyWarning, setMorphologyWarning] = useState<{uWord: string, rWord: string, type: MorphologyDiffType} | null>(null);')

# Update clearGhost
clear_old = '''const clearGhost = useCallback(() => {
        setGhostText('');
        setGhostSource('none');
        setIsReplacement(false);
        setReplaceWordCount(0);
        setGhostConfidence(1);
        prevGhostRef.current = '';
    }, []);'''
clear_new = '''const clearGhost = useCallback(() => {
        setGhostText('');
        setGhostSource('none');
        setIsReplacement(false);
        setReplaceWordCount(0);
        setGhostConfidence(1);
        setMorphologyWarning(null);
        prevGhostRef.current = '';
    }, []);'''
new_content = new_content.replace(clear_old, clear_new)

with open('/Users/lijiahao/yasi/src/components/vocab/GhostTextarea.tsx', 'w') as f:
    f.write(new_content)

print('Success')
