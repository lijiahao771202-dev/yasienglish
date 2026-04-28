const EDGE_PUNCTUATION = /^[,.;!?]/;
const NORMALIZE_EDGE_RE = /^[^a-z0-9']+|[^a-z0-9']+$/gi;

const STOPWORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "because", "but", "by", "for",
    "from", "he", "her", "his", "i", "if", "in", "is", "it", "me", "my", "of",
    "on", "or", "our", "she", "so", "that", "the", "their", "them", "they",
    "this", "to", "us", "was", "we", "were", "with", "you", "your",
    "will", "would", "can", "could", "should", "shall", "may", "might", "must",
    "do", "does", "did", "has", "have", "had", "been", "being", "am"
]);

const PHRASE_OPENERS = new Set([
    "a", "an", "the", "my", "your", "his", "her", "our", "their", "this", "that",
    "these", "those", "to", "in", "on", "at", "for", "with", "from", "near", "by",
    "under", "over", "inside", "outside", "around", "behind", "beside", "because",
    "after", "before", "during", "into", "onto", "out", "off", "up", "down",
]);

const SHORT_CONTEXT_TOKENS = new Set([
    ...PHRASE_OPENERS,
    "i", "we", "you", "he", "she", "they", "it",
]);

export interface GhostPrediction {
    append: string;
    replaceLen: number;
    replaceStr: string;
}

function normalizeToken(token: string) {
    return token.toLowerCase().replace(NORMALIZE_EDGE_RE, "");
}

function isMorphologyOrTypoPrefix(userInput: string, refWord: string): boolean {
    const u = userInput.toLowerCase();
    const r = refWord.toLowerCase();
    
    // 1. Exact Prefix
    if (r.startsWith(u)) return true;
    
    // Do not fuzzy match tiny words (too high collision risk)
    if (r.length < 4 && u.length < 3) return false;
    
    // 2. Morphology check (user typed complete root, ref has suffix)
    // E.g. user typed "plan", ref is "planned". u.slice(0, -1) -> "pla", r starts with "pla"
    // E.g. user typed "make", ref is "making". u.slice(0, -1) -> "mak", r starts with "mak"
    if (r.length > u.length) {
        if (r.startsWith(u.slice(0, -1))) {
            const diffLen = r.length - (u.length - 1);
            if (diffLen <= 4) return true; // e.g. "plan" -> "planning", "make" -> "making"
        }
    }
    
    // 3. Typo Prefix Check (Levenshtein Distance-ish)
    if (u[0] !== r[0]) return false; // First letter must match for fast brain anchoring
    
    const rPrefix = r.slice(0, u.length);
    if (rPrefix.length !== u.length) return false;
    
    // Transposition check (e.g. 'eniv' vs 'envi')
    for (let i = 0; i < u.length - 1; i++) {
        const transposed = u.slice(0, i) + u[i+1] + u[i] + u.slice(i+2);
        if (transposed === rPrefix) return true;
    }
    
    // Single substitution check
    let differences = 0;
    for (let i = 0; i < u.length; i++) {
        if (u[i] !== rPrefix[i]) differences++;
    }
    if (differences === 1) return true;
    
    return false;
}

function isFuzzyWordMatch(userInput: string, refWord: string): boolean {
    const u = userInput.toLowerCase();
    const r = refWord.toLowerCase();
    if (u === r) return true;
    
    if (u.length < 4 || r.length < 4) return false;
    
    let diff = 0;
    if (u.length === r.length) {
        for (let i = 0; i < u.length; i++) {
            if (u[i] !== r[i]) diff++;
        }
        return diff <= (r.length >= 7 ? 2 : 1);
    }
    
    if (Math.abs(u.length - r.length) === 1) {
        const shorter = u.length < r.length ? u : r;
        const longer = u.length >= r.length ? u : r;
        let s = 0, l = 0;
        let diffCount = 0;
        while (l < longer.length && s < shorter.length) {
            if (shorter[s] !== longer[l]) {
                diffCount++;
                l++;
                if (diffCount > 1) return false;
            } else {
                s++;
                l++;
            }
        }
        return true;
    }
    return false;
}

