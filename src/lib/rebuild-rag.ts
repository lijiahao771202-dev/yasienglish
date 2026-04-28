import { requestRagQuery, ensureBGEReady } from "@/lib/bge-client";
import { getRebuildPracticeTier } from "@/lib/rebuild-mode";

export type RebuildVocabularyVariant = "sentence" | "passage";
export type RebuildRagQueryStatus = "hit" | "empty" | "unavailable";

export type RebuildSystemVocabularyTarget = {
    level: "chuzhong" | "gaozhong" | "cet4" | "cet6" | "ielts" | "cefr";
    cefrLevel?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
};

function getRebuildSystemVocabularyTargets(effectiveElo: number): RebuildSystemVocabularyTarget[] {
    const cefr = getRebuildPracticeTier(effectiveElo).cefr;

    switch (cefr) {
        case "A1":
            return [
                { level: "chuzhong" },
                { level: "cefr", cefrLevel: "A1" },
            ];
        case "A2-":
            return [
                { level: "gaozhong" },
                { level: "cefr", cefrLevel: "A2" },
            ];
        case "A2+":
            return [
                { level: "gaozhong" },
                { level: "cet4" },
                { level: "cefr", cefrLevel: "A2" },
            ];
        case "B1":
            return [
                { level: "cet4" },
                { level: "cefr", cefrLevel: "B1" },
            ];
        case "B2":
            return [
                { level: "cet6" },
                { level: "cefr", cefrLevel: "B2" },
            ];
        case "C1":
            return [
                { level: "ielts" },
                { level: "cefr", cefrLevel: "C1" },
            ];
        case "C2":
        case "C2+":
            return [
                { level: "cefr", cefrLevel: "C2" },
                { level: "ielts" },
            ];
        default:
            return [{ level: "cefr" }];
    }
}

function normalizeVocabularyText(text: string) {
    return text.trim().replace(/\s+/g, " ");
}

export async function queryRebuildSystemVocabulary(args: {
    effectiveElo: number;
    query: string;
    variant: RebuildVocabularyVariant;
}) {
    const query = args.query.trim();
    if (query.length < 2) {
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

    const topKPerTarget = args.variant === "passage" ? 8 : 5;
    const resultLimit = args.variant === "passage" ? 12 : 8;
    const targets = getRebuildSystemVocabularyTargets(args.effectiveElo);
    try {
        const resultGroups = await Promise.all(
            targets.map((target) => requestRagQuery(
                query,
                topKPerTarget,
                0.1,
                "system",
                target.cefrLevel
                    ? { level: target.level, cefrLevel: target.cefrLevel }
                    : { level: target.level },
            )),
        );

        const seen = new Set<string>();
        const vocabulary = resultGroups
            .flat()
            .sort((left, right) => right.score - left.score)
            .map((item) => item.text)
            .map(normalizeVocabularyText)
            .filter((item) => {
                if (!item || seen.has(item)) {
                    return false;
                }
                seen.add(item);
                return true;
            })
            .slice(0, resultLimit);

        return {
            status: vocabulary.length > 0 ? "hit" as const : "empty" as const,
            vocabulary,
        };
    } catch {
        return {
            status: "unavailable" as const,
            vocabulary: [],
        };
    }
}

export { getRebuildSystemVocabularyTargets };
