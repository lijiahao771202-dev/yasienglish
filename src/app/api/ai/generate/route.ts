import { NextResponse } from "next/server";
import { deepseek } from "@/lib/deepseek";
import { pickAIGenerationTopicSeed, type TopicSelection } from "@/lib/content-topic-pool";
import {
    getLongformLengthTierMeta,
    getLongformStyleMeta,
    LONGFORM_LENGTH_TIERS,
    LONGFORM_STYLE_OPTIONS,
    normalizeAIGenerationMode,
    normalizeLongformLengthTierId,
    normalizeLongformStyleId,
    type AIGenerationMode,
    type LongformLengthTierId,
    type LongformStyleId,
} from "@/lib/ai-reading-generation";

type Difficulty = "cet4" | "cet6" | "ielts";

interface DifficultyConfig {
    label: string;
    cefrLevel: string;
    wordRange: string;
    promptBuilder: (params: {
        topicSeed: TopicSelection;
        generationTheme: GenerationTheme;
        injectedVocabSection: string;
        diversitySeed: string;
    }) => string;
}

interface GenerationTheme {
    id: string;
    name: string;
    lens: string;
    narrativeConstraint: string;
}

interface LongformPromptParams {
    difficultyLabel: string;
    topicSeed: TopicSelection;
    longformStyleId: LongformStyleId;
    lengthTierId: LongformLengthTierId;
    injectedVocabSection: string;
}