function tokenize(text: string) {
    return text
        .replace(/([.,!?;]+)/g, ' $1 ')
        .trim()
        .split(/\s+/)
        .map((raw, index) => ({
            raw,
            normalized: normalizeToken(raw),
            index,
        }))
        .filter(token => token.normalized.length > 0 || EDGE_PUNCTUATION.test(token.raw)); // Keep punctuation for exact raw mapping!
}

export function getAdaptivePredictionWordCount(currentInput: string, requestedWordCount = 2) {
    const tokens = tokenize(currentInput).filter(t => t.normalized.length > 0);
    if (tokens.length === 0) return Math.min(Math.max(requestedWordCount, 1), 3);

    const lastToken = tokens[tokens.length - 1]?.normalized;
    if (lastToken && PHRASE_OPENERS.has(lastToken)) {
        return 1;
    }

    return Math.min(Math.max(requestedWordCount, 1), 3);
}

function addLeadingSpaceIfNeeded(currentInput: string, suggestion: string) {
    if (!suggestion) return "";
    if (currentInput.endsWith(" ") || EDGE_PUNCTUATION.test(suggestion)) {
        return suggestion;
    }
    return ` ${suggestion}`;
}

// surfTokens() removed — it greedily absorbed stopwords beyond
// the requested word count, causing spoiler leakage.

function hasUsefulShortSuffixMatch(tokens: Array<{ normalized: string }>) {
    if (tokens.length < 2) return false;
    const [firstToken, lastToken] = tokens;
    
    // If the 2nd token is barely typed (length 1), we rely on the 1st token to be somewhat meaningful.
    if (lastToken.normalized.length <= 1) {
        if (firstToken.normalized.length >= 3) return true;
        if (!STOPWORDS.has(firstToken.normalized)) return true;
        if (PHRASE_OPENERS.has(firstToken.normalized)) return true;
        return false;
    }
    
    // If they typed at least 2 letters of the current word, any 2-word combo is statistically safe enough
    return true;
}

