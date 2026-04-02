import { NextResponse } from "next/server";
import { createDeepSeekClientForCurrentUser } from "@/lib/deepseek";

type GenerateRequest = {
    action: "generate";
    paragraphText?: string;
    excludedSentences?: string[];
};

type ScoreRequest = {
    action: "score";
    source_sentence_en?: string;
    imitation_prompt_cn?: string;
    user_rewrite_en?: string;
    strict_semantic_match?: boolean;
};

type RewriteGenerateResponse = {
    source_sentence_en: string;
    imitation_prompt_cn: string;
    rewrite_tips_cn: string[];
    pattern_focus_cn: string;
};

type RewriteScoreResponse = {
    total_score: number;
    dimension_scores: {
        grammar: number;
        vocabulary: number;
        semantics: number;
        imitation: number;
    };
    feedback_cn: string;
    better_version_en: string;
    copy_similarity: number;
    copy_penalty_applied: boolean;
    improvement_points_cn: string[];
    corrections?: Array<{
        segment: string;
        correction: string;
        reason: string;
        category?: string;
    }>;
};

const ALLOWED_CORRECTION_CATEGORIES = new Set([
    "grammar",
    "vocabulary",
    "spelling",
    "collocation",
]);

function normalizeWhitespace(text: string) {
    return text.replace(/\s+/g, " ").trim();
}

function normalizeSentenceIdentity(sentence: string) {
    return normalizeWhitespace(sentence).toLowerCase();
}

