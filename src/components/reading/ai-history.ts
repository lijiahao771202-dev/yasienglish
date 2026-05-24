import type { ArticleItem } from "./RecommendedArticles";

export type HistoryDifficultyFilter = "all" | "cet4" | "cet6" | "ielts";

export function getAIGenerationDifficultyCounts(items: ArticleItem[]) {
    const counts = items.reduce<Record<Exclude<HistoryDifficultyFilter, "all">, number>>((accumulator, item) => {
        if (item.difficulty === "cet4" || item.difficulty === "cet6" || item.difficulty === "ielts") {
            accumulator[item.difficulty] += 1;
        }
        return accumulator;
    }, {
        cet4: 0,
        cet6: 0,
        ielts: 0,
    });

    return [
        { id: "all" as const, label: "全部", count: items.length },
        { id: "cet4" as const, label: "四级", count: counts.cet4 },
        { id: "cet6" as const, label: "六级", count: counts.cet6 },
        { id: "ielts" as const, label: "雅思", count: counts.ielts },
    ];
}

export function filterAIGenerationHistory(
    items: ArticleItem[],
    filter: HistoryDifficultyFilter,
) {
    if (filter === "all") {
        return items;
    }

    return items.filter((item) => item.difficulty === filter);
}
