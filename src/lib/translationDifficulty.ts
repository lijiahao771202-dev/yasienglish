export type DifficultyStatus = 'TOO_EASY' | 'TOO_HARD' | 'MATCHED';
export type TranslationVariant = "sentence" | "passage";

export interface WordRange {
    min: number;
    max: number;
}

export interface TranslationSyntaxBand {
    scaleSummary: string;
    promptInstruction: string;
}

export interface TranslationDifficultyTier {
    level: string;
    tier: string;
    cefr: string;
    minElo: number;
    maxElo: number | null;
    desc: string;
    entryWordRange: WordRange;
    exitWordRange: WordRange;
    tolerance: number;
    syntaxBands: {
        entry: TranslationSyntaxBand;
        mid: TranslationSyntaxBand;
        exit: TranslationSyntaxBand;
    };
}

export interface TranslationDifficultyTarget {
    tier: TranslationDifficultyTier;
    progress: number;
    wordRange: WordRange;
    tolerance: number;
    syntaxBand: TranslationSyntaxBand;
    variant: TranslationVariant;
}

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SENTENCE_TRANSLATION_DIFFICULTY_TIERS: TranslationDifficultyTier[] = [
    {
        level: "Level 1",
        tier: "新手",
        cefr: "A1",
        minElo: 0,
        maxElo: 399,
        desc: "基础主干句",
        entryWordRange: { min: 4, max: 6 },
        exitWordRange: { min: 4, max: 6 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: "One ultra-short single sentence with only a basic subject-verb core.",
                promptInstruction: "WORD COUNT: 4-6 words. Write ONE single English sentence. Use only a plain SVO or SVC pattern. Practice simple present or simple past. No clauses, no passive voice, no infinitive or gerund phrases.",
            },
            mid: {
                scaleSummary: "Still one single sentence, but allow one very small modifier.",
                promptInstruction: "WORD COUNT: 4-6 words. Keep ONE single English sentence. Allow one basic adjective or adverb, but keep a plain subject-verb core. No clauses, no passive voice.",
            },
            exit: {
                scaleSummary: "Single short sentence with clean control over articles, plurals, and prepositions.",
                promptInstruction: "WORD COUNT: 4-6 words. Keep ONE single English sentence with a clean subject-verb-object or subject-verb-complement spine. Focus on articles, plurals, and basic prepositions.",
            },
        },
    },
    {
        level: "Level 2",
        tier: "青铜",
        cefr: "A2-",
        minElo: 400,
        maxElo: 799,
        desc: "否定、疑问、情态",
        entryWordRange: { min: 5, max: 7 },
        exitWordRange: { min: 5, max: 7 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: "A single short sentence with negation or a time/place adverbial.",
                promptInstruction: "WORD COUNT: 5-7 words. Keep ONE single English sentence. Practice negation or a time/place adverbial. No subordinate clauses, no passive voice.",
            },
            mid: {
                scaleSummary: "Still a short sentence, now allowing one modal verb or question pattern.",
                promptInstruction: "WORD COUNT: 5-7 words. Keep ONE single English sentence. You may use ONE modal verb or one simple question pattern. Do not add a second clause.",
            },
            exit: {
                scaleSummary: "Short sentence with one basic coordinating move inside the same sentence spine.",
                promptInstruction: "WORD COUNT: 5-7 words. Keep ONE single English sentence. You may use one short coordinating move or a simple subject-complement pattern, but do not turn it into two clauses.",
            },
        },
    },
    {
        level: "Level 3",
        tier: "白银",
        cefr: "A2+",
        minElo: 800,
        maxElo: 1199,
        desc: "轻结构变形",
        entryWordRange: { min: 6, max: 9 },
        exitWordRange: { min: 6, max: 9 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: "Single sentence with one light grammar move such as a comparative or there-be pattern.",
                promptInstruction: "WORD COUNT: 6-9 words. Keep ONE single English sentence. Use at most ONE light structure such as a comparative or a there-be pattern. No passive voice or relative clauses.",
            },
            mid: {
                scaleSummary: "Single sentence with one infinitive or gerund phrase, while staying compact.",
                promptInstruction: "WORD COUNT: 6-9 words. Keep ONE single English sentence. You may use ONE infinitive or gerund phrase, but do not stack structures.",
            },
            exit: {
                scaleSummary: "Single sentence with one simple reason/condition move, but still one clear core.",
                promptInstruction: "WORD COUNT: 6-9 words. Keep ONE single English sentence. You may use ONE simple because/if/when structure, but the sentence must stay short and linear.",
            },
        },
    },
    {
        level: "Level 4",
        tier: "黄金",
        cefr: "B1",
        minElo: 1200,
        maxElo: 1599,
        desc: "被动、形式主语、宾语从句",
        entryWordRange: { min: 7, max: 11 },
        exitWordRange: { min: 7, max: 11 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: "A single sentence with one medium grammar frame, still compact and readable.",
                promptInstruction: "WORD COUNT: 7-11 words. Keep ONE single English sentence. You may use ONE medium structure such as passive voice or a formal subject pattern. Do not stack clauses.",
            },
            mid: {
                scaleSummary: "Single sentence using one passive voice, formal subject, or short object clause.",
                promptInstruction: "WORD COUNT: 7-11 words. Keep ONE single English sentence. You may use ONE passive voice, one formal subject pattern, or one short object clause. Only one advanced move is allowed.",
            },
            exit: {
                scaleSummary: "Single sentence with one fixed B1 frame, but still concise.",
                promptInstruction: "WORD COUNT: 7-11 words. Keep ONE single English sentence. Use one well-controlled passive voice, formal subject, or object clause pattern, and keep the sentence concise.",
            },
        },
    },
    {
        level: "Level 5",
        tier: "铂金",
        cefr: "B2",
        minElo: 1600,
        maxElo: 1999,
        desc: "嵌入与压缩",
        entryWordRange: { min: 8, max: 13 },
        exitWordRange: { min: 8, max: 13 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: "A single sentence with one embedded structure, but still one main sentence spine.",
                promptInstruction: "WORD COUNT: 8-13 words. Keep ONE single English sentence. You may use ONE relative clause, one non-finite adverbial, or one nominalized phrase, but not more than one.",
            },
            mid: {
                scaleSummary: "Single sentence that compresses logic through one concession, result, or embedded phrase.",
                promptInstruction: "WORD COUNT: 8-13 words. Keep ONE single English sentence. Use at most ONE embedded structure such as a relative clause, a non-finite phrase, or a short result/concession pattern.",
            },
            exit: {
                scaleSummary: "Compact B2 sentence with one deliberate compression move.",
                promptInstruction: "WORD COUNT: 8-13 words. Keep ONE single English sentence. Compress information through ONE relative clause, non-finite phrase, or nominalized expression, but avoid clause stacking.",
            },
        },
    },
    {
        level: "Level 6",
        tier: "钻石",
        cefr: "C1",
        minElo: 2000,
        maxElo: 2399,
        desc: "高阶语法动作",
        entryWordRange: { min: 9, max: 15 },
        exitWordRange: { min: 9, max: 15 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: "Single sentence with one high-level grammar move such as inversion or subjunctive.",
                promptInstruction: "WORD COUNT: 9-15 words. Keep ONE single English sentence. Use at most ONE high-level move such as inversion, subjunctive mood, or a subject clause. Do not pile techniques together.",
            },
            mid: {
                scaleSummary: "Single sentence with one advanced rhetorical or clause-level pattern.",
                promptInstruction: "WORD COUNT: 9-15 words. Keep ONE single English sentence. You may use ONE inversion, one subjunctive pattern, or one subject/predicative clause. Maintain one clear sentence core.",
            },
            exit: {
                scaleSummary: "Compact C1 sentence that stays controlled despite one advanced grammar move.",
                promptInstruction: "WORD COUNT: 9-15 words. Keep ONE single English sentence. Use one advanced move such as inversion or subjunctive, but keep the sentence compact and readable.",
            },
        },
    },
    {
        level: "Level 7",
        tier: "大师",
        cefr: "C2",
        minElo: 2400,
        maxElo: null,
        desc: "高密度高级单句",
        entryWordRange: { min: 10, max: 18 },
        exitWordRange: { min: 10, max: 18 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: "Dense advanced single sentence, still capped in length and built around one core proposition.",
                promptInstruction: "WORD COUNT: 10-18 words. Keep ONE genuinely single English sentence. Make it dense and advanced, but do not exceed one clear sentence core or turn it into a stitched long sentence.",
            },
            mid: {
                scaleSummary: "High-density single sentence with advanced diction and one deliberate structural move.",
                promptInstruction: "WORD COUNT: 10-18 words. Keep ONE genuinely single English sentence. Use advanced diction and one deliberate structural move, but avoid semicolons, multi-sentence stitching, or clause overload.",
            },
            exit: {
                scaleSummary: "Maximum sentence-mode density while remaining one controlled sentence.",
                promptInstruction: "WORD COUNT: 10-18 words. Keep ONE genuinely single English sentence. Maximize precision and density, but keep it controlled, concise, and unmistakably a single sentence.",
            },
        },
    },
];