export function getSuffixAlignedPrediction(currentInput: string, referenceAnswer?: string, wordCount = 2, disableChunking = false): GhostPrediction | null {
    if (!referenceAnswer) return null;

    // Filter out punctuation tokens when comparing suffix alignment for semantic robustness
    const allCurrentTokens = tokenize(currentInput);
    const currentTokens = allCurrentTokens.filter(t => t.normalized.length > 0);
    const referenceTokens = tokenize(referenceAnswer).filter(t => t.normalized.length > 0);

    if (currentTokens.length < 1 || referenceTokens.length < 2) {
        return null; // Not enough semantic content to align
    }

    const maxWindow = Math.min(8, currentTokens.length, referenceTokens.length);
    const minWindow = Math.min(1, maxWindow);

    // Try finding the longest possible suffix match spanning backwards
    for (let windowSize = maxWindow; windowSize >= minWindow; windowSize -= 1) {
        const suffix = currentTokens.slice(-windowSize);
        if (windowSize === 2 && !hasUsefulShortSuffixMatch(suffix)) continue;

        const matches: number[] = [];
        let isPartialLastToken = false;
        
        for (let i = 0; i <= referenceTokens.length - windowSize; i += 1) {
            const isMatch = suffix.every((token, index) => {
                const refToken = referenceTokens[i + index];
                if (!refToken) return false;
                
                // Last token is actively being spelled, use prefix checking
                if (index === suffix.length - 1) {
                    return isMorphologyOrTypoPrefix(token.normalized, refToken.normalized);
                }
                
                // Previous tokens must be fully formed, allow gentle fuzzy typo fixing
                return isFuzzyWordMatch(token.normalized, refToken.normalized);
            });
            
            if (isMatch) {
                matches.push(i);
                if (suffix[suffix.length - 1].normalized !== referenceTokens[i + windowSize - 1].normalized) {
                    isPartialLastToken = true;
                }
            }
        }

        // Must be a unique trajectory to confidently suggest
        if (matches.length !== 1) continue;

        const baseMatchIndex = matches[0];
        
        // Full reference tokens including punctuation for the final UI output!
        const fullRefTokens = tokenize(referenceAnswer);
        const refMatchToken = referenceTokens[baseMatchIndex + windowSize - 1];
        
        // Find where this semantic token physically lives in the raw full token list
        const rawTokenIndex = fullRefTokens.findIndex(t => t.index === refMatchToken.index);
        
        if (isPartialLastToken) {
            const userPartialToken = suffix[suffix.length - 1];
            
            // Fast case-insensitive substitution
            const refRaw = fullRefTokens[rawTokenIndex].raw;
            // STRICT UX RULE: Punctuation and Clause boundaries act as hard thoughts stops
            const CLAUSE_BOUNDARIES = new Set(["but", "and", "because", "so", "although", "however", "if", "when", "while", "then", "or", "as", "since", "unless"]);
            
            const nextTokensArray: string[] = [];
            for (let j = rawTokenIndex + 1; j < fullRefTokens.length; j++) {
                const peekToken = fullRefTokens[j];
                
                // Hard Stop 1: Punctuation (include it, then strictly break)
                if (EDGE_PUNCTUATION.test(peekToken.raw)) {
                    nextTokensArray.push(peekToken.raw);
                    break;
                }
                
                // Hard Stop 2: Clause boundaries (exclude it, break before)
                if (CLAUSE_BOUNDARIES.has(peekToken.normalized)) {
                    break;
                }
                
                nextTokensArray.push(peekToken.raw);
                if (nextTokensArray.length >= wordCount) break;
            }
            
            const nextTokens = nextTokensArray.join(" ");
            const remainingCurrentWord = refRaw.slice(userPartialToken.raw.length);
            let suggestion = remainingCurrentWord;
            if (nextTokens) suggestion += (!EDGE_PUNCTUATION.test(nextTokens[0]) && suggestion ? " " : "") + nextTokens;
            
            const isStrictPrefix = refRaw.slice(0, userPartialToken.raw.length).toLowerCase() === userPartialToken.raw.toLowerCase();
            
            // If NOT a strict prefix (typo/case mismatch), don't attempt correction
            // → Let Gemma 4 AI handle smart corrections instead
            if (!isStrictPrefix) return null;
            
            return {
                append: suggestion,
                replaceLen: 0,
                replaceStr: ""
            };
        }

        // Current word is COMPLETE. Only show phrasal connectors (stopwords/particles).
        // e.g., "due" → " to", "because" → " of" ✓
        // e.g., "recent" → " contributions" ✗ (content word = spoiler!)
        const nextIndex = rawTokenIndex + 1;
        if (nextIndex >= fullRefTokens.length) return null;

        const CLAUSE_BOUNDARIES = new Set(["but", "and", "because", "so", "although", "however", "if", "when", "while", "then", "or", "as", "since", "unless"]);
        
        // Only trail stopwords/particles that form phrasal units
        const phrasalTrail: string[] = [];
        for (let j = nextIndex; j < fullRefTokens.length; j++) {
            const peekToken = fullRefTokens[j];
            
            // Punctuation: include it then stop
            if (EDGE_PUNCTUATION.test(peekToken.raw)) {
                phrasalTrail.push(peekToken.raw);
                break;
            }
            
            // Clause boundary: hard stop
            if (CLAUSE_BOUNDARIES.has(peekToken.normalized)) {
                break;
            }
            
            // Only allow stopwords/particles (short function words)
            if (STOPWORDS.has(peekToken.normalized) || peekToken.normalized.length <= 2) {
                phrasalTrail.push(peekToken.raw);
            } else {
                // Hit a content word → stop, don't spoil
                break;
            }
            
            if (phrasalTrail.length >= wordCount) break;
        }
        
        if (phrasalTrail.length === 0) return null;
        
        let finalSuggestion = phrasalTrail.join(" ");
        
        return {
            append: addLeadingSpaceIfNeeded(currentInput, finalSuggestion),
            replaceLen: 0,
            replaceStr: ""
        };
    }

    return null;
}

