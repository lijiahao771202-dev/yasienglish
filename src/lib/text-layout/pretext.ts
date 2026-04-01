import {
    layout,
    prepare,
    prepareWithSegments,
    type PrepareOptions,
    type PreparedText,
    type PreparedTextWithSegments,
    walkLineRanges,
} from "@chenglou/pretext";

export type PretextWhiteSpaceMode = NonNullable<PrepareOptions["whiteSpace"]>;

export interface PretextMeasureInput {
    text: string;
    font: string;
    maxWidth: number;
    lineHeight: number;
    whiteSpace?: PretextWhiteSpaceMode;
}

export interface PretextMeasureResult {
    height: number;
    lineCount: number;
}

export interface PretextDetailedMeasureResult extends PretextMeasureResult {
    maxLineWidth: number;
}

const PREPARED_CACHE_LIMIT = 1200;
const preparedCache = new Map<string, PreparedText>();
const preparedWithSegmentsCache = new Map<string, PreparedTextWithSegments>();
let runtimeAvailabilityCache: boolean | null = null;

function normalizeInputText(text: string): string {
    return text.replace(/\r\n?/g, "\n");
}

function getPreparedCacheKey(text: string, font: string, whiteSpace: PretextWhiteSpaceMode): string {
    return `${font}\u0000${whiteSpace}\u0000${text}`;
}

function trimPreparedCache() {
    while (preparedCache.size > PREPARED_CACHE_LIMIT) {
        const oldestKey = preparedCache.keys().next().value;
        if (oldestKey === undefined) break;
        preparedCache.delete(oldestKey);
    }
}

function getPreparedText(text: string, font: string, whiteSpace: PretextWhiteSpaceMode): PreparedText {
    const key = getPreparedCacheKey(text, font, whiteSpace);
    const cached = preparedCache.get(key);
    if (cached) {
        return cached;
    }
    const next = prepare(text, font, { whiteSpace });
    preparedCache.set(key, next);
    trimPreparedCache();
    return next;
}

function getPreparedTextWithSegments(text: string, font: string, whiteSpace: PretextWhiteSpaceMode): PreparedTextWithSegments {
    const key = getPreparedCacheKey(text, font, whiteSpace);
    const cached = preparedWithSegmentsCache.get(key);
    if (cached) {
        return cached;
    }
    const next = prepareWithSegments(text, font, { whiteSpace });
    preparedWithSegmentsCache.set(key, next);
    trimPreparedCache();
    return next;
}

function detectPretextRuntime(): boolean {
    if (typeof window === "undefined") {
        return false;
    }

    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent || "")) {
        return false;
    }

    if (typeof OffscreenCanvas !== "undefined") {
        return true;
    }

    if (typeof document === "undefined") {
        return false;
    }

    try {
        const canvas = document.createElement("canvas");
        return typeof canvas.getContext === "function" && !!canvas.getContext("2d");
    } catch {
        return false;
    }
}

export function canUsePretextRuntime(): boolean {
    if (runtimeAvailabilityCache === null) {
        runtimeAvailabilityCache = detectPretextRuntime();
    }
    return runtimeAvailabilityCache;
}

export function buildFontShorthand(style: CSSStyleDeclaration): string {
    const fontStyle = style.fontStyle || "normal";
    const fontVariant = style.fontVariant || "normal";
    const fontWeight = style.fontWeight || "400";
    const fontSize = style.fontSize || "16px";
    const fontFamily = style.fontFamily || "sans-serif";
    return `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize} ${fontFamily}`;
}

export function resolveLineHeightPx(style: CSSStyleDeclaration): number {
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
        return lineHeight;
    }
    const fontSize = Number.parseFloat(style.fontSize);
    if (Number.isFinite(fontSize) && fontSize > 0) {
        return fontSize * 1.4;
    }
    return 22;
}

export function measureTextLayoutWithPretext(input: PretextMeasureInput): PretextMeasureResult | null {
    const detailed = measureTextLayoutDetailedWithPretext(input);
    if (!detailed) {
        return null;
    }
    return {
        height: detailed.height,
        lineCount: detailed.lineCount,
    };
}

export function measureTextLayoutDetailedWithPretext(input: PretextMeasureInput): PretextDetailedMeasureResult | null {
    if (!canUsePretextRuntime()) {
        return null;
    }

    const font = input.font.trim();
    if (!font) {
        return null;
    }

    const whiteSpace = input.whiteSpace ?? "pre-wrap";
    const maxWidth = Number.isFinite(input.maxWidth) ? Math.max(1, input.maxWidth) : 1;
    const lineHeight = Number.isFinite(input.lineHeight) ? Math.max(1, input.lineHeight) : 1;
    const normalizedText = normalizeInputText(input.text || " ");

    try {
        const prepared = getPreparedText(normalizedText, font, whiteSpace);
        const preparedWithSegments = getPreparedTextWithSegments(normalizedText, font, whiteSpace);
        let maxLineWidth = 0;
        walkLineRanges(preparedWithSegments, maxWidth, (line) => {
            if (line.width > maxLineWidth) {
                maxLineWidth = line.width;
            }
        });
        const result = layout(prepared, maxWidth, lineHeight);
        return {
            height: Math.max(lineHeight, result.height),
            lineCount: Math.max(1, result.lineCount),
            maxLineWidth: Math.max(0, maxLineWidth),
        };
    } catch {
        runtimeAvailabilityCache = false;
        return null;
    }
}

export function clearPretextPreparedCache() {
    preparedCache.clear();
    preparedWithSegmentsCache.clear();
    runtimeAvailabilityCache = null;
}
