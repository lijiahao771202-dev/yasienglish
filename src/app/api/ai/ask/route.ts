import {
    createDeepSeekClientForCurrentUser,
    createDeepSeekClientForCurrentUserWithOverride,
    getCurrentAiExecutionFingerprintForCurrentUser,
} from "@/lib/deepseek";
import type { AskRetrievedVocabItem } from "@/lib/ask-vocab-memory";
import { normalizeMimoProviderParams, type MimoReasoningEffort, type MimoThinkingMode } from "@/lib/profile-settings";
import {
    chargeReadingCoins,
    insufficientReadingCoinsPayload,
    isReadEconomyContext,
    type ReadingEconomyContext,
} from "@/lib/reading-economy-server";
import {
    buildAiProviderRateLimitPayload,
    getAiProviderRetryAfterSeconds,
    isAiProviderRateLimitError,
} from "@/lib/ai-provider-errors";
import { createHash } from "crypto";

type AskAnswerMode = "default" | "short" | "detailed";
type AskThinkingMode = MimoThinkingMode;
type AskReasoningEffort = MimoReasoningEffort;
type AskQuestionComplexity = "simple" | "complex";
type AskResponseProfile = "adaptive_simple" | "adaptive_complex" | "forced_short" | "forced_detailed";
type AskTeachingGoal = "general" | "sentence_coach";

const ASK_SHORT_MAX_TOKENS = 1600;
const ASK_DETAILED_MAX_TOKENS = 3600;
const ASK_CACHE_TTL_MS = 1000 * 60 * 30;
const ASK_PROMPT_VERSION = "ask-ai-v20260527-cache-gloss-v1";

interface AskCacheEntry {
    expiresAt: number;
    payload: {
        content: string;
        reasoningContent: string;
    };
}

const globalForAskCache = globalThis as typeof globalThis & {
    __yasiAskServerCache?: Map<string, AskCacheEntry>;
};

function getAskCacheMap() {
    if (!globalForAskCache.__yasiAskServerCache) {
        globalForAskCache.__yasiAskServerCache = new Map<string, AskCacheEntry>();
    }
    return globalForAskCache.__yasiAskServerCache;
}

function getServerAskCache(key: string) {
    const cache = getAskCacheMap();
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.payload;
}

function setServerAskCache(key: string, payload: AskCacheEntry["payload"], ttlMs = ASK_CACHE_TTL_MS) {
    const cache = getAskCacheMap();
    cache.set(key, {
        payload,
        expiresAt: Date.now() + Math.max(1, ttlMs),
    });

    if (cache.size > 500) {
        const firstKey = cache.keys().next().value;
        if (typeof firstKey === "string") cache.delete(firstKey);
    }
}

export function clearServerAskCache() {
    getAskCacheMap().clear();
}