const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
    cet4: {
        label: "CET-4 (大学英语四级)",
        cefrLevel: "B1-B2",
        wordRange: "300-400 words",
        promptBuilder: ({ topicSeed, generationTheme, injectedVocabSection, diversitySeed }) => `
You are a senior English material writer designing a model CET-4 reading passage for Chinese learners.
Write one complete article about "${topicSeed.topicLine}".

TARGET EXAM PROFILE:
- Exam: CET-4 (大学英语四级)
- CEFR target: B1-B2
- Word count: 300-400 words
- Topic seed lock: ${topicSeed.topicLine}
- Topic domain: ${topicSeed.domainLabel}
- Topic subtopic: ${topicSeed.subtopicLabel}
- Topic angle: ${topicSeed.angle}

CET-4 WRITING REQUIREMENTS:
- Use familiar, concrete vocabulary that an upper-intermediate learner can process without heavy dictionary use.
- Prefer common everyday or school-life words, plus a small number of slightly upgraded words that remain transparent in context.
- Keep syntax mostly in simple sentences and clear compound sentences, with only light use of subordinate clauses.
- Keep referents clear. Avoid long chains of abstract nouns and avoid dense academic nominalization.
- Build a straightforward structure: introduction, 2-3 body paragraphs, concise conclusion.
- Each paragraph should advance one clear point with an example or observable detail.
- Make the reading feel natural, polished, and useful for exam practice, not childish and not mechanical.

CET-4 DIFFICULTY GUARDRAILS:
- Avoid IELTS-style abstraction, heavy hedging, and overly conceptual policy analysis.
- Avoid rare idioms, highly literary metaphors, and jargon that would feel beyond CET-4.
- Avoid paragraph structures that become too long, too recursive, or too compressed.

RANDOMIZED WRITING LENS:
- Theme name: ${generationTheme.name}
- Writing lens: ${generationTheme.lens}
- Constraint: ${generationTheme.narrativeConstraint}
- Diversity seed: ${diversitySeed}

FACTUAL AND PEDAGOGICAL RULES:
- Keep the article factually grounded and plausible, even when examples are generalized.
- Make the article interesting enough to read, but keep the logic easy to follow.
- Use transitions clearly, but do not over-decorate the prose.
- The title should sound clean, readable, and exam-appropriate.
${injectedVocabSection}
OUTPUT RULES:
- Return valid JSON only.
- "title" should be concise and exam-appropriate.
- "content" must contain the full article with paragraphs separated by double newlines.
- "byline" must be "AI Generator · CET-4 (大学英语四级)".
- "wordCount" must be an integer estimate.
`,
    },
    cet6: {
        label: "CET-6 (大学英语六级)",
        cefrLevel: "B2-C1",
        wordRange: "400-500 words",
        promptBuilder: ({ topicSeed, generationTheme, injectedVocabSection, diversitySeed }) => `
You are a senior English material writer designing a model CET-6 reading passage for Chinese learners.
Write one complete article about "${topicSeed.topicLine}".

TARGET EXAM PROFILE:
- Exam: CET-6 (大学英语六级)
- CEFR target: B2-C1
- Word count: 400-500 words
- Topic seed lock: ${topicSeed.topicLine}
- Topic domain: ${topicSeed.domainLabel}
- Topic subtopic: ${topicSeed.subtopicLabel}
- Topic angle: ${topicSeed.angle}

CET-6 WRITING REQUIREMENTS:
- Use semi-academic vocabulary naturally, mixing familiar high-frequency words with a noticeable layer of more formal expressions.
- Use a clear thesis and deeper explanation than CET-4, with stronger reasoning and more developed paragraph logic.
- Use complex sentences, relative clauses, passive voice, contrast markers, and cause-effect links in a controlled way.
- Let the prose sound thoughtful and mature, but still readable for learners preparing for a national English proficiency exam.
- Build a clear argumentative or explanatory arc: opening setup, analytical middle, concluding judgment or implication.
- Support points with realistic examples, social observations, or moderate evidence-like reasoning.

CET-6 DIFFICULTY GUARDRAILS:
- Avoid overly literary narration, fictional storytelling dominance, or decorative language that weakens clarity.
- Avoid IELTS-level density in every sentence; readability still matters.
- Avoid shallow CET-4-style simplification where ideas feel underdeveloped or too obvious.

RANDOMIZED WRITING LENS:
- Theme name: ${generationTheme.name}
- Writing lens: ${generationTheme.lens}
- Constraint: ${generationTheme.narrativeConstraint}
- Diversity seed: ${diversitySeed}

FACTUAL AND PEDAGOGICAL RULES:
- Keep the article factually grounded, balanced, and suitable for intensive reading practice.
- Use balanced analysis rather than slogans or one-sided preaching.
- Vary paragraph length slightly, but keep overall structure highly readable.
- The title should feel formal, concise, and suitable for serious reading practice.
${injectedVocabSection}
OUTPUT RULES:
- Return valid JSON only.
- "title" should be concise and exam-appropriate.
- "content" must contain the full article with paragraphs separated by double newlines.
- "byline" must be "AI Generator · CET-6 (大学英语六级)".
- "wordCount" must be an integer estimate.
`,
    },
    ielts: {
        label: "IELTS Academic",
        cefrLevel: "C1-C2",
        wordRange: "500-700 words",
        promptBuilder: ({ topicSeed, generationTheme, injectedVocabSection, diversitySeed }) => `
You are a senior English material writer designing an IELTS Academic-style reading passage for advanced learners.
Write one complete article about "${topicSeed.topicLine}".

TARGET EXAM PROFILE:
- Exam: IELTS Academic
- CEFR target: C1-C2
- Word count: 500-700 words
- Topic seed lock: ${topicSeed.topicLine}
- Topic domain: ${topicSeed.domainLabel}
- Topic subtopic: ${topicSeed.subtopicLabel}
- Topic angle: ${topicSeed.angle}

IELTS WRITING REQUIREMENTS:
- Use advanced academic vocabulary with restraint, precision, and natural contextual support.
- Allow qualified claims, cautious evaluation, and explicit tradeoffs when discussing evidence or policy implications.
- Use sophisticated syntax, including nominalization, contrastive framing, embedded clauses, and academic discourse markers.
- Keep the prose intellectually mature and analytically layered, but not bloated or unreadable.
- Build a strong academic reading structure: framing introduction, developed analytical body paragraphs, nuanced conclusion.
- Explain mechanisms, consequences, tensions, and counterarguments where relevant.
- Let the passage feel like a serious magazine or academic explainer, while remaining factually grounded.

IELTS DIFFICULTY GUARDRAILS:
- Avoid CET-style simplicity, over-direct school-essay phrasing, and overly basic examples.
- Avoid empty grand language that sounds advanced but says little.
- Avoid unsupported extremes; prefer qualified reasoning and precise scope.

RANDOMIZED WRITING LENS:
- Theme name: ${generationTheme.name}
- Writing lens: ${generationTheme.lens}
- Constraint: ${generationTheme.narrativeConstraint}
- Diversity seed: ${diversitySeed}

FACTUAL AND PEDAGOGICAL RULES:
- The article must be factually grounded and intellectually stimulating.
- Use varied paragraph lengths for natural reading rhythm, but keep each paragraph coherent.
- Include a compelling introduction and a thoughtful conclusion.
- Integrate clear reasoning, explicit tradeoffs, and disciplined vocabulary control.
- The title should feel serious, elegant, and publication-ready for advanced exam practice.
${injectedVocabSection}
OUTPUT RULES:
- Return valid JSON only.
- "title" should be concise and exam-appropriate.
- "content" must contain the full article with paragraphs separated by double newlines.
- "byline" must be "AI Generator · IELTS Academic".
- "wordCount" must be an integer estimate.
`,
    },
};

