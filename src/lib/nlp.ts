import nlp from 'compromise';

export function getRoot(word: string): string {
    let w = word.trim().toLowerCase();
    if (!w) return w;
    
    // Attempt to normalize verbs first (are/is/was -> be, ran -> run)
    const verbDoc = nlp(w).verbs();
    if (verbDoc.found) {
        const inf = verbDoc.toInfinitive().text().toLowerCase();
        if (inf) return inf;
    }
    
    // Attempt to normalize nouns (mice -> mouse, boxes -> box)
    const nounDoc = nlp(w).nouns();
    if (nounDoc.found) {
        const sing = nounDoc.toSingular().text().toLowerCase();
        if (sing) return sing;
    }
    
    // Last resort fallback using implicit root computation (handles happier -> happy, etc.)
    const doc = nlp(w);
    doc.compute('root');
    const rootText = doc.text('root').toLowerCase();
    if (rootText) {
        return rootText;
    }
    
    return w;
}

export function isSameRoot(a: string, b: string): boolean {
    const rootA = getRoot(a);
    const rootB = getRoot(b);
    return rootA === rootB;
}

// Basic semantic synonym grouping can also be stored here if necessary, 
// keeping NLP-related utilities unified.
export const COMMON_SYNONYMS: Record<string, string[]> = {
    "important": ["crucial", "vital", "essential", "key", "significant"],
    "good": ["excellent", "great", "positive", "beneficial", "superb"],
    "bad": ["poor", "negative", "harmful", "detrimental", "adverse"]
};

export type MorphologyDiffType = 'TENSE_ERROR' | 'PLURALITY_ERROR' | 'FORM_ERROR' | null;

export function getMorphologyDiffType(uWord: string, rWord: string): MorphologyDiffType {
    let u = uWord.trim().toLowerCase();
    let r = rWord.trim().toLowerCase();
    if (!u || !r || u === r) return null;
    
    const uDoc = nlp(u);
    const rDoc = nlp(r);
    
    const uVerb = uDoc.has('#Verb');
    const rVerb = rDoc.has('#Verb');
    if (uVerb && rVerb) return 'TENSE_ERROR';
    
    const uNoun = uDoc.has('#Noun');
    const rNoun = rDoc.has('#Noun');
    if (uNoun && rNoun) return 'PLURALITY_ERROR';
    
    return 'FORM_ERROR';
}