const PASSAGE_TRANSLATION_DIFFICULTY_TIERS: TranslationDifficultyTier[] = [
    {
        level: 'Level 1',
        tier: '新手',
        cefr: 'A1',
        minElo: 0,
        maxElo: 399,
        desc: '简单SVO句子',
        entryWordRange: { min: 5, max: 6 },
        exitWordRange: { min: 6, max: 7 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: 'Only one ultra-simple SVO sentence with daily words.',
                promptInstruction: 'WORD COUNT: 5-6 words. Use ONLY one ultra-simple sentence (Subject + Verb + Object). No clauses. Top 200 daily words only.',
            },
            mid: {
                scaleSummary: 'Keep one very simple SVO sentence and allow one adverb or adjective.',
                promptInstruction: 'WORD COUNT: 5-7 words. Keep ONE very simple SVO sentence. Allow one easy adverb or adjective, but no clauses.',
            },
            exit: {
                scaleSummary: 'Still simple SVO, slightly fuller daily expression.',
                promptInstruction: 'WORD COUNT: 6-7 words. Keep ONE simple SVO sentence with familiar daily vocabulary. No clauses or passive voice.',
            },
        },
    },
    {
        level: 'Level 2',
        tier: '青铜',
        cefr: 'A2-',
        minElo: 400,
        maxElo: 799,
        desc: '短句为主，尾段允许简单并列',
        entryWordRange: { min: 6, max: 7 },
        exitWordRange: { min: 8, max: 10 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: 'Single short daily-life sentence with no clause stacking.',
                promptInstruction: 'WORD COUNT: 6-7 words. Use ONE short daily-life sentence. No subordinate clauses.',
            },
            mid: {
                scaleSummary: 'Simple daily sentence, optionally linked by and/but/so once.',
                promptInstruction: 'WORD COUNT: 7-9 words. Keep ONE short sentence. At most use one simple connector like "and", "but", or "so".',
            },
            exit: {
                scaleSummary: 'Daily sentence, exit side may use and/but/so to connect two short chunks.',
                promptInstruction: 'WORD COUNT: 8-10 words. ONE daily-life sentence. May use one simple connector like "and", "but", or "so" to connect TWO short chunks.',
            },
        },
    },
    {
        level: 'Level 3',
        tier: '白银',
        cefr: 'A2+',
        minElo: 800,
        maxElo: 1199,
        desc: '单主句，后段允许一个简单从句',
        entryWordRange: { min: 8, max: 10 },
        exitWordRange: { min: 11, max: 13 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: 'One clear main sentence with common vocabulary only.',
                promptInstruction: 'WORD COUNT: 8-10 words. ONE clear main sentence. Common vocabulary only. No relative clauses.',
            },
            mid: {
                scaleSummary: 'Main sentence, may add one light because/when/if clause.',
                promptInstruction: 'WORD COUNT: 9-12 words. ONE main sentence. May add ONE simple clause using "because", "when", or "if". NO relative clauses.',
            },
            exit: {
                scaleSummary: 'Still controlled length, one simple because/when/if clause allowed.',
                promptInstruction: 'WORD COUNT: 11-13 words. ONE main sentence. May have ONE simple clause (because/when/if). NO relative clauses (that/which/who).',
            },
        },
    },
    {
        level: 'Level 4',
        tier: '黄金',
        cefr: 'B1',
        minElo: 1200,
        maxElo: 1599,
        desc: '允许一个被动或关系从句',
        entryWordRange: { min: 11, max: 13 },
        exitWordRange: { min: 15, max: 18 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: 'Slightly more complex sentence, but keep one clear clause spine.',
                promptInstruction: 'WORD COUNT: 11-13 words. Keep one clear sentence spine. You may use a slightly richer phrase, but do NOT stack multiple clauses.',
            },
            mid: {
                scaleSummary: 'Keep one main sentence and richer phrasing without length-heavy structures.',
                promptInstruction: 'WORD COUNT: 13-16 words. Keep ONE main sentence. Use slightly richer wording. Do NOT use passive voice. Do NOT use relative clauses. If the sentence risks going over 16 words, simplify it.',
            },
            exit: {
                scaleSummary: 'One relative clause or one passive voice with still-linear structure.',
                promptInstruction: 'WORD COUNT: 15-18 words. May use ONE relative clause or ONE passive voice. Keep structure linear and readable. Do not combine multiple advanced structures.',
            },
        },
    },
    {
        level: 'Level 5',
        tier: '铂金',
        cefr: 'B2',
        minElo: 1600,
        maxElo: 1999,
        desc: '条件句或分词结构',
        entryWordRange: { min: 15, max: 18 },
        exitWordRange: { min: 20, max: 24 },
        tolerance: 1,
        syntaxBands: {
            entry: {
                scaleSummary: 'Low B2 entry: richer wording, but still one core structure.',
                promptInstruction: 'WORD COUNT: 15-18 words. Use richer wording, but keep ONE core structure. Avoid stacking multiple advanced patterns.',
            },
            mid: {
                scaleSummary: 'Introduce one conditional or one participle phrase.',
                promptInstruction: 'WORD COUNT: 17-21 words. May use ONE conditional or ONE participle phrase. Keep the sentence easy to parse.',
            },
            exit: {
                scaleSummary: 'Conditional or participle phrase allowed, but low half should not combine them.',
                promptInstruction: 'WORD COUNT: 20-24 words. Use ONE conditional sentence or ONE participle phrase. Do not combine both in the same sentence.',
            },
        },
    },
    {
        level: 'Level 6',
        tier: '钻石',
        cefr: 'C1',
        minElo: 2000,
        maxElo: 2399,
        desc: '倒装或虚拟语气，保持单核心',
        entryWordRange: { min: 20, max: 24 },
        exitWordRange: { min: 27, max: 32 },
        tolerance: 2,
        syntaxBands: {
            entry: {
                scaleSummary: 'Entry C1: nuanced vocabulary with one clearly readable structure.',
                promptInstruction: 'WORD COUNT: 20-24 words. Use nuanced vocabulary, but keep ONE readable core structure.',
            },
            mid: {
                scaleSummary: 'Allow one inversion or one subjunctive pattern.',
                promptInstruction: 'WORD COUNT: 23-28 words. May use ONE inversion or ONE subjunctive pattern. Keep the sentence coherent and avoid nesting.',
            },
            exit: {
                scaleSummary: 'Higher C1 density, but still one main rhetorical move.',
                promptInstruction: 'WORD COUNT: 27-32 words. You may use ONE inversion or ONE subjunctive structure, but maintain ONE clear core idea.',
            },
        },
    },
    {
        level: 'Level 7',
        tier: '大师',
        cefr: 'C2',
        minElo: 2400,
        maxElo: 2799,
        desc: '复杂复句但避免无意义拉长',
        entryWordRange: { min: 28, max: 34 },
        exitWordRange: { min: 38, max: 45 },
        tolerance: 2,
        syntaxBands: {
            entry: {
                scaleSummary: 'Dense but controlled C2 sentence with strong readability.',
                promptInstruction: 'WORD COUNT: 28-34 words. Create a dense but still readable C2-level sentence. Avoid padding.',
            },
            mid: {
                scaleSummary: 'Allow layered logic, but keep the sentence purposeful.',
                promptInstruction: 'WORD COUNT: 32-40 words. Allow layered logic and richer connectors, but do not add length without meaning.',
            },
            exit: {
                scaleSummary: 'Complex multi-part sentence, still concise for its level.',
                promptInstruction: 'WORD COUNT: 38-45 words. Use a complex multi-part sentence, but avoid unnecessary stretching.',
            },
        },
    },
    {
        level: 'Level 8',
        tier: '王者',
        cefr: 'C2+',
        minElo: 2800,
        maxElo: 3199,
        desc: '高复杂度但继续收紧长度',
        entryWordRange: { min: 40, max: 48 },
        exitWordRange: { min: 52, max: 60 },
        tolerance: 2,
        syntaxBands: {
            entry: {
                scaleSummary: 'High complexity starts here, but stay compact for the tier.',
                promptInstruction: 'WORD COUNT: 40-48 words. High complexity is allowed, but keep the sentence compact for the tier.',
            },
            mid: {
                scaleSummary: 'Literary vocabulary may appear, but structure must remain interpretable.',
                promptInstruction: 'WORD COUNT: 46-54 words. You may use literary or abstract vocabulary, but the structure must stay interpretable.',
            },
            exit: {
                scaleSummary: 'Very hard, but still controlled rather than bloated.',
                promptInstruction: 'WORD COUNT: 52-60 words. Make it very hard, but keep the sentence controlled instead of bloated.',
            },
        },
    },
    {
        level: 'Level 9',
        tier: '处决',
        cefr: '∞',
        minElo: 3200,
        maxElo: null,
        desc: '惩罚级难度，但低于旧版长度',
        entryWordRange: { min: 55, max: 68 },
        exitWordRange: { min: 72, max: 85 },
        tolerance: 2,
        syntaxBands: {
            entry: {
                scaleSummary: 'Punishment tier entry: very hard, but not artificially bloated.',
                promptInstruction: 'WORD COUNT: 55-68 words. Extremely hard. Use rare vocabulary and advanced structure, but do not pad the sentence.',
            },
            mid: {
                scaleSummary: 'Punishment tier mid: dense specialist or literary language allowed.',
                promptInstruction: 'WORD COUNT: 63-76 words. Extremely hard. Specialist or literary language is allowed. Keep the sentence purposeful.',
            },
            exit: {
                scaleSummary: 'Punishment tier exit: maximal difficulty, but still within a controlled range.',
                promptInstruction: 'WORD COUNT: 72-85 words. Maximum difficulty. Use advanced structure and rare vocabulary, but keep the range controlled.',
            },
        },
    },
];

