export interface RebuildTokenInstance {
    id: string;
    text: string;
    origin: "answer" | "distractor";
    repeatIndex?: number;
    repeatTotal?: number;
}

export interface RebuildPassageSegmentDraftState {
    segmentIndex: number;
    availableTokens: RebuildTokenInstance[];
    answerTokens: RebuildTokenInstance[];
    typingBuffer: string;
    replayCount: number;
    editCount: number;
    startedAt: number | null;
    tokenOrder: Record<string, number>;
}

interface RebuildPassageDraftSegmentInput {
    id: string;
    tokenBank: string[];
    distractorTokens: string[];
}

interface GuidedScriptKeyInput {
    chinese: string;
    reference_english: string;
    _topicMeta?: {
        topic?: string | null;
    } | null;
}

const IPA_SENTENCE_WORD_REGEX = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const IPA_VOWEL_START_REGEX = /^[ˈˌ]?[iɪeɛæɑɒɔoʊuʊʌəɜɝɚaɐ]/i;
const IPA_CONSONANT_END_REGEX = /[pbtdkgfvðθszʃʒhmnŋlrɹwjʧʤxɾ]$/i;

export function normalizeRebuildTokenForMatch(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeIpaValue(rawIpa: string) {
    return rawIpa.replace(/^[/[\s]+|[/\]\s]+$/g, "").trim();
}

export function buildRebuildTokenInstances(params: {
    tokenBank: string[];
    distractorTokens: string[];
    prefix: string;
}) {
    const { tokenBank, distractorTokens, prefix } = params;
    const distractorSet = new Set(distractorTokens);
    const tokenTotals = new Map<string, number>();
    const tokenSeen = new Map<string, number>();

    for (const token of tokenBank) {
        tokenTotals.set(token, (tokenTotals.get(token) ?? 0) + 1);
    }

    const tokenInstances: RebuildTokenInstance[] = tokenBank.map((text, index) => ({
        id: `${prefix}-token-${index}-${text}`,
        text,
        origin: distractorSet.has(text) ? "distractor" : "answer",
        repeatIndex: (() => {
            const nextIndex = (tokenSeen.get(text) ?? 0) + 1;
            tokenSeen.set(text, nextIndex);
            return nextIndex;
        })(),
        repeatTotal: tokenTotals.get(text) ?? 1,
    }));

    return {
        tokenInstances,
        tokenOrder: Object.fromEntries(tokenInstances.map((token, index) => [token.id, index])),
    };
}

export function createRebuildPassageDraftState(
    segment: RebuildPassageDraftSegmentInput,
    index: number,
): RebuildPassageSegmentDraftState {
    const { tokenInstances, tokenOrder } = buildRebuildTokenInstances({
        tokenBank: segment.tokenBank,
        distractorTokens: segment.distractorTokens,
        prefix: segment.id,
    });

    return {
        segmentIndex: index,
        availableTokens: tokenInstances,
        answerTokens: [],
        typingBuffer: "",
        replayCount: 0,
        editCount: 0,
        startedAt: null,
        tokenOrder,
    };
}

export function areRebuildTokenOrdersEqual(left: Record<string, number>, right: Record<string, number>) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => left[key] === right[key]);
}

export function pickPreferredRebuildTokenCandidate(params: {
    candidates: RebuildTokenInstance[];
    typedRaw: string;
    expectedRaw?: string | null;
}) {
    const { candidates, typedRaw, expectedRaw } = params;
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const typedTrimmed = typedRaw.trim();
    const typedNormalized = normalizeRebuildTokenForMatch(typedTrimmed);
    const expectedTrimmed = expectedRaw?.trim() ?? "";
    const expectedNormalized = normalizeRebuildTokenForMatch(expectedTrimmed);

    const scoredCandidates = candidates
        .map((token, index) => {
            const tokenNormalized = normalizeRebuildTokenForMatch(token.text);
            let score = 0;

            if (expectedTrimmed && token.text === expectedTrimmed) score += 120;
            if (expectedNormalized && tokenNormalized === expectedNormalized) score += 90;
            if (typedTrimmed && token.text === typedTrimmed) score += 45;
            if (typedNormalized && tokenNormalized === typedNormalized) score += 35;
            if (expectedTrimmed && token.text.toLowerCase() === expectedTrimmed.toLowerCase()) score += 20;
            if (typedTrimmed && token.text.toLowerCase() === typedTrimmed.toLowerCase()) score += 10;

            return {
                token,
                score,
                index,
            };
        })
        .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.index - right.index;
        });

    return scoredCandidates[0]?.token ?? null;
}

export function getGuidedScriptKey(
    drillData: GuidedScriptKeyInput,
    elo: number,
    contextTopic?: string,
) {
    return JSON.stringify({
        chinese: drillData.chinese,
        referenceEnglish: drillData.reference_english,
        topic: drillData._topicMeta?.topic || contextTopic || "",
        elo,
    });
}

export function buildConnectedSentenceIpa(
    sentence: string,
    getWordIpa: (text: string) => string,
) {
    const words = sentence.match(IPA_SENTENCE_WORD_REGEX) ?? [];
    if (words.length === 0) return "";

    const ipaWords = words.map((word) => {
        const resolved = normalizeIpaValue(getWordIpa(word));
        return resolved || word.toLowerCase();
    });

    let combined = ipaWords[0] ?? "";
    for (let i = 1; i < ipaWords.length; i += 1) {
        const prev = ipaWords[i - 1] ?? "";
        const next = ipaWords[i] ?? "";
        const useLiaison = IPA_CONSONANT_END_REGEX.test(prev) && IPA_VOWEL_START_REGEX.test(next);
        combined += useLiaison ? `‿${next}` : ` ${next}`;
    }

    return combined ? `/${combined}/` : "";
}

export function buildGeneratedRebuildBankContentKey(topic: string, referenceEnglish: string) {
    const normalizedTopic = topic.trim().toLowerCase();
    const normalizedEnglish = referenceEnglish
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return `${normalizedTopic}::${normalizedEnglish}`;
}

export function getSentenceAudioCacheKey(text: string) {
    return `SENTENCE_${text}`;
}