function normalizeAskCacheText(value: string) {
    return value
        .replace(/[“”]/g, "\"")
        .replace(/[‘’]/g, "'")
        .replace(/[—–]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}

function buildAskCacheKey(params: {
    text: string;
    question: string;
    selection: string;
    answerMode: AskAnswerMode;
    responseProfile: AskResponseProfile;
    teachingGoal: AskTeachingGoal;
    providerSignature: string;
    retrievedVocab: AskRetrievedVocabItem[];
}) {
    const vocabFingerprint = params.retrievedVocab
        .map((item) => [
            normalizeAskCacheText(item.word).toLowerCase(),
            normalizeAskCacheText(item.translation),
            normalizeAskCacheText(item.definition ?? ""),
            normalizeAskCacheText(item.example ?? ""),
            normalizeAskCacheText(item.sourceSentence ?? ""),
        ].join("\u001f"))
        .join("\u001e");
    const raw = JSON.stringify({
        version: ASK_PROMPT_VERSION,
        provider: params.providerSignature,
        text: normalizeAskCacheText(params.text),
        question: normalizeAskCacheText(params.question),
        selection: normalizeAskCacheText(params.selection),
        answerMode: params.answerMode,
        responseProfile: params.responseProfile,
        teachingGoal: params.teachingGoal,
        retrievedVocab: vocabFingerprint,
    });
    return `ask:${createHash("sha1").update(raw).digest("hex")}`;
}

function enqueueAskSse(controller: ReadableStreamDefaultController<Uint8Array>, encoder: TextEncoder, payload: unknown) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function normalizeInlineText(value: unknown, maxLength: number) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeRetrievedVocab(raw: unknown): AskRetrievedVocabItem[] {
    if (!Array.isArray(raw)) {
        return [];
    }

    const normalized: AskRetrievedVocabItem[] = [];

    for (const item of raw) {
        const typed = (item ?? {}) as Partial<AskRetrievedVocabItem>;
        const word = normalizeInlineText(typed.word, 64);
        const translation = normalizeInlineText(typed.translation, 140);
        if (!word || !translation) {
            continue;
        }

        normalized.push({
            word,
            translation,
            definition: normalizeInlineText(typed.definition, 160) || undefined,
            example: normalizeInlineText(typed.example, 180) || undefined,
            sourceSentence: normalizeInlineText(typed.sourceSentence, 180) || undefined,
            phonetic: normalizeInlineText(typed.phonetic, 48) || undefined,
            meaningHints: Array.isArray(typed.meaningHints)
                ? typed.meaningHints.map((value) => normalizeInlineText(value, 80)).filter(Boolean).slice(0, 3)
                : [],
            highlightedMeanings: Array.isArray(typed.highlightedMeanings)
                ? typed.highlightedMeanings.map((value) => normalizeInlineText(value, 32)).filter(Boolean).slice(0, 3)
                : [],
            morphologyNotes: Array.isArray(typed.morphologyNotes)
                ? typed.morphologyNotes.map((value) => normalizeInlineText(value, 90)).filter(Boolean).slice(0, 2)
                : [],
            score: typeof typed.score === "number" ? typed.score : 0,
        });
    }

    return normalized.slice(0, 4);
}

function buildRetrievedVocabContext(items: AskRetrievedVocabItem[]) {
    if (items.length === 0) {
        return "";
    }

    const lines = items.map((item, index) => {
        const detailLines = [
            `- word: ${item.word}`,
            `- translation: ${item.translation}`,
            item.phonetic ? `- phonetic: ${item.phonetic}` : "",
            item.meaningHints.length > 0 ? `- meaning hints: ${item.meaningHints.join(" | ")}` : "",
            item.highlightedMeanings.length > 0 ? `- highlighted meanings: ${item.highlightedMeanings.join(" / ")}` : "",
            item.example ? `- example: ${item.example}` : "",
            item.sourceSentence ? `- source sentence: ${item.sourceSentence}` : "",
            item.morphologyNotes.length > 0 ? `- notes: ${item.morphologyNotes.join(" | ")}` : "",
        ].filter(Boolean);
        return `[${index + 1}]\n${detailLines.join("\n")}`;
    });

    return `Learner Personal Vocab Memory:
Use this memory only when it is directly relevant to the highlighted text or the user's question. Do not force unrelated saved words into the answer.
If one of these words clearly matches the current sentence, you may briefly connect your explanation to the learner's saved translation or example.

${lines.join("\n\n")}`;
}

function normalizeAskAnswerMode(rawMode: unknown): AskAnswerMode {
    if (rawMode === "short" || rawMode === "detailed") return rawMode;
    return "default";
}

function normalizeAskThinkingMode(rawMode: unknown): AskThinkingMode | undefined {
    if (rawMode === "on") return "on";
    if (rawMode === "off") return "off";
    return undefined;
}

function normalizeAskReasoningEffort(rawEffort: unknown): AskReasoningEffort | undefined {
    if (rawEffort === "low" || rawEffort === "medium" || rawEffort === "high") {
        return rawEffort;
    }
    return undefined;
}

export function detectAskQuestionComplexity(question: string): AskQuestionComplexity {
    const normalized = question.trim();
    const lower = normalized.toLowerCase();
    const punctuationCount = (normalized.match(/[，,。；;、]/g) ?? []).length;

    const hasComplexSignal = (
        /(为什么|原因|区别|对比|详细|深入|全面|系统|完整|逐句|逐词|展开|步骤|推导|多角度|并且|同时|分别|结构分析|语法结构|对照)/u.test(normalized)
        || /(why|reason|difference|compare|detailed|in[- ]depth|step by step|comprehensive|analy[sz]e|grammar structure|break down)/i.test(lower)
    );
    if (hasComplexSignal) return "complex";

    const hasSimpleSignal = (
        /(什么意思|啥意思|怎么翻译|怎么说|这句啥意思|一句话总结|总结一下|大意|主旨|词义|短语|翻译一下|怎么理解|这个词)/u.test(normalized)
        || /(what does .* mean|meaning of|translate|translation|summarize|summary|in one sentence)/i.test(lower)
    );
    if (hasSimpleSignal && normalized.length <= 42 && punctuationCount <= 1) return "simple";

    if (normalized.length <= 24 && punctuationCount === 0) return "simple";
    return "complex";
}

function resolveAskResponseProfile(mode: AskAnswerMode, complexity: AskQuestionComplexity): AskResponseProfile {
    if (mode === "short") return "forced_short";
    if (mode === "detailed") return "forced_detailed";
    return complexity === "simple" ? "adaptive_simple" : "adaptive_complex";
}

function resolveAskTeachingGoal(question: string, selection: string): AskTeachingGoal {
    const normalizedQuestion = question.trim();
    const lowerQuestion = normalizedQuestion.toLowerCase();
    const normalizedSelection = selection.replace(/\s+/g, " ").trim();
    const selectionWordCount = normalizedSelection ? normalizedSelection.split(/\s+/).length : 0;
    const looksLikeSentenceSelection = (
        /[.!?。！？]["'”’)]?$/.test(normalizedSelection)
        || selectionWordCount >= 8
    );

    const hasSentenceCoachSignal = (
        /(这句话|这个句子|整句|句子|翻译这句|翻译这句话|语法结构|语法树|结构树|句法树|树状|词汇搭配|拆解|拆开|揉碎|逐词|逐句|主干)/u.test(normalizedQuestion)
        || /(translate|break down|grammar|structure|collocation|sentence|clause|parse|main clause|syntax tree|parse tree)/i.test(lowerQuestion)
    );

    const hasMeaningSignal = (
        /(什么意思|啥意思|怎么理解|这句啥意思|这句话啥意思)/u.test(normalizedQuestion)
        || /(what does .* mean|what is the meaning|how should i understand)/i.test(lowerQuestion)
    );

    if (!normalizedSelection || !looksLikeSentenceSelection) {
        return "general";
    }

    if (hasSentenceCoachSignal || hasMeaningSignal) {
        return "sentence_coach";
    }

    return "general";
}

function looksLikeTruncatedTeachingAnswer(content: string) {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length < 40) {
        return false;
    }

    if (/[。！？.!?）)\]】"”’]$/.test(normalized)) {
        return false;
    }

    return /[\p{Script=Han}A-Za-z0-9，,、：:]$/u.test(normalized);
}