function getTranslationDifficultyTiers(variant: TranslationVariant) {
    return variant === "passage"
        ? PASSAGE_TRANSLATION_DIFFICULTY_TIERS
        : SENTENCE_TRANSLATION_DIFFICULTY_TIERS;
}

export function getTranslationDifficultyTier(elo: number, variant: TranslationVariant = "sentence"): TranslationDifficultyTier {
    return getTranslationDifficultyTiers(variant).find((tier) => {
        if (tier.maxElo === null) return elo >= tier.minElo;
        return elo >= tier.minElo && elo <= tier.maxElo;
    }) || getTranslationDifficultyTiers(variant)[0];
}

export function getTranslationTierProgress(elo: number, tier = getTranslationDifficultyTier(elo, "sentence")) {
    const upperBound = tier.maxElo ?? (tier.minElo + 399);
    const span = Math.max(1, upperBound - tier.minElo);
    return clamp((elo - tier.minElo) / span, 0, 1);
}

export function getTranslationDifficultyTarget(elo: number, variant: TranslationVariant = "sentence"): TranslationDifficultyTarget {
    const tier = getTranslationDifficultyTier(elo, variant);
    const progress = getTranslationTierProgress(elo, tier);
    const wordRange = {
        min: Math.round(lerp(tier.entryWordRange.min, tier.exitWordRange.min, progress)),
        max: Math.round(lerp(tier.entryWordRange.max, tier.exitWordRange.max, progress)),
    };

    let syntaxBand = tier.syntaxBands.mid;
    if (progress < 1 / 3) syntaxBand = tier.syntaxBands.entry;
    else if (progress > 2 / 3) syntaxBand = tier.syntaxBands.exit;

    return {
        tier,
        progress,
        wordRange,
        tolerance: tier.tolerance,
        syntaxBand,
        variant,
    };
}