export function getBagOfWordsSpellingPrediction(currentInput: string, referenceAnswer?: string, disableChunking = false): GhostPrediction | null {
    if (!referenceAnswer) return null;
    
    const spellingMatch = currentInput.match(/[a-zA-Z0-9']+$/);
    if (!spellingMatch) return null;
    
    const spellingStr = spellingMatch[0];
    const spellingLower = spellingStr.toLowerCase();
    const spellingIndex = spellingMatch.index ?? 0;
    
    const refTokens = tokenize(referenceAnswer).filter(t => t.normalized.length > 0);
    const fullRefTokens = tokenize(referenceAnswer);
    
    const availableCounts: Record<string, number> = {};
    for (const t of refTokens) {
        availableCounts[t.normalized] = (availableCounts[t.normalized] || 0) + 1;
    }
    
    const previousInput = currentInput.slice(0, spellingIndex);
    const inputTokens = tokenize(previousInput).filter(t => t.normalized.length > 0);
    for (const t of inputTokens) {
        if (availableCounts[t.normalized] && availableCounts[t.normalized] > 0) {
            availableCounts[t.normalized] -= 1;
        }
    }
    
    const candidates = refTokens.filter(t => 
        isMorphologyOrTypoPrefix(spellingLower, t.normalized) && 
        t.normalized.length > spellingLower.length &&
        availableCounts[t.normalized] > 0
    );
    
    const uniqueNormalized = Array.from(new Set(candidates.map(t => t.normalized)));
    
    if (uniqueNormalized.length === 1) {
        const candidateToken = candidates[0];
        const rawTokenIndex = fullRefTokens.findIndex(t => t.index === candidateToken.index);
        const rawMatch = fullRefTokens[rawTokenIndex].raw;
        const replaceStr = rawMatch.slice(0, spellingStr.length);
        const isStrictPrefix = replaceStr.toLowerCase() === spellingStr.toLowerCase();
        
        const appendStr = rawMatch.slice(spellingStr.length);
        
        return {
            append: appendStr,
            replaceLen: isStrictPrefix ? 0 : spellingStr.length,
            replaceStr: isStrictPrefix ? "" : replaceStr
        };
    }
    
    // Proximity & Fuzzy Context Tie-Breaking:
    // If multiple candidates exist, use the previously typed word to anchor them.
    // e.g. typing 'thiss d' -> 'this' (idx 0), 'driver' (idx 4), 'didn't' (idx 11). 
    // It should pick 'driver' because it's much closer to 'this' than 'didn't' is!
    if (uniqueNormalized.length > 1 && inputTokens.length > 0) {
        const prevUserInput = inputTokens[inputTokens.length - 1].normalized;
        
        let bestCandidate = null;
        let minDistance = Infinity;
        let tieExists = false;
        
        // Find all indices where the previous typed word appears in the reference (allowing fuzzy typos like 'thiss')
        const prevWordIndices: number[] = [];
        for (let i = 0; i < fullRefTokens.length; i++) {
            if (isFuzzyWordMatch(prevUserInput, fullRefTokens[i].normalized)) {
                prevWordIndices.push(fullRefTokens[i].index!);
            }
        }
        
        if (prevWordIndices.length > 0) {
            for (const candidateToken of candidates) {
                const cIdx = candidateToken.index;
                if (cIdx === undefined) continue;
                
                // Find the closest occurrence of the previous word that comes BEFORE this candidate
                let closestPrev = -1;
                for (const pIdx of prevWordIndices) {
                    if (pIdx < cIdx && pIdx > closestPrev) {
                        closestPrev = pIdx;
                    }
                }
                
                if (closestPrev !== -1) {
                    const distance = cIdx - closestPrev;
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestCandidate = candidateToken;
                        tieExists = false;
                    } else if (distance === minDistance && bestCandidate?.normalized !== candidateToken.normalized) {
                        // Tie between two different words at the exact same distance!
                        tieExists = true;
                    }
                }
            }
        }
        
        if (bestCandidate && !tieExists) {
            const rawTokenIndex = fullRefTokens.findIndex(t => t.index === bestCandidate!.index);
            const rawMatch = fullRefTokens[rawTokenIndex].raw;
            const replaceStr = rawMatch.slice(0, spellingStr.length);
            const isStrictPrefix = replaceStr.toLowerCase() === spellingStr.toLowerCase();
            
            const appendStr = rawMatch.slice(spellingStr.length);
            
            return {
                append: appendStr,
                replaceLen: isStrictPrefix ? 0 : spellingStr.length,
                replaceStr: isStrictPrefix ? "" : replaceStr
            };
        }
    }
    
    return null;
}

export function getDeterministicPrediction(currentInput: string, referenceAnswer?: string, wordCount = 2, disableChunking = false) {
    // Suffix Aligned perfectly subsumes exact prefix match while being punctuation-immune!
    return (
        getSuffixAlignedPrediction(currentInput, referenceAnswer, wordCount, disableChunking) ||
        getBagOfWordsSpellingPrediction(currentInput, referenceAnswer, disableChunking)
    );
}

// ── Levenshtein Distance (for typo correction) ──
export function levenshteinDistance(a: string, b: string): number {
    const n = a.length, m = b.length;
    if (n === 0) return m;
    if (m === 0) return n;
    
    const dp: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            dp[i][j] = Math.min(
                dp[i-1][j] + 1,
                dp[i][j-1] + 1,
                dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
            );
        }
    }
    return dp[n][m];
}