function buildAskPrompt(params: {
    text: string;
    selection: string;
    responseProfile: AskResponseProfile;
    answerMode: AskAnswerMode;
    complexity: AskQuestionComplexity;
    teachingGoal: AskTeachingGoal;
    retrievedVocab: AskRetrievedVocabItem[];
}) {
    const { text, selection, responseProfile, answerMode, complexity, teachingGoal, retrievedVocab } = params;
    const focusContext = selection
        ? `The user highlighted this string: "${selection}". Focus this selection first, then explain within paragraph context.`
        : "No explicit selection. Focus on the user's question against the paragraph.";
    const retrievedVocabContext = buildRetrievedVocabContext(retrievedVocab);

    const commonInstructions = `
General instructions:
1. Ensure correctness first, then readability. Use both contextual Chinese and English as appropriate.
2. Use Markdown and clear line breaks (avoid giant paragraphs).
4. If the answer is not supported by the paragraph, say so politely.
5. If explaining grammar, clearly label structures (e.g., 主语, 谓语, 定语从句).
6. If explaining vocabulary, mention practical collocation/usage when helpful.

English-with-Chinese requirement:
1. The user is a Chinese learner. EVERY time you quote or introduce an English word, phrase, collocation, example sentence, grammar formula, or clause, it must be immediately followed by a concise Simplified Chinese gloss in full-width parentheses.
2. This applies to all Ask AI answer types, not only sentence teaching mode. Do not leave English-only explanations that the user may not understand.
3. Correct examples: \`main signal\`（主要信号）, \`solidify new memories\`（巩固新记忆）, \`be likely to\`（很可能）, \`that clause\`（that 引导的从句）.
4. If a full English example sentence is useful, write it with a Chinese gloss right after it, for example: \`The policy sent a clear signal.\`（这项政策释放了清晰信号。）
5. Section headings can stay Chinese, but English inside headings, bullets, tables, examples, or inline code still needs the Chinese gloss.

Visual rendering capabilities:
1. In 结构拆解, you may organise the chunk-by-chunk breakdown as a Markdown table OR as numbered mini blocks — pick whichever is cleanest. A table is encouraged when the sentence has many chunks because it makes the layout easier to scan side-by-side.
2. Outside 结构拆解, do not default to tables. Use prose, bullets, or numbered chunks for the main teaching flow, and reach for a table only when a side-by-side comparison or compact final summary genuinely helps. Keep table cells concise; if a cell needs more nuance, expand it as prose right under the table.
3. ${teachingGoal === "sentence_coach"
            ? "Do not output mindmap, Mermaid, flowchart, graph, or diagram fences. The only visual diagram fence allowed is the `syntax-tree` fence described in the \"Syntax tree visualization\" policy; use it strictly under those rules."
            : "Do not output any visual diagram fences (mindmap, Mermaid, flowchart, graph, diagram, syntax-tree). Explain structure with plain prose."}
4. Optional final summary: add ## 总结 only when it genuinely helps the learner review the answer. Do not add ## 总结 by default.
5. Use a compact Markdown table for the summary only when it genuinely improves scanning; otherwise summarize with 1-3 bullets.
6. IMPORTANT: if you use a table, output a real Markdown table with one row per line and a blank line before and after it.
7. Section separators: do not put a separator directly under a heading. If you use "---", place it after a section's content and before the next section heading.

Visual emphasis policy:
1. Use **bold** for section-local titles, numbered mini-block titles, structure names, and ordinary emphasis.
2. Use <mark>...</mark> for true teaching takeaways: key logic, definitions, conclusions, contrast, cause-effect links, and points the learner should remember.
3. Use inline code with backticks for English phrases, fixed collocations, grammar formulas, inserted clauses, and example fragments, for example \`is known as\`, \`be used to do\`, or \`(that) some cities are trying\`.
4. Do not use <mark> in section headings, numbered mini-block titles, or the first line of a numbered block; those titles should use **bold** only.
5. Do not use <mark> just because a phrase is English. If it is only a phrase/example/formula, prefer inline code.
6. In sentence teaching mode, every substantive section after 直译 should contain 2-4 well-chosen marks when there is enough content.
7. Choose marks by teaching value, not by position: prioritize cause-effect logic, contrast, definitions, predicate/action meaning, modifier scope, and the sentence's main claim.
8. In 中文解释, mark the core logic or conclusion in Chinese, not only English terms.
9. In 句子主干, mark the actual backbone relationship or the meaning of the predicate/object, not the label words.
10. In 结构拆解 and 词汇与搭配, each important bullet should usually include one mark in its explanation line.
11. When showing English copied from the selected sentence, keep the exact surface form. For example, use \`manually reviewed\` instead of \`manually review\` if the original sentence says "manually reviewed".
12. Prefer meaningful grammar or collocation units over isolated helper words: predicate phrases, objects, participial phrases, prepositional phrases, and high-value collocations.
13. For clauses, include the full clause when a connector opens a short important clause, for example \`(that) some cities are trying\` instead of only \`that\`.
14. For noun phrases, include determiners, possessives, modifiers, and the head noun, for example \`its initial learning phase\` or \`careful guidance and well-defined parameters\`.
15. For verbs, show the exact predicate form from the sentence, not a dictionary form.
16. Do not mark or bold Chinese labels such as 语法功能, 语境意思, 搭配解析, 关联记忆, 主语, 谓语, 宾语.
17. Do not mark a pronoun or generic subject by itself unless it is the actual point being taught.
`;

    // Heavy ~4KB block. Only included for sentence_coach mode to keep TTFT low for general questions.
    const sentenceCoachAddenda = `
Syntax tree visualization policy:
1. This policy only applies when Teaching Goal is "sentence_coach". In any other goal, never emit a \`syntax-tree\` fence.
2. Decide whether the highlighted sentence is structurally complex. A sentence counts as complex if it has AT LEAST ONE of: a subordinate clause (宾语从句/定语从句/状语从句/同位语从句/主语从句/表语从句), a non-finite structure doing a real grammar job (分词短语、动名词短语、不定式短语作主语/宾语/状语/定语), inversion, cleft ("It is ... that/who ..."), fronted adverbial longer than one short phrase, coordinated independent clauses joined by ",", ";", "and", "but", "or", "so", "yet", parallel structures joined by "not only... but also", "either... or", "neither... nor", "both... and", or a correlative comparative ("the more ..., the more ..."). A plain SVO sentence with a single short adverbial does NOT count as complex.
3. If the sentence is NOT complex by rule 2, DO NOT emit the \`syntax-tree\` fence at all. Go straight to the normal teaching sections and do not invent any tree-like visual.
4. If the sentence IS complex, you MUST emit exactly ONE \`syntax-tree\` fenced code block as the VERY FIRST thing in your response, before any heading, prose, or other fence. This is required, not optional. After the closing fence, leave one blank line, then write the normal teaching sections. Do NOT add any extra section heading such as "## 句子结构", "## 句子结构层级图", "## 结构树", "## 层级图", "## 语法树" — the rendered fence already provides the visual, so you must not duplicate it in prose.
5. The fence body must be strict JSON that follows this TypeScript shape exactly:
     interface TreeNode {
       label: string;      // Simplified Chinese grammar role, e.g. "主句", "并列主句", "宾语从句", "定语从句", "时间状语", "目的状语", "主语", "谓语", "宾语", "分词状语", "介词短语"
       role_zh?: string;   // OPTIONAL but STRONGLY preferred on every non-trunk node. A plain-Chinese "what this chunk is doing" tag for Chinese students, 2-8 characters. Examples: "哪一个？"（定语从句/定语）, "做了什么？"（宾语从句）, "也就是说…"（同位语从句）, "虽然…"（让步状语从句）, "为了…"（目的状语）, "什么时候"（时间状语）, "在哪里"（地点状语）, "为什么"（原因状语）, "如果…"（条件状语）, "怎么样地"（方式状语）, "同时/正在"（伴随分词状语）, "顺便插一句"（插入语）. Do NOT put a translation here — that's what zh is for. Omit on the root and on the 主语/谓语/宾语/表语 skeleton leaves (the UI fills those in automatically).
       text: string;       // The exact English span from the sentence, copied verbatim with original casing and punctuation. For the root, the full sentence.
       zh: string;         // Required. A short Simplified Chinese gloss of THIS chunk's contextual meaning, NOT a label restatement. 6-22 characters. For the root, give a faithful one-line Chinese paraphrase of the whole sentence. For sub-clauses and phrases, give the local meaning in this sentence (例如 "机器人的推理模型过于简单" / "无法理解上下文" / "为了 ... 而 ...").
       zh_order?: number;  // OPTIONAL but STRONGLY preferred on EVERY direct child of the root (the "意群块"). 1-based position of this chunk in the natural Chinese translation. Use this whenever the Chinese version reorders chunks. Examples: a sentence-final 时间状语从句 / 原因状语从句 / 目的状语 / 让步状语从句 typically takes zh_order=1 in Chinese; a 定语从句 modifying a noun typically takes the noun's zh_order minus 0 (i.e. it wraps in front of the noun); a 宾语从句 stays after the predicate so usually keeps its English order. Do NOT use this on level-3 clause-internal nodes (主语/谓语/宾语 inside a 从句) — only on the visible "chunks" at level 2. The numbers must form a permutation of 1..N where N is the number of root-level chunks.
       children?: TreeNode[];
     }
6. Root rules: the root \`label\` must be "主句" for a single-clause backbone or "并列主句" for coordinated main clauses; root \`text\` must be the exact full sentence; root \`zh\` is the whole-sentence Chinese paraphrase.
7. Depth — HARD CAP at 3 levels. Counting starts at the root (level 1). The deepest legal node is at level 3 (root -> child -> grandchild). NEVER emit great-grandchildren. If you feel a node "still has internal structure", explain that in the regular 句子主干 / 结构拆解 prose sections instead, not by adding another tree layer. Do not tokenize down to single function words like "the" or "of".
8. Drill-down policy — only drill the syntactic backbone, never re-drill leaves:
    a. Level 1 → level 2 decomposes the main clause(s) into their major constituents: subordinate clauses (从句), the main subject / predicate / object trunk, and any 插入语 / 状语. For a 并列主句, level 2 is each independent clause.
    b. Level 2 → level 3 ONLY drills 从句 nodes whose \`text\` still contains a full predicate. The drill produces 引导词 + 主语 + 谓语 + 宾语(or 表语). Do NOT drill plain noun phrases / prepositional phrases / participial phrases at level 2 even if they are long — keep them as leaves with the whole span as their \`text\` and a clear Chinese gloss in \`zh\`. Long noun phrases get explained in the 结构拆解 prose section, not by adding tree nodes.
    c. Short parentheticals such as "for instance", "however", "in fact", "of course" stay as flat leaf nodes labeled 插入语. Do not drill them.
    d. If you find yourself wanting to introduce labels like "核心名词", "后置定语", "中心词", "介词宾语" — STOP. Those belong to a 4th level and are forbidden. The only legal labels at the deepest level are the clause-internal roles 引导词 / 主语 / 谓语 / 宾语 / 表语 / 状语 / 插入语 / 同位语.
9. Quota — keep the tree small enough to scan in one glance:
    a. Total node count (including the root) MUST be ≤ 12.
    b. Any single parent MUST have ≤ 6 direct children.
    c. If you have to choose between drilling and the quota, respect the quota and stop drilling. A clean 2-level tree beats a noisy 3-level one.
10. Coverage: children of a node, concatenated in order, should approximately cover the parent's span. Do not skip major chunks (subject, predicate, important modifiers).
11. Granularity balance — inside any single parent, sibling \`text\` spans should be of comparable information density. Concretely:
    a. Avoid placing a 1-word sibling (e.g. bare "revealed") next to a 6+ word sibling unless that single word genuinely is the isolated predicate of the backbone.
    b. If a predicate is a single finite verb with no informative modifiers, prefer merging it with its direct object into a 谓语+宾语 super-chunk at that level instead of creating a dangling single-verb leaf.
    c. Every node's \`text\` should stay ≤ about 14 English words when it has siblings — if it is longer and represents a 从句, drill it; if it is a long phrase, keep it as a leaf and rely on \`zh\` to make the meaning clear.
12. Labels must be Simplified Chinese. Do not use English phrase tags like "NP", "VP", "PP".
13. \`zh\` must always be present and non-empty for every node, including leaf nodes such as 主语/谓语/宾语. Keep it concise; do not repeat the English text inside \`zh\`. Do not use \`zh\` as a synonym dump.
14. JSON hygiene: no comments, no trailing commas, no surrounding prose inside the fence. Use double quotes. Escape any double quote inside \`text\` or \`zh\` with \\". If the sentence contains no double quotes, no escaping is needed.
15. Do not repeat the same tree in a later message unless the user asks for it again.
16. Absolute prohibitions (applies to every reply, whether you use the fence or not):
    a. Never draw a sentence-structure tree using box-drawing characters such as "├──", "└──", "│", "┌", "┐", "┘", "┼", or ASCII approximations like "|--", "\\--", "+--". If you catch yourself starting a line with any of these, stop and either emit a \`syntax-tree\` fence instead or drop the tree entirely.
    b. Never simulate a tree with a numbered or bulleted outline that indents clauses under clauses purely for visual hierarchy. A flat bullet/numbered list that explains chunks left-to-right is fine; a nested outline that mimics a tree shape is not.
    c. Never format a tree as repeated inline code chunks on separate lines (for example a list where every bullet body is a single \`backtick line\` that draws part of a tree).
    d. The ONLY acceptable way to show the visual hierarchy is the \`syntax-tree\` fence described above. If the sentence does not qualify for the fence, explain the structure in plain Chinese prose inside the regular teaching sections and do not try to replace the tree with another visual.
17. Fence format example (follow shape, not content):
        \`\`\`syntax-tree
        {
          "label": "主句",
          "text": "Although the plan looked simple, the team soon realized that execution would take months.",
          "zh": "尽管计划看起来很简单，团队很快就意识到执行会花上好几个月",
          "children": [
            { "label": "让步状语从句", "role_zh": "虽然…", "text": "Although the plan looked simple", "zh": "尽管计划看起来很简单", "zh_order": 1, "children": [] },
            { "label": "主句", "text": "the team soon realized that execution would take months", "zh": "团队很快意识到执行会花上好几个月", "zh_order": 2,
              "children": [
                { "label": "主语", "text": "the team", "zh": "团队", "children": [] },
                { "label": "谓语", "text": "realized", "zh": "意识到", "children": [] },
                { "label": "宾语从句", "role_zh": "做了/说了什么", "text": "that execution would take months", "zh": "执行会花上好几个月", "children": [] }
              ]
            }
          ]
        }
        \`\`\`

English-with-Chinese gloss policy:
1. In sentence teaching mode, EVERY time you quote an English word, phrase, collocation, formula, or clause with inline backticks, you MUST immediately follow it with a concise Chinese gloss in full-width parentheses. No exceptions inside the same paragraph just because you glossed it earlier — when in doubt, add the gloss. Over-glossing is acceptable; under-glossing is not.
2. Format examples: \`This narrative\`（这种叙述）, \`suggests\`（暗示）, \`that the practice requires...\`（that 引导的宾语从句）, \`is known as\`（被称为）, \`is fraught with\`（充满；夹带着）, \`is full of\`（充满）.
3. Apply this consistently in 句子主干, 结构拆解, 词汇与搭配, examples, and recap content. Do not leave important inline English fragments bare. This includes verb phrases (\`is fraught with\`, \`is full of\`, \`give rise to\`), prepositional phrases, idiomatic collocations, and inserted clauses — even short ones.
4. For grammar connectors or structural chunks, gloss the function and meaning, for example \`that\`（引导宾语从句） or \`who find their minds naturally active\`（修饰前面的 individuals）.
5. Keep each gloss short and useful: prefer the contextual meaning over dictionary definitions, and avoid long explanations inside parentheses.
6. Top-level section headings (## 直译, ## 中文解释, ## 句子主干, ## 结构拆解, ## 词汇与搭配, ## 总结) are fixed Chinese names — do not add English or Chinese glosses to them. However, inside 结构拆解 the sub-group sub-headings (### N) ... lines) and any numbered mini-block titles MUST attach a full-width Chinese gloss right after every English span they contain, whether or not the English is wrapped in backticks. Examples of correct sub-heading shapes: \`### 3) 谓语 \\\`is fraught with\\\`（充满、带有）\`, \`### 4) 表语核心 \\\`both potential and peril\\\`（机遇和风险并存）\`. Never leave a bare English chunk inside any sub-heading. Use **bold** only; never use <mark> in these titles.
7. If the exact same English chunk has already been glossed once in the immediately preceding sentence, you may omit the gloss on the very next mention only when repeating it would clearly hurt readability. After that, gloss it again.
`;

    const shortInstructions = `
Response style (SHORT):
1. MUST use exactly two sections:
   - ## 结论
   - ## 解析
2. 结论: 1-2 sentences, give direct answer first.
3. 解析: bullet list with MAX 2 bullets, each bullet should be one concise sentence.
4. Do NOT add ## 例句 unless user explicitly asks for examples.
5. Avoid repeating the paragraph verbatim.
`;

    const detailedInstructions = `
Response style (DETAILED):
1. Keep high quality structure with:
   - ## 结论
   - ## 解析
2. Use bullet points for key analysis.
3. Add ## 例句 only when it helps comprehension (1-2 examples is enough).
4. Since this answer is shown in a side panel, you may give a fuller explanation when it improves learning value.
5. Keep the answer substantial for complex questions, but still well-structured and easy to scan.
`;

    const sentenceCoachShortInstructions = `
Sentence teaching mode (SHORT):
1. Teach the sentence like a patient teacher, not like a generic chatbot.
2. MUST use exactly these sections in this order:
   - ## 直译
   - ## 中文解释
   - ## 句子主干
   - ## 关键点
3. In 中文解释, restate the sentence in natural, plain Chinese so the learner really understands the idea, not just the literal translation.
4. Do not extend the explanation into study advice, exam tips, or life lessons unless the user explicitly asks.
5. In 句子主干, point out the main backbone in very plain Chinese (for example: 主语 / 谓语 / 宾语 / 表语).
6. In 关键点, use MAX 3 bullets to explain the most important structures or collocations from left to right.
7. For each key chunk, include its local Chinese meaning in context, not only its grammar label.
8. Avoid advanced grammar jargon unless you immediately explain it in learner-friendly Chinese.
9. Do not use a table for sentence breakdown. Use short bullets or numbered mini blocks.
10. In 中文解释, 句子主干, and 关键点, use <mark>...</mark> to mark the learner's highest-value takeaway in the explanation content.
11. Each mini block should follow this exact shape when possible:
   1. **English chunk**
      - 语法功能：...
      - 语境意思：...
`;

    const sentenceCoachDetailedInstructions = `
Sentence teaching mode (DETAILED):
You are a patient, experienced English tutor talking to a Chinese learner. Treat this like a one-on-one tutoring session: read the sentence with the learner and unpack it carefully so they truly understand every piece, not just get a translation.

Aim for a generous, lesson-quality walk-through — depth over brevity. A good response is the kind of detailed explanation a learner would screenshot to review later, not a summary. Don't underdeliver.

Use these sections in this order:
- ## 直译 — a literal Chinese rendering that mostly preserves the English word order, useful for English↔Chinese mapping.
- ## 中文解释 — first restate the sentence in natural everyday Chinese, then spend a couple of lines unpacking the implied logic, tone, the writer's intent, and how the sentence fits into the surrounding paragraph if relevant.
- ## 句子主干 — in plain Chinese, identify the real backbone (主语/谓语/宾语/表语 or 核心从句). Strip away modifiers and show the bare skeleton, then briefly note what the modifiers add on top.
- ## 结构拆解 — go through the sentence left to right, chunk by chunk, end-to-end. Lead with prose; treat tables as an OPTIONAL supplementary aid, not the main format.
  - Split the sentence into 2-4 natural sense groups (意群) — typically one per clause, per major coordinated phrase, or per "状语 / 主句 / 从句" segment.
  - For each sense group, write a short bold heading like \`### 1) 时间状语从句 \\\`As we ...\\\`（随着我们越来越擅长 …）\`, then 2-4 sentences of plain-Chinese prose that name the role, restate it in everyday Chinese, explain why the writer chose this wording, and note how it links to neighbouring groups. Slip in inline glosses for any non-obvious word using the \`English\`（中文） format. Most of the teaching weight lives here, not in tables.
  - Add a small Markdown table for a sense group only when a side-by-side listing genuinely helps the learner scan it (e.g., a string of parallel modifiers, or a clause with several function words pulling structural weight). Otherwise skip the table for that group. Do NOT add a table to every group, and never duplicate the prose explanation inside table cells.
  - When you do use a table, keep it small (3-6 rows) and pick whichever columns best fit what you are showing — common choices include 英文片段 / 中文意思 / 语法功能 / 备注, but you decide based on the chunk. Use 2-4 columns; don't force a fixed schema. The table is a quick-glance map, not a second copy of the explanation.
  - The combined coverage of prose (and any optional tables) must reach the end of the sentence. Don't stop early.
- ## 词汇与搭配 — pick the highest-value words or collocations from this sentence (usually 2-4). For each, explain the contextual meaning, the typical usage pattern in plain Chinese, and a short fresh example sentence (≤ 12 English words) with a Chinese gloss in full-width parentheses. If a word is easily confused with a similar one, briefly contrast them.

Style guidelines:
- Speak directly to the learner, like a teacher would. Prefer plain everyday Chinese over textbook jargon. When a grammar term appears, follow it with a "也就是说..." plain-Chinese restatement so the term never stands alone.
- Be generous with explanation. Short bullets are fine, but each bullet should carry real teaching value — avoid one-line throwaways like "this is the subject" without explaining why it matters.
- Use numbered mini blocks for chunks; use sub-bullets to expand on what each chunk is doing. No oversized paragraphs, but also no painfully terse outlines.
- Quote English fragments inline with \`backticks\` and immediately follow them with a Chinese gloss in full-width parentheses.
- Use <mark>...</mark> sparingly to highlight the single most important takeaway of each section. Mark meaning, not labels.
- Don't drift into general study advice, exam tips, or life lessons unless the user asks for them.

You may add an optional ## 总结 at the end only when a one-line recap genuinely helps. Skip it by default.
`;

    const defaultProfileInstructions = responseProfile === "adaptive_simple" || responseProfile === "forced_short"
        ? shortInstructions
        : detailedInstructions;
    const sentenceCoachInstructions = responseProfile === "adaptive_simple" || responseProfile === "forced_short"
        ? sentenceCoachShortInstructions
        : sentenceCoachDetailedInstructions;
    const profileInstructions = teachingGoal === "sentence_coach"
        ? sentenceCoachInstructions
        : defaultProfileInstructions;

    return `You are an expert English tutor and linguist helping Chinese learners.

Stable task contract:
- Purpose: answer a reading-page Ask AI question for a Chinese learner.
- Output language: primarily Simplified Chinese.
- English-with-Chinese requirement is mandatory across every answer.
- Keep explanations grounded in the provided paragraph and selected text.
- Use Markdown only; avoid unsupported diagram fences unless a policy below explicitly allows one.

Context Paragraph:
"""
${text}
"""

${focusContext}
${retrievedVocabContext ? `\n\n${retrievedVocabContext}` : ""}

Answer Mode: "${answerMode}"
Detected Complexity: "${complexity}"
Response Profile: "${responseProfile}"
Teaching Goal: "${teachingGoal}"

${commonInstructions}
${profileInstructions}${teachingGoal === "sentence_coach" ? `\n${sentenceCoachAddenda}` : ""}`;
}