export function buildTranslationDifficultyScale(variant: TranslationVariant = "sentence"): string {
    return getTranslationDifficultyTiers(variant).map((tier) => {
        const eloRange = tier.maxElo === null
            ? `${tier.minElo}+`
            : `${tier.minElo}-${tier.maxElo + 1}`;

        return `- ${eloRange} (${tier.cefr} ${tier.tier}): ${tier.syntaxBands.entry.scaleSummary} ${tier.entryWordRange.min}-${tier.entryWordRange.max} words on entry, ${tier.exitWordRange.min}-${tier.exitWordRange.max} words near promotion.`;
    }).join('\n');
}

export function countWords(text: string): number {
    return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

function getSentenceModeStructureIssues(text: string) {
    const trimmed = text.trim();
    const issues: string[] = [];

    if (/[;:]/.test(trimmed)) {
        issues.push("sentence mode forbids semicolons or colons");
    }

    const sentenceFragments = trimmed
        .split(/[.!?]+/)
        .map((fragment) => fragment.trim())
        .filter(Boolean);

    if (sentenceFragments.length > 1) {
        issues.push("sentence mode requires exactly one independent sentence");
    }

    return issues;
}

export function validateTranslationDifficulty(text: string, elo: number, variant: TranslationVariant = "sentence") {
    const target = getTranslationDifficultyTarget(elo, variant);
    const actualWordCount = countWords(text);
    const min = Math.max(1, target.wordRange.min - target.tolerance);
    const max = target.wordRange.max + target.tolerance;
    let status: DifficultyStatus = actualWordCount < min
        ? 'TOO_EASY'
        : actualWordCount > max
            ? 'TOO_HARD'
            : 'MATCHED';
    const issues: string[] = [];

    if (variant === "sentence") {
        issues.push(...getSentenceModeStructureIssues(text));
        if (issues.length > 0) {
            status = "TOO_HARD";
        }
    }

    return {
        ...target,
        actualWordCount,
        validationRange: { min, max },
        status,
        issues,
        isValid: status === 'MATCHED' && issues.length === 0,
    };
}

export function buildTranslationRetryInstruction(params: {
    attempt: number;
    maxAttempts: number;
    actualWordCount: number;
    status: DifficultyStatus;
    target: TranslationDifficultyTarget;
}) {
    const { attempt, maxAttempts, actualWordCount, status, target } = params;
    const direction = status === 'TOO_EASY' ? 'too short / too easy' : 'too long / too hard';
    const validationMin = Math.max(1, target.wordRange.min - target.tolerance);
    const validationMax = target.wordRange.max + target.tolerance;
    const correctiveInstruction = status === 'TOO_EASY'
        ? `- Next attempt MUST stay within ${validationMin}-${validationMax} words.\n- Add one short detail or one targeted grammar move, but keep ONE clear sentence.`
        : target.variant === "sentence"
            ? `- Next attempt MUST stay within ${validationMin}-${validationMax} words.\n- To shorten it, remove any semicolon, second clause, or extra modifier.\n- Keep it as ONE genuine sentence instead of a stitched sentence pair.`
            : `- Next attempt MUST stay within ${validationMin}-${validationMax} words.\n- To shorten it, remove any passive voice, relative clause, or extra modifier.\n- Prefer a direct, linear sentence over a more elaborate structure.`;

    return `
RETRY FEEDBACK (${attempt}/${maxAttempts}):
- Previous attempt was ${direction}.
- Previous word count: ${actualWordCount}
- Target range for current Elo: ${target.wordRange.min}-${target.wordRange.max}
- Validation range after tolerance: ${validationMin}-${validationMax}
${correctiveInstruction}
- Keep the same topic and style, but regenerate a NEW sentence that matches the current Elo more closely.
- Do NOT paraphrase the failed attempt. Start over.
`.trim();
}
