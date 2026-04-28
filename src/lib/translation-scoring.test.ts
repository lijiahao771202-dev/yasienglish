import { describe, expect, it } from 'vitest';
import { 
    calculateLiteralScore, 
    calculateNlpScore, 
    calculateVectorScore, 
    evaluateTranslationHybrid,
    getNGrams
} from './translation-scoring';

describe('Translation Hybrid Scoring', () => {
    
    describe('Literal N-Gram Scoring', () => {
        it('should return 100 for exact match', () => {
            const res = calculateLiteralScore('He is a good boy', 'He is a good boy');
            expect(res.score).toBe(100);
        });

        it('should penalize changed word order even if words are same', () => {
            const res1 = calculateLiteralScore('A good boy is he', 'He is a good boy');
            // 'He is a good boy' -> bigrams: 'he is', 'is a', 'a good', 'good boy' (4) -> trigrams (3) -> total 7
            // 'A good boy is he' -> bigrams: 'a good', 'good boy', 'boy is', 'is he'. 
            // Matching bigrams: 'a good', 'good boy' (2)
            expect(res1.score).toBeLessThan(50);
        });

        it('should correctly extract NGrams', () => {
            const b = getNGrams("I love you", 2);
            expect(b.has("i love")).toBe(true);
            expect(b.has("love you")).toBe(true);
            expect(b.size).toBe(2);
        });
    });

    describe('NLP Lemma Score', () => {
        it('should extract core lemmas and match them regardless of inflection', () => {
            const res = calculateNlpScore('She runs quickly to the stores', 'She ran quickly to the store');
            
            // Expected lemmas: 'run', 'store'
            expect(res.matchedLemmas.includes('run')).toBe(true);
            expect(res.matchedLemmas.includes('store')).toBe(true);
            expect(res.missingLemmas.length).toBe(0);
            expect(res.score).toBe(100);
        });

        it('should detect missing crucial information', () => {
            const res = calculateNlpScore('She goes to the store', 'She ran quickly to the store');
            // Missing 'run' (or 'ran' lemma), but what about adjectives/adverbs? Currently we extract Nouns, Verbs, Adjectives
            // 'go' is not 'run'
            expect(res.score).toBeLessThan(100);
            expect(res.missingLemmas.includes('run')).toBe(true);
        });
    });

    describe('Vector Score Fallback', () => {
        it('should substitute missing lemmas with high cosine similarity', async () => {
            // Mock getWordVector
            const mockDict: Record<string, number[]> = {
                'huge': [1, 0, 0],
                'enormous': [0.9, 0.1, 0],
                'tiny': [-1, 0, 0]
            };
            
            const getWordVector = async (w: string) => mockDict[w] || null;

            // Scenario: reference demands 'huge', user provided 'enormous'
            const score = await calculateVectorScore(['enormous'], ['huge'], ['huge'], getWordVector);
            
            // huge = [1, 0, 0]. enormous = [0.9, 0.1, 0].
            // Cosine = 0.9 / sqrt(0.82) = 0.9938... * 100 = 99
            expect(Math.round(score)).toBe(99);
        });

        it('should drop score heavily for unrelated substitutions', async () => {
            const mockDict: Record<string, number[]> = {
                'huge': [1, 0, 0],
                'tiny': [-1, 0, 0]
            };
            const getWordVector = async (w: string) => mockDict[w] || null;

            const score = await calculateVectorScore(['tiny'], ['huge'], ['huge'], getWordVector);
            // huge x tiny = -1. Math.max(0, -1) = 0. Score = 0
            expect(score).toBe(0);
        });
    });

    describe('evaluateTranslationHybrid (End-to-End)', () => {
        it('returns exact 100 for perfect match', async () => {
            const res = await evaluateTranslationHybrid({
                userSentence: 'It is very cold today',
                referenceSentence: 'It is very cold today'
            });
            expect(res.totalScore).toBe(100);
            expect(res.vectorScore).toBe(100);
            expect(res.literalNgramScore).toBe(100);
        });

        it('calculates hybrid score appropriately for partial match with synonym', async () => {
            // Ref: A huge monster attacked
            // User: An enormous beast assaulted
            const mockDict: Record<string, number[]> = {
                'huge': [1, 0],
                'enormous': [0.95, 0],
                'monster': [0, 1],
                'beast': [0, 0.95],
                'attack': [1, 1],
                'assault': [0.95, 0.95]
            };
            
            const res = await evaluateTranslationHybrid({
                userSentence: 'An enormous beast assaulted',
                referenceSentence: 'A huge monster attacked',
                getWordVector: async (w) => mockDict[w] || [0.1, 0.1]
            });

            // literal: 0 (no bigrams match)
            // nlp: 0 (none of huge, monster, attack perfectly match enormously, beast, assault)
            // vector: very high (~95)
            // total = (0 * 0.2) + (0 * 0.3) + (95 * 0.5) = 47.5
            expect(res.literalNgramScore).toBe(0);
            expect(res.nlpRecallScore).toBe(0);
            expect(res.vectorScore).toBeGreaterThan(90);
            expect(res.totalScore).toBeGreaterThan(45);
        });
    });
});