const GENERATION_THEMES: GenerationTheme[] = [
    {
        id: "field-note",
        name: "田野记录",
        lens: "Write as if observing a real-world scene with concrete details and human behavior.",
        narrativeConstraint: "Use at least one vivid sensory detail, but keep style exam-friendly and objective.",
    },
    {
        id: "future-letter",
        name: "未来书信",
        lens: "Frame the article as practical advice to a near-future learner or citizen.",
        narrativeConstraint: "Keep tone rational, avoid sci-fi exaggeration, and end with one actionable takeaway.",
    },
    {
        id: "debate-brief",
        name: "辩论简报",
        lens: "Present two competing viewpoints and evaluate tradeoffs with evidence.",
        narrativeConstraint: "Balance both sides before concluding; avoid one-sided preaching.",
    },
    {
        id: "myth-vs-fact",
        name: "迷思与事实",
        lens: "Start from a common misconception, then correct it with grounded explanation.",
        narrativeConstraint: "Include one explicit myth statement and one evidence-backed correction.",
    },
    {
        id: "case-spotlight",
        name: "案例聚焦",
        lens: "Center the article on a compact case study and extract general lessons.",
        narrativeConstraint: "Case should stay realistic and concise; no fictional named characters.",
    },
    {
        id: "micro-history",
        name: "微历史线",
        lens: "Use a short timeline (past -> present -> near future) to explain change.",
        narrativeConstraint: "Keep timeline clear and avoid excessive dates or statistics.",
    },
    {
        id: "system-map",
        name: "系统地图",
        lens: "Explain how multiple factors interact in a system rather than isolated points.",
        narrativeConstraint: "Use clear connectors (cause, feedback, tradeoff) without overcomplication.",
    },
    {
        id: "daily-decision",
        name: "日常决策",
        lens: "Anchor the topic in recurring decisions people make in study/work/life.",
        narrativeConstraint: "Include one practical decision framework in plain language.",
    },
];

function pickRandomGenerationTheme() {
    return GENERATION_THEMES[Math.floor(Math.random() * GENERATION_THEMES.length)] ?? GENERATION_THEMES[0];
}