function tokenizeSentenceCandidates(paragraphText: string) {
    const normalized = paragraphText.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return [] as string[];

    const matches = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g) ?? [];
    const seen = new Set<string>();
    const candidates: string[] = [];

    for (const raw of matches) {
        const sentence = normalizeWhitespace(raw);
        if (!sentence) continue;

        const identity = normalizeSentenceIdentity(sentence);
        if (seen.has(identity)) continue;

        const wordCount = (sentence.match(/[A-Za-z][A-Za-z'-]*/g) ?? []).length;
        const hasLetters = /[A-Za-z]/.test(sentence);
        if (!hasLetters || wordCount < 6 || wordCount > 32) {
            continue;
        }

        seen.add(identity);
        candidates.push(sentence);
    }

    if (candidates.length > 0) return candidates;

    const fallback = normalizeWhitespace(normalized);
    return fallback ? [fallback] : [];
}

function clampScore(value: unknown, fallback: number) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeTips(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    return value
        .map((item) => (typeof item === "string" ? normalizeWhitespace(item) : ""))
        .filter(Boolean)
        .slice(0, 3);
}

function normalizeImprovementPoints(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    return value
        .map((item) => (typeof item === "string" ? normalizeWhitespace(item) : ""))
        .filter(Boolean)
        .slice(0, 4);
}

function normalizeEnglishMatchText(text: string) {
    return normalizeWhitespace(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function resolveCorrectionCategory(rawCategory: string | undefined, reason: string) {
    const normalizedCategory = normalizeWhitespace(rawCategory ?? "")
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
    if (normalizedCategory && ALLOWED_CORRECTION_CATEGORIES.has(normalizedCategory)) {
        return normalizedCategory;
    }

    const reasonText = reason.toLowerCase();
    if (reasonText.includes("语法") || reasonText.includes("时态") || reasonText.includes("主谓")) return "grammar";
    if (reasonText.includes("拼写")) return "spelling";
    if (reasonText.includes("搭配") || reasonText.includes("固定用法") || reasonText.includes("collocation")) return "collocation";
    if (reasonText.includes("词汇") || reasonText.includes("用词")) return "vocabulary";
    return null;
}

function segmentExistsInRewrite(segment: string, userRewrite: string) {
    const normalizedSegment = normalizeEnglishMatchText(segment);
    const normalizedRewrite = normalizeEnglishMatchText(userRewrite);
    if (!normalizedSegment || !normalizedRewrite) return false;
    if (normalizedRewrite.includes(normalizedSegment)) return true;

    const segmentTokens = normalizedSegment.split(" ");
    if (segmentTokens.length < 2) return false;
    const rewriteTokenSet = new Set(normalizedRewrite.split(" "));
    let hit = 0;
    for (const token of segmentTokens) {
        if (rewriteTokenSet.has(token)) hit += 1;
    }
    return hit / segmentTokens.length >= 0.8;
}

function normalizeCorrections(value: unknown, userRewrite: string) {
    if (!Array.isArray(value)) return [] as Array<{
        segment: string;
        correction: string;
        reason: string;
        category?: string;
    }>;
    return value
        .map((item) => {
            const row = typeof item === "object" && item !== null ? item as Record<string, unknown> : null;
            if (!row) return null;
            const segment = typeof row.segment === "string" ? normalizeWhitespace(row.segment) : "";
            const correction = typeof row.correction === "string" ? normalizeWhitespace(row.correction) : "";
            const reason = typeof row.reason === "string" ? normalizeWhitespace(row.reason) : "";
            if (!segment || !correction || !reason) return null;
            if (!segmentExistsInRewrite(segment, userRewrite)) return null;
            if (normalizeEnglishMatchText(segment) === normalizeEnglishMatchText(correction)) return null;

            const category = resolveCorrectionCategory(
                typeof row.category === "string" ? row.category : undefined,
                reason,
            );
            if (!category) return null;
            return { segment, correction, reason, category };
        })
        .filter((row): row is {
            segment: string;
            correction: string;
            reason: string;
            category: string;
        } => Boolean(row))
        .slice(0, 5);
}

function tokenizeWords(text: string) {
    const normalized = normalizeWhitespace(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, " ");
    return normalized.split(/\s+/).filter(Boolean);
}

function wordOverlapSimilarity(source: string, user: string) {
    const sourceWords = tokenizeWords(source);
    const userWords = tokenizeWords(user);
    if (sourceWords.length === 0 || userWords.length === 0) return 0;

    const sourceSet = new Set(sourceWords);
    let overlapCount = 0;

    for (const word of userWords) {
        if (sourceSet.has(word)) {
            overlapCount += 1;
        }
    }

    return overlapCount / Math.max(sourceWords.length, userWords.length);
}

function normalizedForEditDistance(text: string) {
    return normalizeWhitespace(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, "")
        .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

    for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost,
            );
        }
    }

    return matrix[a.length][b.length];
}

function editSimilarity(source: string, user: string) {
    const sourceNorm = normalizedForEditDistance(source);
    const userNorm = normalizedForEditDistance(user);
    if (!sourceNorm || !userNorm) return 0;
    const distance = levenshteinDistance(sourceNorm, userNorm);
    const base = Math.max(sourceNorm.length, userNorm.length);
    if (base === 0) return 0;
    return Math.max(0, 1 - distance / base);
}

function computeCopySimilarity(sourceSentence: string, userRewrite: string) {
    const overlap = wordOverlapSimilarity(sourceSentence, userRewrite);
    const editSim = editSimilarity(sourceSentence, userRewrite);
    return Number(Math.max(overlap, editSim).toFixed(3));
}

function buildScenarioShiftInspiration(sentence: string) {
    const normalized = normalizeWhitespace(sentence).toLowerCase();
    if (/^imagine\s+you\s+are\b/.test(normalized)) {
        return "想象你正在筹备一次重要比赛。";
    }
    if (/^in the past\b/.test(normalized)) {
        return "过去，很多人只能通过线下课程学习技能。";
    }
    if (/^now\b/.test(normalized) || normalized.includes("is changing")) {
        return "现在，校园里的学习方式正在快速变化。";
    }
    if (normalized.includes("more and more")) {
        return "如今，越来越多的年轻人开始重视身心健康。";
    }
    return "现在，很多团队正在尝试更灵活的协作方式。";
}

function isLikelyLiteralInspirationPrompt(
    prompt: string,
    sourceSentence: string,
    modelFlags?: { literalTranslation?: boolean; sceneShifted?: boolean },
) {
    const normalizedPrompt = normalizeWhitespace(prompt);
    if (!normalizedPrompt) return true;
    if (modelFlags?.literalTranslation === true) return true;
    if (modelFlags?.sceneShifted === false) return true;

    const metaKeywords = ["原句", "对应", "翻译", "直译", "这句英文", "英文句子", "按原句"];
    if (metaKeywords.some((keyword) => normalizedPrompt.includes(keyword))) {
        return true;
    }

    const sourcePrefix = normalizeWhitespace(sourceSentence).toLowerCase().slice(0, 18);
    if (sourcePrefix && normalizeWhitespace(prompt).toLowerCase().includes(sourcePrefix)) {
        return true;
    }

    return normalizedPrompt.length < 8;
}

function buildGenerateFallback(sentence: string): RewriteGenerateResponse {
    return {
        source_sentence_en: sentence,
        imitation_prompt_cn: buildScenarioShiftInspiration(sentence),
        rewrite_tips_cn: [
            "保持原句语法骨架，替换主语或场景。",
            "先写通顺短句，再补充细节表达。",
            "优先做同结构迁移，不要逐词翻译。",
        ],
        pattern_focus_cn: "聚焦原句句法框架，做换场景仿写。",
    };
}

function buildScoreFallback(copySimilarity: number): RewriteScoreResponse {
    const copyPenaltyApplied = copySimilarity >= 0.88;
    const baseScore = 76;
    const imitation = copyPenaltyApplied ? 52 : 76;
    const total = Math.round((baseScore + baseScore + baseScore + imitation) / 4);

    return {
        total_score: total,
        dimension_scores: {
            grammar: baseScore,
            vocabulary: baseScore,
            semantics: baseScore,
            imitation,
        },
        feedback_cn: copyPenaltyApplied
            ? "语义表达基本正确，但和原句过于接近。建议替换句式或核心搭配，提升仿写创造度。"
            : "整体表达通顺，建议进一步优化词汇层次和句式变化。",
        better_version_en: "The world of work keeps changing, so people need to update their skills continuously.",
        copy_similarity: copySimilarity,
        copy_penalty_applied: copyPenaltyApplied,
        improvement_points_cn: copyPenaltyApplied
            ? [
                "至少替换一个核心动词短语。",
                "尝试改写从句或连接词，而不是沿用原句顺序。",
                "保持同义表达，避免整段照搬。",
            ]
            : [
                "可以加入更准确的连接词增强逻辑。",
                "尝试用更丰富的词汇替换基础词。",
            ],
    };
}

async function handleGenerate(data: GenerateRequest) {
    const paragraphText = typeof data.paragraphText === "string" ? data.paragraphText : "";
    const normalizedParagraph = normalizeWhitespace(paragraphText);
    if (!normalizedParagraph) {
        return NextResponse.json({ error: "paragraphText is required" }, { status: 400 });
    }

    const candidates = tokenizeSentenceCandidates(normalizedParagraph);
    if (candidates.length === 0) {
        return NextResponse.json({ error: "No valid sentence candidates found" }, { status: 400 });
    }

    const excluded = new Set(
        (Array.isArray(data.excludedSentences) ? data.excludedSentences : [])
            .map((item) => (typeof item === "string" ? normalizeSentenceIdentity(item) : ""))
            .filter(Boolean),
    );

    const available = candidates.filter((item) => !excluded.has(normalizeSentenceIdentity(item)));
    const candidatePool = available.length > 0 ? available : candidates;

    const deepseek = await createDeepSeekClientForCurrentUser();
    const requestGeneratePayload = async (strictSceneShift: boolean, previousPrompt?: string) => {
        const completion = await deepseek.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: `你是一名英语仿写教练。请从候选句中选一句，并输出严格 JSON。\n
输出格式：\n{\n  "source_sentence_en": "必须完全等于候选中的某一句",\n  "imitation_prompt_cn": "中文灵感句（用于仿写启发）",\n  "rewrite_tips_cn": ["2-3条可执行仿写建议"],\n  "pattern_focus_cn": "本句最值得模仿的结构焦点",\n  "literal_translation": true/false,\n  "scene_shifted": true/false\n}\n\n强约束：\n1) source_sentence_en 必须逐字匹配候选句，不可改写。\n2) imitation_prompt_cn 必须是“同结构、换场景/换主语”的中文灵感句，不要逐词翻译原句。\n3) imitation_prompt_cn 禁止出现“原句/翻译/对应”这类元说明。\n4) rewrite_tips_cn 每条 8~28 字，最多 3 条。\n5) literal_translation: 若 imitation_prompt_cn 仍接近原句对应翻译则填 true。\n6) scene_shifted: 若已更换场景或主语则填 true。\n7) 所有中文请用简体中文。${strictSceneShift ? "\n8) 本次必须显式换场景，不能沿用原句语义主题。" : ""}`,
                },
                {
                    role: "user",
                    content: `段落内容：\n${normalizedParagraph}\n\n候选句（必须从这里选）：\n${candidatePool.map((sentence, idx) => `${idx + 1}. ${sentence}`).join("\n")}${previousPrompt ? `\n\n上一次灵感提示（不合格，过于像翻译）：\n${previousPrompt}\n请改成“同结构换场景”的中文灵感句。` : ""}`,
                },
            ],
            response_format: { type: "json_object" },
            temperature: 0.35,
        });

        const content = completion.choices[0]?.message?.content;
        try {
            return content ? JSON.parse(content) as Record<string, unknown> : {};
        } catch {
            return {} as Record<string, unknown>;
        }
    };

    const firstParsed = await requestGeneratePayload(false);
    const firstPicked = typeof firstParsed.source_sentence_en === "string"
        ? normalizeWhitespace(firstParsed.source_sentence_en)
        : "";
    const matchedSentence = candidatePool.find((sentence) => sentence === firstPicked) ?? candidatePool[0];
    const fallback = buildGenerateFallback(matchedSentence);

    const firstPrompt = typeof firstParsed.imitation_prompt_cn === "string"
        ? normalizeWhitespace(firstParsed.imitation_prompt_cn)
        : "";
    const firstIsLiteral = isLikelyLiteralInspirationPrompt(
        firstPrompt,
        matchedSentence,
        {
            literalTranslation: firstParsed.literal_translation === true,
            sceneShifted: typeof firstParsed.scene_shifted === "boolean" ? firstParsed.scene_shifted : undefined,
        },
    );

    const finalParsed = firstIsLiteral
        ? await requestGeneratePayload(true, firstPrompt || fallback.imitation_prompt_cn)
        : firstParsed;

    const finalPicked = typeof finalParsed.source_sentence_en === "string"
        ? normalizeWhitespace(finalParsed.source_sentence_en)
        : "";
    const finalSentence = candidatePool.find((sentence) => sentence === finalPicked) ?? matchedSentence;
    const finalFallback = buildGenerateFallback(finalSentence);

    const finalPromptRaw = typeof finalParsed.imitation_prompt_cn === "string"
        ? normalizeWhitespace(finalParsed.imitation_prompt_cn)
        : "";
    const finalPrompt = isLikelyLiteralInspirationPrompt(
        finalPromptRaw,
        finalSentence,
        {
            literalTranslation: finalParsed.literal_translation === true,
            sceneShifted: typeof finalParsed.scene_shifted === "boolean" ? finalParsed.scene_shifted : undefined,
        },
    )
        ? finalFallback.imitation_prompt_cn
        : finalPromptRaw;

    const tips = normalizeTips(finalParsed.rewrite_tips_cn);
    const result: RewriteGenerateResponse = {
        source_sentence_en: finalSentence,
        imitation_prompt_cn: finalPrompt || finalFallback.imitation_prompt_cn,
        rewrite_tips_cn: tips.length > 0 ? tips : finalFallback.rewrite_tips_cn,
        pattern_focus_cn: typeof finalParsed.pattern_focus_cn === "string" && normalizeWhitespace(finalParsed.pattern_focus_cn)
            ? normalizeWhitespace(finalParsed.pattern_focus_cn)
            : finalFallback.pattern_focus_cn,
    };

    return NextResponse.json(result);
}

