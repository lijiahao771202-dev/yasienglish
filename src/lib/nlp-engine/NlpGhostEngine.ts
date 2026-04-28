import nlp from 'compromise';
import { isSameRoot, getMorphologyDiffType, MorphologyDiffType } from '@/lib/nlp';
import { cosineSim } from './cosine';

export interface NlpGhostEngineConfig {
    nlpChunkWaterfallEnabled: boolean;
    nlpWaterfallDepth: number; // Used as chunk count limit if chunk enabled, else word count limit
    nlpAutocorrectEnabled: boolean;
    nlpFuzzyTolerance: number;
    nlpSemanticBranchingEnabled: boolean;
    nlpGrammarCompensationEnabled: boolean;
    allowDuplicates: boolean;
}

export interface NlpCompletionResult {
    ghost: string;
    isReplacement?: boolean;
    morphologyDiff?: {
        uWord: string;
        rWord: string;
        type: MorphologyDiffType;
    };
}

export interface VectorDeps {
    embeddingCache: Map<string, number[]>;
    requestEmbeddings: (inputs: string[]) => Promise<number[][]>;
    refWordEmbeddings: Array<{ word: string, embedding: number[] }>;
}

export class NlpGhostEngine {
    constructor(private config: NlpGhostEngineConfig, private vectors: VectorDeps | null) {}