function buildLongformPrompt(params: LongformPromptParams) {
    const style = LONGFORM_STYLE_OPTIONS.find((item) => item.id === params.longformStyleId);
    const lengthTier = LONGFORM_LENGTH_TIERS.find((item) => item.id === params.lengthTierId);
    if (!style || !lengthTier) {
        throw new Error("Invalid longform configuration");
    }

    const minWords = Math.round(lengthTier.targetWordCount * (1 - lengthTier.toleranceRatio));
    const maxWords = Math.round(lengthTier.targetWordCount * (1 + lengthTier.toleranceRatio));
    const difficultyInstruction = params.difficultyLabel === "CET-4 (大学英语四级)"
        ? `- Keep vocabulary in CET-4 range and syntax mostly straightforward, with only moderate clause depth.\n- Use familiar and concrete wording, but keep the prose mature and polished.`
        : params.difficultyLabel === "CET-6 (大学英语六级)"
            ? `- Keep vocabulary and syntax aligned with CET-6: semi-academic, readable, and more analytically developed than CET-4.\n- Use controlled complex sentences, but do not drift into overly dense IELTS-style abstraction.`
            : `- Keep vocabulary and syntax aligned with IELTS Academic: advanced, precise, and analytically mature.\n- Use nuanced reasoning and richer sentence structures without becoming bloated or unreadable.`;

    return `
You are a senior English material writer creating a longform reading passage for Chinese learners.

LONGFORM MODE:
- Exam track difficulty anchor: ${params.difficultyLabel}
- Topic seed lock: ${params.topicSeed.topicLine}
- Topic domain: ${params.topicSeed.domainLabel}
- Topic subtopic: ${params.topicSeed.subtopicLabel}
- Topic angle: ${params.topicSeed.angle}
- Style name: ${style.name}
- Style label: ${style.promptLabel}
- Target word count: ${lengthTier.targetWordCount} words
- Allowed tolerance band: ${minWords}-${maxWords} words (about +/-15%)

DIFFICULTY CONTROL:
${difficultyInstruction}

LONGFORM STRUCTURE REQUIREMENTS:
- Write a continuous long article, not a short exam passage.
- Expand ideas with natural paragraph development, transitions, examples, and sustained explanation.
- Keep the article as flowing prose with a clear beginning, middle, and end.
- Use natural paragraphing appropriate for a ${lengthTier.targetWordCount}-word reading piece.

STYLE LENS:
- ${style.lens}
- Constraint: ${style.constraint}

STRICT ANTI-QUIZ RULES:
- Do NOT generate any reading comprehension questions.
- Do NOT generate answer options, answer keys, exercises, summaries for teachers, or vocabulary lists.
- Do NOT use exam sections such as Questions 1-5, Passage 1, Task 1, or Reading Comprehension.
- Do NOT switch into bullet-point worksheet format.
- The output must be one continuous article only.

FACTUAL AND PEDAGOGICAL RULES:
- Keep the article plausible, readable, and suitable for deep reading practice.
- Maintain a polished title and disciplined topic focus throughout.
- The prose should feel substantial and immersive, not padded.
${params.injectedVocabSection}
OUTPUT RULES:
- Return valid JSON only.
- "title" should be concise and publication-ready for the chosen difficulty.
- "content" must contain the full article with paragraphs separated by double newlines.
- "byline" must be "AI Generator · ${params.difficultyLabel}".
- "wordCount" must be an integer estimate.
`;
}

function normalizeTopicSeed(value: unknown): TopicSelection | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const candidate = value as Partial<TopicSelection>;
    if (
        typeof candidate.source !== "string" ||
        (candidate.source !== "user" && candidate.source !== "random") ||
        typeof candidate.domainId !== "string" ||
        typeof candidate.domainLabel !== "string" ||
        typeof candidate.subtopicId !== "string" ||
        typeof candidate.subtopicLabel !== "string" ||
        typeof candidate.angle !== "string" ||
        typeof candidate.topicLine !== "string"
    ) {
        return null;
    }

    return {
        source: candidate.source,
        domainId: candidate.domainId,
        domainLabel: candidate.domainLabel,
        subtopicId: candidate.subtopicId,
        subtopicLabel: candidate.subtopicLabel,
        angle: candidate.angle,
        topicLine: candidate.topicLine,
    };
}