export async function POST(req: Request) {
    try {
        const { text, question, messages, selection, answerMode, askThinkingMode, askReasoningEffort, economyContext, retrievedVocab } = await req.json() as {
            text?: string;
            question?: string;
            messages?: { role: "user" | "assistant", content: string }[];
            selection?: string;
            answerMode?: AskAnswerMode;
            askThinkingMode?: AskThinkingMode;
            askReasoningEffort?: AskReasoningEffort;
            economyContext?: ReadingEconomyContext;
            retrievedVocab?: AskRetrievedVocabItem[];
        };

        const normalizedText = typeof text === "string" ? text.trim() : "";
        const normalizedQuestion = typeof question === "string" ? question.trim() : "";
        const normalizedSelection = typeof selection === "string" ? selection.trim() : "";
        const normalizedAnswerMode = normalizeAskAnswerMode(answerMode);
        const normalizedAskThinkingMode = normalizeAskThinkingMode(askThinkingMode);
        const normalizedAskReasoningEffort = normalizeAskReasoningEffort(askReasoningEffort);
        const normalizedRetrievedVocab = normalizeRetrievedVocab(retrievedVocab);

        if (!normalizedText || !normalizedQuestion) {
            return new Response(JSON.stringify({ error: "Text and question are required" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const complexity = detectAskQuestionComplexity(normalizedQuestion);
        const responseProfile = resolveAskResponseProfile(normalizedAnswerMode, complexity);
        const teachingGoal = resolveAskTeachingGoal(normalizedQuestion, normalizedSelection);
        const maxTokens = responseProfile === "adaptive_simple" || responseProfile === "forced_short"
            ? ASK_SHORT_MAX_TOKENS
            : ASK_DETAILED_MAX_TOKENS;
        const executionFingerprint = await getCurrentAiExecutionFingerprintForCurrentUser("deepseek-chat");
        const providerSignature = executionFingerprint.cacheSignature;
        const askCacheKey = buildAskCacheKey({
            text: normalizedText,
            question: normalizedQuestion,
            selection: normalizedSelection,
            answerMode: normalizedAnswerMode,
            responseProfile,
            teachingGoal,
            providerSignature,
            retrievedVocab: normalizedRetrievedVocab,
        });

        let readingCoinMutation: {
            balance: number;
            delta: number;
            applied: boolean;
            action: string;
        } | null = null;
        const readContext = isReadEconomyContext(economyContext)
            ? {
                ...economyContext,
                action: economyContext?.action ?? "ask_ai",
            }
            : null;

        if (readContext?.action) {
            const charge = await chargeReadingCoins({
                action: readContext.action,
                dedupeKey: readContext.dedupeKey,
                meta: {
                    articleUrl: readContext.articleUrl ?? null,
                    from: "api/ai/ask",
                    answerMode: normalizedAnswerMode,
                    responseProfile,
                },
            });
            if (!charge.ok && charge.insufficient) {
                return new Response(
                    JSON.stringify(
                        insufficientReadingCoinsPayload(readContext.action, charge.required ?? 2, charge.balance),
                    ),
                    {
                        status: 402,
                        headers: { "Content-Type": "application/json" },
                    },
                );
            }
            readingCoinMutation = {
                balance: charge.balance,
                delta: charge.delta,
                applied: charge.applied,
                action: charge.action,
            };
        }

        const systemPrompt = buildAskPrompt({
            text: normalizedText,
            selection: normalizedSelection,
            responseProfile,
            answerMode: normalizedAnswerMode,
            complexity,
            teachingGoal,
            retrievedVocab: normalizedRetrievedVocab,
        });

        const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
            { role: "system", content: systemPrompt },
        ];
        
        if (Array.isArray(messages) && messages.length > 0) {
            messages.forEach((msg) => {
                if (msg.role === "user" || msg.role === "assistant") {
                    chatMessages.push({ role: msg.role, content: msg.content });
                }
            });
        } else {
            chatMessages.push({ role: "user", content: normalizedQuestion });
        }

        const cachedAnswer = getServerAskCache(askCacheKey);

        // Create a ReadableStream for SSE.
        // IMPORTANT: We do NOT await deepseek.chat.completions.create() out here. Doing so
        // would force the HTTP response to wait for DeepSeek's TTFT (which can be 2-8s for
        // a long sentence-coach prompt) before any byte is sent to the client. By moving the
        // model call inside the stream's start() callback, the HTTP response returns to the
        // browser immediately and we can send a synthetic "ready" event so the chat UI can
        // flip from "等待回答..." to "正在生成..." within ~50ms.
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    // Synthetic ready signal: lets the client know the request is in flight.
                    enqueueAskSse(controller, encoder, { ready: true });

                    if (cachedAnswer) {
                        enqueueAskSse(controller, encoder, { cache: { hit: true, layer: "server" } });
                        if (cachedAnswer.reasoningContent) {
                            enqueueAskSse(controller, encoder, { reasoningContent: cachedAnswer.reasoningContent });
                        }
                        if (cachedAnswer.content) {
                            enqueueAskSse(controller, encoder, { content: cachedAnswer.content });
                        }
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                        controller.close();
                        return;
                    }

                    const aiClient = normalizedAskThinkingMode
                        ? await createDeepSeekClientForCurrentUserWithOverride({
                            mimoParams: normalizeMimoProviderParams({
                                thinking_mode: normalizedAskThinkingMode,
                                reasoning_effort: normalizedAskReasoningEffort ?? "medium",
                            }),
                        })
                        : await createDeepSeekClientForCurrentUser();
                    const stream = await aiClient.chat.completions.create({
                        messages: chatMessages,
                        model: "deepseek-chat",
                        temperature: 0.4,
                        max_tokens: maxTokens,
                        stream: true,
                    });

                    let streamedContent = "";
                    let streamedReasoningContent = "";
                    const pumpStreamToClient = async (
                        activeStream: AsyncIterable<{
                            choices?: Array<{
                                delta?: {
                                    content?: unknown;
                                    reasoning_content?: unknown;
                                    reasoningContent?: unknown;
                                    thinking?: unknown;
                                };
                                finish_reason?: unknown;
                            }>;
                        }>,
                        phase: "initial" | "continuation",
                    ) => {
                        let finishReason = "";

                        for await (const chunk of activeStream) {
                            const choice = chunk.choices?.[0];
                            if (typeof choice?.finish_reason === "string") {
                                finishReason = choice.finish_reason;
                            }
                            const delta = choice?.delta;
                            const reasoningContent = typeof delta?.reasoning_content === "string"
                                ? delta.reasoning_content
                                : typeof delta?.reasoningContent === "string"
                                    ? delta.reasoningContent
                                    : typeof delta?.thinking === "string"
                                        ? delta.thinking
                                        : "";
                            const content = typeof delta?.content === "string" ? delta.content : "";
                            if (reasoningContent) {
                                streamedReasoningContent += reasoningContent;
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ reasoningContent })}\n\n`));
                            }
                            if (content) {
                                streamedContent += content;
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                            }
                        }

                        console.info("[AskAI] stream complete", {
                            phase,
                            finishReason: finishReason || "unknown",
                            contentLength: streamedContent.length,
                            reasoningLength: streamedReasoningContent.length,
                        });

                        return finishReason;
                    };

                    const finishReason = await pumpStreamToClient(stream, "initial");
                    const visibleAnswer = (streamedContent || streamedReasoningContent).trim();
                    const shouldContinue = finishReason === "length"
                        || (
                            teachingGoal === "sentence_coach"
                            && (!finishReason || finishReason === "stop" || finishReason === "unknown")
                            && looksLikeTruncatedTeachingAnswer(visibleAnswer)
                        );
                    if (shouldContinue) {
                        const visibleSoFar = (streamedContent || streamedReasoningContent).trim();
                        const continuationInstruction = streamedContent.trim()
                            ? "继续刚才被截断的回答，从中断处接着写。不要重复已经写过的内容，只输出续写内容。"
                            : "把刚才已经形成的思路整理成正式回答。不要重复题目，不要解释你在续写，只输出可直接展示给学生的回答。";
                        console.info("[AskAI] requesting continuation", {
                            reason: finishReason === "length" ? "length" : "truncated_sentence_coach",
                            visibleLength: visibleSoFar.length,
                        });

                        const continuationMessages: typeof chatMessages = [
                            ...chatMessages,
                            { role: "assistant", content: visibleSoFar.slice(-5000) },
                            { role: "user", content: continuationInstruction },
                        ];
                        const continuationStream = await aiClient.chat.completions.create({
                            messages: continuationMessages,
                            model: "deepseek-chat",
                            temperature: 0.25,
                            max_tokens: ASK_DETAILED_MAX_TOKENS,
                            stream: true,
                        });
                        await pumpStreamToClient(continuationStream, "continuation");
                    }
                    const cacheableContent = streamedContent.trim();
                    const cacheableReasoningContent = streamedReasoningContent.trim();
                    if (cacheableContent || cacheableReasoningContent) {
                        setServerAskCache(askCacheKey, {
                            content: cacheableContent,
                            reasoningContent: cacheableReasoningContent,
                        });
                    }
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (err) {
                    if (isAiProviderRateLimitError(err)) {
                        enqueueAskSse(controller, encoder, buildAiProviderRateLimitPayload("当前 AI 模型正在处理上一个请求，请稍等几秒再试。"));
                        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                        controller.close();
                        return;
                    }
                    controller.error(err);
                }
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                ...(readingCoinMutation
                    ? {
                        "x-reading-coins-balance": String(readingCoinMutation.balance),
                        "x-reading-coins-delta": String(readingCoinMutation.delta),
                        "x-reading-coins-applied": readingCoinMutation.applied ? "1" : "0",
                        "x-reading-coins-action": readingCoinMutation.action,
                    }
                    : {}),
            },
        });
    } catch (error) {
        if (isAiProviderRateLimitError(error)) {
            console.warn("Ask AI provider rate limited:", error);
            const retryAfterSeconds = getAiProviderRetryAfterSeconds(error);
            return new Response(
                JSON.stringify(buildAiProviderRateLimitPayload("当前 AI 模型正在处理上一个请求，请稍等几秒再试。")),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        ...(retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {}),
                    },
                },
            );
        }

        console.error("Ask AI Error:", error);
        return new Response(JSON.stringify({ error: "Failed to get answer" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
}