    public async predict(
        fullText: string,
        referenceAnswer: string,
        allRefs: string[] = [],
        stuckExtras: number = 0
    ): Promise<NlpCompletionResult | null> {
        const inputWords = fullText.trimStart().toLowerCase().split(/[\s,?!;.]+/).filter(Boolean);
        const endsAtWordBoundary = /[\s,?!;.]$/.test(fullText);
        const m = inputWords.length;
        
        if (m === 0) return null;
        // The early return for endsAtWordBoundary was removed to allow continuous string prediction (waterfall) at word boundaries.

        // Pre-fetch missing embeddings for input words to allow synchronous DP loop
        if (this.config.nlpSemanticBranchingEnabled && this.vectors) {
            const missing = new Set<string>();
            for (const wRaw of inputWords) {
                const w = wRaw.replace(/[^a-z'’-]/g, '');
                if (w && !this.vectors.embeddingCache.has(w)) {
                    missing.add(w);
                }
            }
            if (missing.size > 0) {
                const missingArr = Array.from(missing);
                try {
                    const embs = await this.vectors.requestEmbeddings(missingArr);
                    for (let i = 0; i < missingArr.length; i++) {
                        if (embs[i]) this.vectors.embeddingCache.set(missingArr[i], embs[i]);
                    }
                } catch (e) {
                    // Fail silently, vector fallback will just be disabled for this word
                }
            }
        }

        const refSources = [referenceAnswer, ...allRefs];

        for (const ref of refSources) {
            const refWordsRaw = ref.replace(/[^a-zA-Z'’\s-]/g, '').split(/\s+/).filter(w => w.length > 0);
            const refWords = refWordsRaw.map(w => w.toLowerCase());
            const n = refWords.length;
            
            const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(Infinity));
            for (let j = 0; j <= n; j++) dp[0][j] = 0; // Allow starting from any ref point

            for (let i = 0; i <= m; i++) {
                for (let j = 0; j <= n; j++) {
                    if (i < m && j < n) {
                        const isPartial = (!endsAtWordBoundary) && (i === m - 1);
                        const uWordRaw = inputWords[i];
                        const uWord = uWordRaw.replace(/[^a-z'’-]/g, '');
                        const rWord = refWords[j];
                        let cost = 1.5;
                        
                        if (uWord.length === 0) cost = 1.5;
                        else if (uWord === rWord) cost = 0;
                        else if (isPartial && rWord.startsWith(uWord)) cost = 0;
                        else if (this.config.nlpGrammarCompensationEnabled && isSameRoot(uWord, rWord)) cost = 0.1;
                        else if (this.config.nlpAutocorrectEnabled && this.config.nlpFuzzyTolerance > 0 && this.levenshtein(uWord, rWord) <= this.config.nlpFuzzyTolerance) cost = 0.5;
                        else if (this.config.nlpAutocorrectEnabled && this.config.nlpFuzzyTolerance > 0 && isPartial && uWord.length >= 2 && this.levenshtein(uWord, rWord.slice(0, uWord.length)) <= (this.config.nlpFuzzyTolerance === 2 ? 1 : 0)) cost = 0.5;
                        else if (this.config.nlpSemanticBranchingEnabled && this.vectors) {
                            // Synchronous vector similarity lookup
                            const uEmb = this.vectors.embeddingCache.get(uWord);
                            const rEmb = this.vectors.refWordEmbeddings.find(x => x.word === rWord)?.embedding;
                            if (uEmb && rEmb) {
                                const sim = cosineSim(uEmb, rEmb);
                                if (sim > 0.85) cost = 0.1; // Treat as semantic synonym
                            }
                        }

                        if (dp[i][j] + cost < dp[i+1][j+1]) dp[i+1][j+1] = dp[i][j] + cost;
                    }
                    if (i < m && dp[i][j] + 1 < dp[i+1][j]) dp[i+1][j] = dp[i][j] + 1; // Penalty for skipping user word
                    if (j < n && dp[i][j] + 0.01 < dp[i][j+1]) dp[i][j+1] = dp[i][j] + 0.01; // Negligible penalty for skipping ref words
                }
            }

            let bestCandidate: { cost: number, refIndex: number, ghostStr: string, isRep: boolean, uWordMatchEnded: boolean, diffObj?: { uWord: string, rWord: string, type: MorphologyDiffType } } | null = null;
            
            for (let j = 0; j <= n; j++) {
                const cost = dp[m][j];
                if (cost <= Math.max(1.0, m * 0.8)) {
                    let ghostStr = '';
                    let isRep = false;
                    let uWordMatchEnded = false;
                    let valid = true;
                    let diffObj: { uWord: string, rWord: string, type: MorphologyDiffType } | undefined = undefined;
                    
                    if (!endsAtWordBoundary) {
                        const uWordRaw = inputWords[m - 1];
                        const uWord = uWordRaw.replace(/[^a-z'’-]/g, '');
                        const rWordRaw = refWordsRaw[j - 1];
                        const rWordLower = refWords[j - 1];
                        
                        if (!rWordLower || uWord.length === 0) valid = false;
                        else if (rWordLower.startsWith(uWord)) {
                            ghostStr = rWordRaw.slice(uWord.length);
                            uWordMatchEnded = rWordLower === uWord;
                        } else if (this.config.nlpGrammarCompensationEnabled && isSameRoot(uWord, rWordLower)) {
                            ghostStr = rWordRaw;
                            isRep = true;
                            uWordMatchEnded = true;
                            const diff = getMorphologyDiffType(uWord, rWordLower);
                            if (diff) diffObj = { uWord, rWord: rWordLower, type: diff };
                        } else if (this.config.nlpAutocorrectEnabled && uWord.length >= 2 && this.levenshtein(uWord, rWordLower.slice(0, uWord.length)) <= 1) {
                            ghostStr = rWordRaw;
                            isRep = true;
                            uWordMatchEnded = true;
                        } else if (this.config.nlpSemanticBranchingEnabled && this.vectors) {
                            const uEmb = this.vectors.embeddingCache.get(uWord);
                            const rEmb = this.vectors.refWordEmbeddings.find(x => x.word === rWordLower)?.embedding;
                            if (uEmb && rEmb && cosineSim(uEmb, rEmb) > 0.85) {
                                ghostStr = rWordRaw;
                                isRep = true;
                                uWordMatchEnded = true;
                            } else {
                                valid = false;
                            }
                        } else {
                            valid = false;
                        }
                    } else if (this.config.nlpGrammarCompensationEnabled) {
                        const uWordRaw = inputWords[m - 1];
                        const uWord = uWordRaw?.replace(/[^a-z'’-]/g, '');
                        const rWordRaw = refWordsRaw[j - 1];
                        const rWordLower = refWords[j - 1];

                        if (rWordLower && uWord && rWordLower !== uWord && uWord.length > 0) {
                            if (isSameRoot(uWord, rWordLower)) {
                                ghostStr = rWordRaw;
                                isRep = true;
                                uWordMatchEnded = true;
                                const diff = getMorphologyDiffType(uWord, rWordLower);
                                if (diff) diffObj = { uWord, rWord: rWordLower, type: diff };
                            } else {
                                valid = false;
                            }
                        } else if (rWordLower && uWord && rWordLower !== uWord) {
                            valid = false;
                        }
                    }

                    if (valid && !this.config.allowDuplicates) {
                        const rWordLower = refWords[j - 1];
                        if (rWordLower) {
                            let refCount = 0;
                            for (const w of refWords) if (w === rWordLower) refCount++;
                            let inputCount = 0;
                            for (const wRaw of inputWords.slice(0, m - 1)) {
                                const w = wRaw.replace(/[^a-z'’-]/g, '');
                                if (w.length > 0 && w === rWordLower) inputCount++;
                            }
                            if (inputCount >= refCount) valid = false;
                        }
                    }
                    
                    if (valid) {
                        if (!bestCandidate || cost < bestCandidate.cost) {
                            bestCandidate = { cost, refIndex: j - 1, ghostStr, isRep, uWordMatchEnded, diffObj };
                        }
                    }
                }
            }
            
            if (bestCandidate) {
                let { ghostStr, isRep, uWordMatchEnded, refIndex, diffObj } = bestCandidate;
                // --- EXTENDED PREDICTION ---
                let extraItemCount = stuckExtras > 0 ? stuckExtras : this.config.nlpWaterfallDepth;
                
                if (extraItemCount > 0) {
                    const nextWords = refWordsRaw.slice(refIndex + 1);
                    if (nextWords.length > 0) {
                        let waterfallAdd = '';
                        
                        // Chunk-aware is only applied during stuck rescues (otherwise normal typing is too noisy)
                        if (this.config.nlpChunkWaterfallEnabled && stuckExtras > 0) {
                            const remainderStr = nextWords.join(' ');
                            const doc = nlp(remainderStr);
                            const chunks = doc.chunks().out('array');
                            
                            if (chunks && chunks.length > 0) {
                                // Force exactly 1 chunk when in semantic mode, overriding strict number limits
                                const limit = Math.min(chunks.length, 1);
                                waterfallAdd = chunks.slice(0, limit).join(' ');
                            } else {
                                waterfallAdd = nextWords.slice(0, extraItemCount).join(' ');
                            }
                        } else {
                            waterfallAdd = nextWords.slice(0, extraItemCount).join(' ');
                        }

                        if (isRep) ghostStr += ' ' + waterfallAdd;
                        else if (ghostStr.length > 0) ghostStr += ' ' + waterfallAdd;
                        else ghostStr = (!endsAtWordBoundary && uWordMatchEnded) ? ' ' + waterfallAdd : waterfallAdd;
                    }
                }
                
                if (ghostStr) return { ghost: ghostStr, isReplacement: isRep, morphologyDiff: diffObj };
            }
        }
        
        return null;
    }

    private levenshtein(a: string, b: string): number {
        if (Math.abs(a.length - b.length) > 2) return 3;
        const m = a.length, n = b.length;
        const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
            Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
        );
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                dp[i][j] = a[i - 1] === b[j - 1]
                    ? dp[i - 1][j - 1]
                    : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
        return dp[m][n];
    }
}
