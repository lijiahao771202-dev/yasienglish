import nlp from 'compromise';

export interface TranslationScoreParams {
    userSentence: string;
    referenceSentence: string;
    getWordVector?: (word: string) => Promise<number[] | null>;
}

export interface TranslationScoreResult {
    totalScore: number;       // 0 - 100
    vectorScore: number;      // 0 - 100
    nlpRecallScore: number;   // 0 - 100
    literalNgramScore: number;// 0 - 100
    details: {
        missingLemmas: string[];
        matchedNgrams: string[];
        matchedLemmas: string[];
    }
}

// Cosine similarity
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 1. Literal Score (BLEU-lite NGrams)
export function getNGrams(text: string, n: number): Set<string> {
    const words = text.toLowerCase().match(/\b(\w+)\b/g) || [];
    const ngrams = new Set<string>();
    for (let i = 0; i <= words.length - n; i++) {
        ngrams.add(words.slice(i, i + n).join(' '));
    }
    return ngrams;
}

export function calculateLiteralScore(user: string, ref: string): { score: number, matched: string[] } {
    const refBigrams = getNGrams(ref, 2);
    const userBigrams = getNGrams(user, 2);
    const refTrigrams = getNGrams(ref, 3);
    const userTrigrams = getNGrams(user, 3);

    const refTotal = refBigrams.size + refTrigrams.size;
    if (refTotal === 0) return { score: 100, matched: [] }; // Prevent division by zero for short texts

    let matchedCount = 0;
    const matchedNgrams: string[] = [];

    refBigrams.forEach(bg => {
        if (userBigrams.has(bg)) {
            matchedCount++;
            matchedNgrams.push(bg);
        }
    });

    refTrigrams.forEach(tg => {
        if (userTrigrams.has(tg)) {
            matchedCount++;
            matchedNgrams.push(tg);
        }
    });

    return {
        score: Math.min(100, (matchedCount / refTotal) * 100),
        matched: matchedNgrams
    };
}

// 2. NLP Score (Core Lemma Recall)
export function calculateNlpScore(user: string, ref: string): { score: number, matchedLemmas: string[], missingLemmas: string[], refLemmas: string[], userLemmas: string[] } {
    const refDoc = nlp(ref);
    const userDoc = nlp(user);
    
    // Extract core lemmas from compromise
    const extractCoreLemmas = (doc: any) => {
        const lemmas = new Set<string>();
        // Using compute('root') to find lemmas
        doc.compute('root');
        const verbs = doc.match('#Verb') as any;
        const nouns = doc.match('#Noun') as any;
        const adjectives = doc.match('#Adjective') as any;
        
        const extract = (m: any) => m.out('array').map((w:string) => (nlp(w).compute('root').text('root') || w).toLowerCase().replace(/[^a-z]/g, ''));
        
        extract(verbs).forEach((w: string) => w && lemmas.add(w));
        extract(nouns).forEach((w: string) => w && lemmas.add(w));
        extract(adjectives).forEach((w: string) => w && lemmas.add(w));
        return Array.from(lemmas).filter(Boolean);
    };

    const refLemmas = extractCoreLemmas(refDoc);
    const userLemmas = extractCoreLemmas(userDoc);

    if (refLemmas.length === 0) return { score: 100, matchedLemmas: [], missingLemmas: [], refLemmas: [], userLemmas: [] };

    let matched = 0;
    const matchedLemmas: string[] = [];
    const missingLemmas: string[] = [];

    refLemmas.forEach(l => {
        if (userLemmas.includes(l)) {
            matched++;
            matchedLemmas.push(l);
        } else {
            missingLemmas.push(l);
        }
    });

    return {
        score: (matched / refLemmas.length) * 100,
        matchedLemmas,
        missingLemmas,
        refLemmas,
        userLemmas
    };
}

// 3. Vector Score (Semantic Embedding Fallback)
export async function calculateVectorScore(
    userLemmas: string[], 
    refLemmas: string[], 
    missingLemmas: string[],
    getWordVector?: (word: string) => Promise<number[] | null>
): Promise<number> {
    if (refLemmas.length === 0) return 100;
    
    if (!getWordVector) {
        // If we can't do vector math, return the NLP match ratio to be safe
        return ((refLemmas.length - missingLemmas.length) / refLemmas.length) * 100;
    }

    let totalPoints = 0;

    for (const rWord of refLemmas) {
        if (!missingLemmas.includes(rWord)) {
            // Already matched exactly by NLP
            totalPoints += 100;
            continue;
        }

        // Try to find the best vector match among user's core words
        let maxSim = 0;
        const rVec = await getWordVector(rWord);
        if (rVec) {
            for (const uWord of userLemmas) {
                const uVec = await getWordVector(uWord);
                if (uVec) {
                    const sim = cosineSimilarity(rVec, uVec);
                    if (sim > maxSim) maxSim = sim;
                }
            }
        }
        
        // We set a threshold or scale it. E.g., sim 0.8 is great, < 0.3 means unrelated.
        // BGE cosine similarities often hover high, so we might need to map them nicely. 
        // For now, let's treat sim itself as percentage but cap low values.
        const vectorPoints = Math.max(0, maxSim) * 100;
        totalPoints += vectorPoints;
    }

    return totalPoints / refLemmas.length;
}

// 4. Main Hybrid Function
export async function evaluateTranslationHybrid(params: TranslationScoreParams): Promise<TranslationScoreResult> {
    const { userSentence, referenceSentence, getWordVector } = params;

    // Fast return for identical strings
    if (userSentence.trim().toLowerCase() === referenceSentence.trim().toLowerCase()) {
        return {
            totalScore: 100,
            vectorScore: 100,
            nlpRecallScore: 100,
            literalNgramScore: 100,
            details: {
                missingLemmas: [],
                matchedNgrams: [],
                matchedLemmas: []
            }
        };
    }

    // 1. Literal Score (20% Weight)
    const literalResult = calculateLiteralScore(userSentence, referenceSentence);

    // 2. NLP Score (30% Weight)
    const nlpResult = calculateNlpScore(userSentence, referenceSentence);

    // 3. Vector Score (50% Weight)
    const vectorScore = await calculateVectorScore(
        nlpResult.userLemmas, 
        nlpResult.refLemmas, 
        nlpResult.missingLemmas, 
        getWordVector
    );

    // Composite Calculation (50/30/20)
    const totalScore = (vectorScore * 0.5) + (nlpResult.score * 0.3) + (literalResult.score * 0.2);

    return {
        totalScore: Math.min(100, Math.max(0, totalScore)),
        vectorScore: Math.min(100, Math.max(0, vectorScore)),
        nlpRecallScore: Math.min(100, Math.max(0, nlpResult.score)),
        literalNgramScore: Math.min(100, Math.max(0, literalResult.score)),
        details: {
            missingLemmas: nlpResult.missingLemmas,
            matchedNgrams: literalResult.matched,
            matchedLemmas: nlpResult.matchedLemmas
        }
    };
}
