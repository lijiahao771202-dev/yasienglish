import { describe, expect, it } from "vitest";

import {
    buildListeningBankDrill,
    LISTENING_DRILL_BANK,
    getListeningBandPosition,
    selectListeningBankItem,
    validateListeningBankItem,
} from "./listening-drill-bank";

function getSubBandStats(items: typeof LISTENING_DRILL_BANK) {
    const stats = new Map<string, { curated: number; draft: number; total: number }>();

    for (const item of items) {
        const key = `${item.cefr}|${item.bandPosition}`;
        const bucket = stats.get(key) ?? { curated: 0, draft: 0, total: 0 };
        bucket.total += 1;
        if (item.reviewStatus === "curated") {
            bucket.curated += 1;
        } else {
            bucket.draft += 1;
        }
        stats.set(key, bucket);
    }

    return stats;
}

describe("listening drill bank", () => {
    it("provides a curated low-band catalog with band positions", () => {
        const lowBand = LISTENING_DRILL_BANK.filter((item) => item.eloMax <= 1199);
        const bandCounts = {
            a1: lowBand.filter((item) => item.cefr === "A1").length,
            a2m: lowBand.filter((item) => item.cefr === "A2-").length,
            a2p: lowBand.filter((item) => item.cefr === "A2+").length,
        };
        const curatedCount = lowBand.filter((item) => item.reviewStatus === "curated").length;
        const draftCount = lowBand.filter((item) => item.reviewStatus === "draft").length;

        expect(lowBand).toHaveLength(1750);
        expect(bandCounts).toEqual({
            a1: 546,
            a2m: 592,
            a2p: 612,
        });

        expect(new Set(lowBand.map((item) => item.reviewStatus))).toEqual(new Set(["curated", "draft"]));
        expect(curatedCount).toBeGreaterThan(900);
        expect(draftCount).toBeGreaterThan(100);
        expect(new Set(lowBand.map((item) => item.bandPosition))).toEqual(new Set(["entry", "mid", "exit"]));
    });

    it("covers diverse low-band themes without relying on a single template family", () => {
        const lowBandThemes = new Set(
            LISTENING_DRILL_BANK
                .filter((item) => item.eloMax <= 1199)
                .map((item) => item.theme),
        );

        expect(lowBandThemes.size).toBeGreaterThanOrEqual(20);
    });

    it("provides a 2000-question mid-high catalog for elo 1200-2399", () => {
        const midHigh = LISTENING_DRILL_BANK.filter((item) => item.eloMin >= 1200 && item.eloMax <= 2399);
        const bandCounts = {
            b1: midHigh.filter((item) => item.cefr === "B1").length,
            b2: midHigh.filter((item) => item.cefr === "B2").length,
            c1: midHigh.filter((item) => item.cefr === "C1").length,
        };
        const themes = new Set(midHigh.map((item) => item.theme));

        expect(midHigh).toHaveLength(2000);
        expect(bandCounts).toEqual({
            b1: 672,
            b2: 666,
            c1: 662,
        });
        expect(themes.size).toBeGreaterThanOrEqual(24);
        expect(new Set(midHigh.map((item) => item.bandPosition))).toEqual(new Set(["entry", "mid", "exit"]));
    });

    it("provides a 1000-question high-band catalog for elo 2400+", () => {
        const highBand = LISTENING_DRILL_BANK.filter((item) => item.eloMin >= 2400);
        const bandCounts = {
            c2: highBand.filter((item) => item.cefr === "C2").length,
            c2p: highBand.filter((item) => item.cefr === "C2+").length,
        };
        const themes = new Set(highBand.map((item) => item.theme));

        expect(highBand).toHaveLength(1000);
        expect(bandCounts).toEqual({
            c2: 500,
            c2p: 500,
        });
        expect(themes.size).toBeGreaterThanOrEqual(20);
        expect(new Set(highBand.map((item) => item.bandPosition))).toEqual(new Set(["entry", "mid", "exit"]));
        expect(new Set(highBand.map((item) => item.reviewStatus))).toEqual(new Set(["curated"]));
    });

    it("keeps at least 100 curated questions in every cefr sub-band", () => {
        const stats = getSubBandStats(LISTENING_DRILL_BANK);
        const expectedKeys = [
            "A1|entry",
            "A1|mid",
            "A1|exit",
            "A2-|entry",
            "A2-|mid",
            "A2-|exit",
            "A2+|entry",
            "A2+|mid",
            "A2+|exit",
            "B1|entry",
            "B1|mid",
            "B1|exit",
            "B2|entry",
            "B2|mid",
            "B2|exit",
            "C1|entry",
            "C1|mid",
            "C1|exit",
            "C2|entry",
            "C2|mid",
            "C2|exit",
            "C2+|entry",
            "C2+|mid",
            "C2+|exit",
        ];

        expect([...stats.keys()].sort()).toEqual(expectedKeys.slice().sort());
        for (const key of expectedKeys) {
            expect(stats.get(key)?.curated, key).toBeGreaterThanOrEqual(100);
        }
    });

    it("keeps every seeded item valid for the middle of its elo band", () => {
        for (const item of LISTENING_DRILL_BANK) {
            const elo = Math.floor((item.eloMin + item.eloMax) / 2);
            const validation = validateListeningBankItem(item, elo);
            expect(validation.isValid, item.id).toBe(true);
        }
    });

    it("selects curated questions for representative elo values across every sub-band", () => {
        const cases = [
            { elo: 40, cefr: "A1", bandPosition: "entry" },
            { elo: 200, cefr: "A1", bandPosition: "mid" },
            { elo: 320, cefr: "A1", bandPosition: "exit" },
            { elo: 450, cefr: "A2-", bandPosition: "entry" },
            { elo: 610, cefr: "A2-", bandPosition: "mid" },
            { elo: 760, cefr: "A2-", bandPosition: "exit" },
            { elo: 830, cefr: "A2+", bandPosition: "entry" },
            { elo: 990, cefr: "A2+", bandPosition: "mid" },
            { elo: 1120, cefr: "A2+", bandPosition: "exit" },
            { elo: 1250, cefr: "B1", bandPosition: "entry" },
            { elo: 1400, cefr: "B1", bandPosition: "mid" },
            { elo: 1500, cefr: "B1", bandPosition: "exit" },
            { elo: 1650, cefr: "B2", bandPosition: "entry" },
            { elo: 1800, cefr: "B2", bandPosition: "mid" },
            { elo: 1950, cefr: "B2", bandPosition: "exit" },
            { elo: 2050, cefr: "C1", bandPosition: "entry" },
            { elo: 2200, cefr: "C1", bandPosition: "mid" },
            { elo: 2350, cefr: "C1", bandPosition: "exit" },
            { elo: 2450, cefr: "C2", bandPosition: "entry" },
            { elo: 2600, cefr: "C2", bandPosition: "mid" },
            { elo: 2750, cefr: "C2", bandPosition: "exit" },
            { elo: 2850, cefr: "C2+", bandPosition: "entry" },
            { elo: 3000, cefr: "C2+", bandPosition: "mid" },
            { elo: 3200, cefr: "C2+", bandPosition: "exit" },
        ] as const;

        for (const testCase of cases) {
            const item = selectListeningBankItem({ elo: testCase.elo, random: () => 0 });
            expect(item, String(testCase.elo)).not.toBeNull();
            expect(item?.cefr, String(testCase.elo)).toBe(testCase.cefr);
            expect(item?.bandPosition, String(testCase.elo)).toBe(testCase.bandPosition);
            expect(item?.reviewStatus, String(testCase.elo)).toBe("curated");
        }
    });

    it("selects a valid bank item for listening elo", () => {
        const item = selectListeningBankItem({ elo: 830, random: () => 0 });
        expect(item).not.toBeNull();
        expect(item?.cefr).toBe("A2+");
        expect(item?.bandPosition).toBe("entry");
        expect(item?.reviewStatus).toBe("curated");
        expect(item && validateListeningBankItem(item, 830).isValid).toBe(true);
    });

    it("maps low-band elo to entry, mid, and exit positions", () => {
        expect(getListeningBandPosition(40)).toBe("entry");
        expect(getListeningBandPosition(200)).toBe("mid");
        expect(getListeningBandPosition(320)).toBe("exit");
        expect(getListeningBandPosition(450)).toBe("entry");
        expect(getListeningBandPosition(610)).toBe("mid");
        expect(getListeningBandPosition(760)).toBe("exit");
        expect(getListeningBandPosition(820)).toBe("entry");
        expect(getListeningBandPosition(990)).toBe("mid");
        expect(getListeningBandPosition(1120)).toBe("exit");
        expect(getListeningBandPosition(1250)).toBe("entry");
        expect(getListeningBandPosition(1400)).toBe("mid");
        expect(getListeningBandPosition(1500)).toBe("exit");
        expect(getListeningBandPosition(1650)).toBe("entry");
        expect(getListeningBandPosition(1800)).toBe("mid");
        expect(getListeningBandPosition(1950)).toBe("exit");
        expect(getListeningBandPosition(2050)).toBe("entry");
        expect(getListeningBandPosition(2200)).toBe("mid");
        expect(getListeningBandPosition(2350)).toBe("exit");
        expect(getListeningBandPosition(2450)).toBe("entry");
        expect(getListeningBandPosition(2600)).toBe("mid");
        expect(getListeningBandPosition(2750)).toBe("exit");
        expect(getListeningBandPosition(2850)).toBe("entry");
        expect(getListeningBandPosition(3000)).toBe("mid");
        expect(getListeningBandPosition(3200)).toBe("exit");
    });

    it("prefers an exact band-position match before falling back", () => {
        const entry = selectListeningBankItem({ elo: 450, random: () => 0 });
        const mid = selectListeningBankItem({ elo: 610, random: () => 0 });
        const exit = selectListeningBankItem({ elo: 760, random: () => 0 });

        expect(entry?.bandPosition).toBe("entry");
        expect(mid?.bandPosition).toBe("mid");
        expect(exit?.bandPosition).toBe("exit");
    });

    it("prefers curated items over draft templates when both exist", () => {
        const item = selectListeningBankItem({ elo: 40, random: () => 0 });
        expect(item).not.toBeNull();
        expect(item?.reviewStatus).toBe("curated");
        expect(item?.id.startsWith("listen-auto-")).toBe(false);
    });

    it("prefers curated items in mid-high bands before generated coverage", () => {
        const b1 = selectListeningBankItem({ elo: 1250, random: () => 0 });
        const b2 = selectListeningBankItem({ elo: 1650, random: () => 0 });
        const c1 = selectListeningBankItem({ elo: 2050, random: () => 0 });

        expect(b1).not.toBeNull();
        expect(b2).not.toBeNull();
        expect(c1).not.toBeNull();
        expect(b1?.reviewStatus).toBe("curated");
        expect(b2?.reviewStatus).toBe("curated");
        expect(c1?.reviewStatus).toBe("curated");
    });

    it("selects curated items in the high bands with the correct sub-band match", () => {
        const c2 = selectListeningBankItem({ elo: 2450, random: () => 0 });
        const c2p = selectListeningBankItem({ elo: 3000, random: () => 0 });

        expect(c2).not.toBeNull();
        expect(c2p).not.toBeNull();
        expect(c2?.cefr).toBe("C2");
        expect(c2?.bandPosition).toBe("entry");
        expect(c2?.reviewStatus).toBe("curated");
        expect(c2p?.cefr).toBe("C2+");
        expect(c2p?.bandPosition).toBe("mid");
        expect(c2p?.reviewStatus).toBe("curated");
    });

    it("builds a drill payload with source metadata", () => {
        const item = selectListeningBankItem({ elo: 1250, random: () => 0 });
        expect(item).not.toBeNull();
        const payload = buildListeningBankDrill(item!, 1250);
        expect(payload._sourceMeta).toEqual({
            sourceMode: "bank",
            bankItemId: item!.id,
            bandPosition: "entry",
            reviewStatus: "curated",
        });
        expect(payload._difficultyMeta.status).toBe("MATCHED");
    });
});