export async function POST(req: Request) {
    try {
        const {
            topic,
            topicSeed: rawTopicSeed,
            difficulty = "ielts",
            injectedVocabulary = [],
            generationMode: rawGenerationMode,
            longformStyleId: rawLongformStyleId,
            lengthTierId: rawLengthTierId,
        } = await req.json();

        const diff = (difficulty as string).toLowerCase();
        const config =
            DIFFICULTY_CONFIGS[diff as Difficulty] ?? DIFFICULTY_CONFIGS.ielts;
        const safeDifficulty: Difficulty =
            diff === "cet4" || diff === "cet6" || diff === "ielts" ? diff : "ielts";
        const generationMode: AIGenerationMode = normalizeAIGenerationMode(rawGenerationMode);
        const longformStyleId = normalizeLongformStyleId(rawLongformStyleId);
        const lengthTierId = normalizeLongformLengthTierId(rawLengthTierId);
        const normalizedTopic = typeof topic === "string" ? topic.trim() : "";
        const suppliedTopicSeed = normalizeTopicSeed(rawTopicSeed);
        const topicSeed =
            suppliedTopicSeed && (!normalizedTopic || suppliedTopicSeed.topicLine === normalizedTopic)
                ? suppliedTopicSeed
                : pickAIGenerationTopicSeed({
                    difficulty: safeDifficulty,
                    userTopic: normalizedTopic,
                });
        const generationTheme = pickRandomGenerationTheme();
        const diversitySeed = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

        const injectedVocabSection = Array.isArray(injectedVocabulary) && injectedVocabulary.length > 0
            ? `\nREFERENCE LEXICAL POOL (OPTIONAL, SOFT REFERENCE ONLY):
- These words and phrases come from retrieval and can help align tone and difficulty.
- Treat them as optional support, not as a mandatory checklist.
- Do not force every reference word into the article.
- Use only the items that fit naturally, and ignore the rest without apology.
- Reference Pool: ${injectedVocabulary.slice(0, 50).join(", ")}\n`
            : "";

        if (generationMode === "longform" && (!longformStyleId || !lengthTierId)) {
            return NextResponse.json(
                { error: "Longform mode requires longformStyleId and lengthTierId" },
                { status: 400 },
            );
        }

        const promptBody = generationMode === "longform"
            ? buildLongformPrompt({
                difficultyLabel: config.label,
                topicSeed,
                longformStyleId: longformStyleId!,
                lengthTierId: lengthTierId!,
                injectedVocabSection,
            })
            : config.promptBuilder({
                topicSeed,
                generationTheme,
                injectedVocabSection,
                diversitySeed,
            });

        const prompt = `${promptBody}

Provide the response in JSON format:
{
  "title": "A catchy, exam-appropriate title",
  "content": "Full article text with paragraphs separated by double newlines.",
  "byline": "AI Generator · ${config.label}",
  "wordCount": <approximate word count as integer>
}
`;

        const completion = await deepseek.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "deepseek-chat",
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0].message.content;
        if (!content) throw new Error("No content received");

        const result = JSON.parse(content);
        const longformStyle = generationMode === "longform" ? getLongformStyleMeta(longformStyleId) : null;
        const lengthTier = generationMode === "longform" ? getLongformLengthTierMeta(lengthTierId) : null;
        const quizEligible = generationMode !== "longform";

        // Format for frontend
        const blocks = result.content
            .split("\n\n")
            .map((p: string) => ({
                type: "paragraph",
                content: p.trim(),
            }))
            .filter((b: { content: string }) => b.content);

        return NextResponse.json({
            ...result,
            blocks,
            textContent: result.content,
            difficulty: safeDifficulty,
            isAIGenerated: true,
            generationMode,
            quizEligible,
            longformStyle: longformStyle ?? undefined,
            lengthTier: lengthTier ?? undefined,
            topicSeed,
            generationTheme: generationMode === "standard"
                ? {
                    id: generationTheme.id,
                    name: generationTheme.name,
                }
                : undefined,
            model: "deepseek-chat",
        });
    } catch (error) {
        console.error("Generation API Error:", error);
        return NextResponse.json(
            { error: "Failed to generate article" },
            { status: 500 }
        );
    }
}