async function handleScore(data: ScoreRequest) {
    const sourceSentence = typeof data.source_sentence_en === "string"
        ? normalizeWhitespace(data.source_sentence_en)
        : "";
    const promptCn = typeof data.imitation_prompt_cn === "string"
        ? normalizeWhitespace(data.imitation_prompt_cn)
        : "";
    const userRewrite = typeof data.user_rewrite_en === "string"
        ? normalizeWhitespace(data.user_rewrite_en)
        : "";
    const strictSemanticMatch = data.strict_semantic_match === true;

    if (!sourceSentence || !promptCn || !userRewrite) {
        return NextResponse.json(
            { error: "source_sentence_en, imitation_prompt_cn, user_rewrite_en are required" },
            { status: 400 },
        );
    }

    const copySimilarity = computeCopySimilarity(sourceSentence, userRewrite);
    const deepseek = await createDeepSeekClientForCurrentUser();
    const completion = await deepseek.chat.completions.create({
        model: "deepseek-chat",
        messages: [
            {
                role: "system",
                content: `你是一名中译英仿写评分教练。请根据“原句”和“学生仿写”进行评分，并输出严格 JSON。\n\n输出格式：\n{\n  "dimension_scores": {\n    "grammar": 0-100整数,\n    "vocabulary": 0-100整数,\n    "semantics": 0-100整数,\n    "imitation": 0-100整数\n  },\n  "feedback_cn": "2-3句中文总评",\n  "better_version_en": "更优英文版本",\n  "improvement_points_cn": ["2-4条改进建议"],\n  "corrections": [\n    { "segment": "学生原句错误片段", "correction": "建议改为...", "reason": "中文原因", "category": "grammar|vocabulary|spelling|collocation" }\n  ]\n}\n\n评分标准：\n- grammar: 语法正确性\n- vocabulary: 词汇准确与层次\n- semantics: 句子本身的语义清晰度、完整性与自然度（不是强制对齐中文提示）\n- imitation: 与原句结构框架的贴合度（可替换主语/场景/词汇）\n\n关键约束：\n1) “仿写中文”默认只是灵感提示，不是硬性答案。\n2) 只有在 strictSemanticMatch=true 时，才对“与中文提示一致”做严格要求。\n3) 如果学生句子语法自然、语义完整，即使场景和中文提示不同，也不能把 semantics 打很低。\n4) corrections 只允许“可定位的明确错误”（语法/词汇/拼写/搭配）。若没有明确错误，必须返回空数组 []。\n5) 禁止把纯风格偏好、可改可不改的表达写进 corrections。\n6) 全部中文说明用简体中文。\n7) better_version_en 必须是自然英文句子。\n8) 不要输出 markdown。`,
            },
            {
                role: "user",
                content: `原句：${sourceSentence}\n仿写中文提示：${promptCn}\n严格语义匹配模式：${strictSemanticMatch ? "是" : "否"}\n学生仿写：${userRewrite}`,
            },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content;
    let parsed: Record<string, unknown> = {};

    try {
        parsed = content ? JSON.parse(content) : {};
    } catch {
        parsed = {};
    }

    const parsedDimension = typeof parsed.dimension_scores === "object" && parsed.dimension_scores !== null
        ? parsed.dimension_scores as Record<string, unknown>
        : {};

    const fallback = buildScoreFallback(copySimilarity);
    const grammar = clampScore(parsedDimension.grammar, fallback.dimension_scores.grammar);
    const vocabulary = clampScore(parsedDimension.vocabulary, fallback.dimension_scores.vocabulary);
    let semantics = clampScore(parsedDimension.semantics, fallback.dimension_scores.semantics);
    let imitation = clampScore(parsedDimension.imitation, fallback.dimension_scores.imitation);

    if (!strictSemanticMatch) {
        const qualityFloor = Math.min(grammar, vocabulary);
        if (qualityFloor >= 75 && semantics + 20 < qualityFloor) {
            semantics = Math.max(semantics, qualityFloor - 10);
        }
    }

    let copyPenaltyApplied = false;
    if (copySimilarity >= 0.88) {
        copyPenaltyApplied = true;
        const penalty = copySimilarity >= 0.95 ? 40 : (copySimilarity >= 0.9 ? 30 : 20);
        imitation = Math.max(0, imitation - penalty);
    }

    const totalScore = Math.round((grammar + vocabulary + semantics + imitation) / 4);
    const improvementPoints = normalizeImprovementPoints(parsed.improvement_points_cn);
    const corrections = normalizeCorrections(parsed.corrections, userRewrite);

    const feedbackRaw = typeof parsed.feedback_cn === "string" && normalizeWhitespace(parsed.feedback_cn)
        ? normalizeWhitespace(parsed.feedback_cn)
        : fallback.feedback_cn;

    const feedback = copyPenaltyApplied
        ? `${feedbackRaw} 注意：你的句子与原句相似度较高（${Math.round(copySimilarity * 100)}%），本次已按“仿写度”降分。`
        : feedbackRaw;

    const result: RewriteScoreResponse = {
        total_score: clampScore(totalScore, fallback.total_score),
        dimension_scores: {
            grammar,
            vocabulary,
            semantics,
            imitation,
        },
        feedback_cn: feedback,
        better_version_en: typeof parsed.better_version_en === "string" && normalizeWhitespace(parsed.better_version_en)
            ? normalizeWhitespace(parsed.better_version_en)
            : fallback.better_version_en,
        copy_similarity: copySimilarity,
        copy_penalty_applied: copyPenaltyApplied,
        improvement_points_cn: improvementPoints.length > 0 ? improvementPoints : fallback.improvement_points_cn,
        corrections,
    };

    return NextResponse.json(result);
}

export async function POST(req: Request) {
    try {
        const body = await req.json() as GenerateRequest | ScoreRequest;

        if (!body || typeof body !== "object" || !("action" in body)) {
            return NextResponse.json({ error: "action is required" }, { status: 400 });
        }

        if (body.action === "generate") {
            return await handleGenerate(body);
        }

        if (body.action === "score") {
            return await handleScore(body);
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        console.error("rewrite-practice route error:", error);
        return NextResponse.json({ error: "Failed to process rewrite practice" }, { status: 500 });
    }
}
