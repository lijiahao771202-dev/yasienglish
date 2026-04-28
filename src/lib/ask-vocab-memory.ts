import { ensureBGEReady, requestRagQuery } from "@/lib/bge-client";
import { db, type VocabItem } from "@/lib/db";
import type { MeaningGroup } from "@/lib/vocab-meanings";

export type AskVocabMemoryStatus = "hit" | "empty" | "unavailable";

export interface AskRetrievedVocabItem {
    word: string;
    translation: string;
    definition?: string;
    example?: string;
    sourceSentence?: string;
    phonetic?: string;
    meaningHints: string[];
    highlightedMeanings: string[];
    morphologyNotes: string[];
    score: number;
}

function normalizeInlineText(value: string, maxLength: number) {
    return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizeList(values: unknown, limit: number, maxLength: number) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .map((value) => normalizeInlineText(String(value ?? ""), maxLength))
        .filter(Boolean)
        .slice(0, limit);
}

function buildMeaningHints(groups: MeaningGroup[] | undefined, translation: string) {
    const normalizedGroups = Array.isArray(groups) ? groups : [];
    const hints = normalizedGroups
        .map((group) => {
            const pos = normalizeInlineText(String(group.pos ?? ""), 16);
            const meanings = Array.isArray(group.meanings)
                ? group.meanings.map((item) => normalizeInlineText(String(item ?? ""), 32)).filter(Boolean).slice(0, 3)
                : [];
            if (!pos && meanings.length === 0) {
                return "";
            }
            if (!pos) {
                return meanings.join(" / ");
            }
            if (meanings.length === 0) {
                return pos;
            }
            return `${pos} ${meanings.join(" / ")}`;
        })
        .filter(Boolean)
        .slice(0, 3);

    if (hints.length > 0) {
        return hints;
    }

    const fallbackTranslation = normalizeInlineText(translation, 60);
    return fallbackTranslation ? [fallbackTranslation] : [];
}

function buildQueryCandidates(args: {
    paragraph: string;
    selection?: string;
    question: string;
}) {
    const selection = normalizeInlineText(args.selection ?? "", 280);
    const question = normalizeInlineText(args.question, 220);
    const paragraph = normalizeInlineText(args.paragraph, 320);

    const candidates = [
        selection,
        [selection, question].filter(Boolean).join("\n"),
        [question, selection || paragraph].filter(Boolean).join("\n"),
    ]
        .map((item) => item.trim())
        .filter(Boolean);

    return Array.from(new Set(candidates));
}

function hydrateVocabularyRecord(record: VocabItem, score: number): AskRetrievedVocabItem {
    const translation = normalizeInlineText(record.translation || record.definition || "", 120);

    return {
        word: normalizeInlineText(record.word, 64),
        translation,
        definition: normalizeInlineText(record.definition || "", 140) || undefined,
        example: normalizeInlineText(record.example || "", 180) || undefined,
        sourceSentence: normalizeInlineText(record.source_sentence || record.context || "", 180) || undefined,
        phonetic: normalizeInlineText(record.phonetic || "", 48) || undefined,
        meaningHints: buildMeaningHints(record.meaning_groups, translation),
        highlightedMeanings: normalizeList(record.highlighted_meanings, 3, 32),
        morphologyNotes: normalizeList(record.morphology_notes, 2, 80),
        score,
    };
}

function fallbackVocabularyItem(raw: { text: string; metadata?: { vocabId?: string }; score: number }): AskRetrievedVocabItem | null {
    const word = normalizeInlineText(raw.metadata?.vocabId || raw.text.split(/\s+-\s+/)[0] || "", 64);
    if (!word) {
        return null;
    }

    const [, ...rest] = raw.text.split(/\s+-\s+/);
    const translation = normalizeInlineText(rest.join(" - "), 120);

    return {
        word,
        translation,
        meaningHints: translation ? [translation] : [],
        highlightedMeanings: [],
        morphologyNotes: [],
        score: raw.score,
    };
}

export async function queryAskRelevantVocabulary(args: {
    paragraph: string;
    selection?: string;
    question: string;
    limit?: number;
}) {
    const queryCandidates = buildQueryCandidates(args);
    if (queryCandidates.length === 0) {
        return {
            status: "empty" as const,
            vocabulary: [],
        };
    }

    const isReady = await ensureBGEReady();
    if (!isReady) {
        return {
            status: "unavailable" as const,
            vocabulary: [],
        };
    }

    const limit = Math.min(Math.max(args.limit ?? 4, 1), 6);

    try {
        const resultGroups = await Promise.all(
            queryCandidates.slice(0, 2).map((query) => requestRagQuery(query, 6, 0.18, "vocab")),
        );

        const mergedHits = resultGroups
            .flat()
            .filter((item) => item.source === "vocab")
            .sort((left, right) => right.score - left.score);

        const seenWords = new Set<string>();
        const vocabulary: AskRetrievedVocabItem[] = [];

        for (const hit of mergedHits) {
            const vocabId = normalizeInlineText(String(hit.metadata?.vocabId ?? ""), 64);
            const dedupeKey = vocabId || normalizeInlineText(hit.text, 120);
            if (!dedupeKey || seenWords.has(dedupeKey)) {
                continue;
            }
            seenWords.add(dedupeKey);

            const hydratedRecord = vocabId ? await db.vocabulary.get(vocabId) : null;
            const hydrated = hydratedRecord
                ? hydrateVocabularyRecord(hydratedRecord, hit.score)
                : fallbackVocabularyItem(hit);

            if (!hydrated) {
                continue;
            }

            vocabulary.push(hydrated);
            if (vocabulary.length >= limit) {
                break;
            }
        }

        return {
            status: vocabulary.length > 0 ? "hit" as const : "empty" as const,
            vocabulary,
        };
    } catch (error) {
        console.warn("Ask vocab memory query failed", error);
        return {
            status: "unavailable" as const,
            vocabulary: [],
        };
    }
}