/**
 * Spelling correction: when the user's completed word has no prefix match,
 * find the closest reference word by edit distance.
 * Returns the corrected word as a replacement suggestion.
 */
export function getSpellingCorrection(currentInput: string, referenceAnswer?: string): GhostPrediction | null {
    if (!referenceAnswer) return null;
    
    // Extract the last word (must be completed — followed by space or be the final word with 3+ chars)
    const wordMatch = currentInput.match(/([a-zA-Z']{3,})\s*$/);
    if (!wordMatch) return null;
    
    const userWord = wordMatch[1].toLowerCase();
    const trailingSpace = currentInput.endsWith(' ');
    
    // Only trigger on completed words (space after) or words >= 4 chars while typing
    if (!trailingSpace && userWord.length < 4) return null;
    
    const refWords = [...new Set(
        referenceAnswer.toLowerCase()
            .replace(/[^a-z'\s-]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2)
    )];
    
    // Check if userWord is already a valid reference word
    if (refWords.includes(userWord)) return null;
    
    // Check words already used by the student
    const usedWords = new Set(
        currentInput.toLowerCase()
            .replace(/[^a-z'\s-]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2)
    );
    
    let bestWord = '';
    let bestDist = Infinity;
    const maxDist = userWord.length >= 6 ? 2 : 1;
    
    for (const refWord of refWords) {
        if (usedWords.has(refWord) && refWord !== userWord) continue;
        // First letter must match for UX (avoids wild corrections)
        if (refWord[0] !== userWord[0]) continue;
        
        const dist = levenshteinDistance(userWord, refWord);
        if (dist > 0 && dist <= maxDist && dist < bestDist) {
            bestDist = dist;
            bestWord = refWord;
        }
    }
    
    if (!bestWord) return null;
    
    // Return as replacement: swap userWord → bestWord
    return {
        append: '',
        replaceLen: wordMatch[1].length + (trailingSpace ? 1 : 0),
        replaceStr: bestWord + (trailingSpace ? ' ' : ''),
    };
}

export function shouldUseRemotePrediction(currentInput: string) {
    const normalizedInput = currentInput.trim();
    if (!normalizedInput || /[.!?]\s*$/.test(normalizedInput)) {
        return false;
    }

    const tokens = tokenize(normalizedInput).filter(t => t.normalized.length > 0);
    if (tokens.length > 24) return false;

    const contentTokens = tokens.filter(token => token.normalized.length >= 4 && !STOPWORDS.has(token.normalized));
    return tokens.length >= 2 || contentTokens.length >= 1;
}

