"use client";

import { useCallback, useEffect, useLayoutEffect } from "react";
import type { RefObject } from "react";

import {
    buildFontShorthand,
    measureTextLayoutDetailedWithPretext,
    resolveLineHeightPx,
    type PretextWhiteSpaceMode,
} from "@/lib/text-layout/pretext";

type PretextLayoutMode = "paragraph" | "bubble";

interface UsePretextMeasuredLayoutOptions {
    text: string;
    mode: PretextLayoutMode;
    enabled?: boolean;
    whiteSpaceMode?: PretextWhiteSpaceMode;
    maxWidthRatio?: number;
    minBubbleWidthPx?: number;
}

function toPixelNumber(raw: string): number {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

function resetLayoutStyle(element: HTMLElement, mode: PretextLayoutMode) {
    element.style.removeProperty("--pretext-height-px");
    element.style.removeProperty("--pretext-line-count");
    element.style.removeProperty("--pretext-max-line-width-px");

    if (mode === "paragraph") {
        element.style.removeProperty("min-height");
        return;
    }

    element.style.removeProperty("width");
    element.style.removeProperty("max-width");
}

export function usePretextMeasuredLayout<T extends HTMLElement>(
    elementRef: RefObject<T | null>,
    {
        text,
        mode,
        enabled = true,
        whiteSpaceMode = "pre-wrap",
        maxWidthRatio = 0.85,
        minBubbleWidthPx = 84,
    }: UsePretextMeasuredLayoutOptions,
) {
    const syncLayout = useCallback(() => {
        if (typeof window === "undefined") return;
        const element = elementRef.current;
        if (!element) return;
        if (!enabled) {
            resetLayoutStyle(element, mode);
            return;
        }

        const style = window.getComputedStyle(element);
        const paddingTop = toPixelNumber(style.paddingTop);
        const paddingBottom = toPixelNumber(style.paddingBottom);
        const paddingLeft = toPixelNumber(style.paddingLeft);
        const paddingRight = toPixelNumber(style.paddingRight);
        const borderTop = toPixelNumber(style.borderTopWidth);
        const borderBottom = toPixelNumber(style.borderBottomWidth);
        const borderLeft = toPixelNumber(style.borderLeftWidth);
        const borderRight = toPixelNumber(style.borderRightWidth);
        const lineHeight = resolveLineHeightPx(style);
        const font = buildFontShorthand(style);

        const measuredText = (text || element.textContent || " ").replace(/\r\n?/g, "\n");
        if (measuredText.trim().length === 0) {
            resetLayoutStyle(element, mode);
            return;
        }

        const baseContainerWidth = mode === "bubble"
            ? element.parentElement?.clientWidth ?? element.clientWidth
            : element.clientWidth;
        const widthRatio = mode === "bubble" ? Math.min(Math.max(maxWidthRatio, 0.2), 1) : 1;
        const maxContentWidth = Math.max(
            1,
            baseContainerWidth * widthRatio - paddingLeft - paddingRight - borderLeft - borderRight,
        );

        const result = measureTextLayoutDetailedWithPretext({
            text: measuredText,
            font,
            maxWidth: maxContentWidth,
            lineHeight,
            whiteSpace: whiteSpaceMode,
        });
        if (!result) {
            resetLayoutStyle(element, mode);
            return;
        }

        element.style.setProperty("--pretext-height-px", `${Math.ceil(result.height)}px`);
        element.style.setProperty("--pretext-line-count", `${result.lineCount}`);
        element.style.setProperty("--pretext-max-line-width-px", `${Math.ceil(result.maxLineWidth)}px`);

        if (mode === "paragraph") {
            const blockHeight = Math.ceil(result.height + paddingTop + paddingBottom + borderTop + borderBottom);
            element.style.minHeight = `${Math.max(1, blockHeight)}px`;
            return;
        }

        const targetContentWidth = Math.min(maxContentWidth, Math.max(1, result.maxLineWidth));
        const targetWidth = Math.ceil(targetContentWidth + paddingLeft + paddingRight + borderLeft + borderRight);
        const maxBubbleWidth = Math.ceil(maxContentWidth + paddingLeft + paddingRight + borderLeft + borderRight);
        const finalWidth = Math.min(maxBubbleWidth, Math.max(minBubbleWidthPx, targetWidth));
        element.style.width = `${finalWidth}px`;
        element.style.maxWidth = `${maxBubbleWidth}px`;
    }, [
        elementRef,
        enabled,
        maxWidthRatio,
        minBubbleWidthPx,
        mode,
        text,
        whiteSpaceMode,
    ]);

    useLayoutEffect(() => {
        syncLayout();
    }, [syncLayout]);

    useEffect(() => {
        if (!enabled || typeof ResizeObserver === "undefined") return;
        const element = elementRef.current;
        if (!element) return;

        if (mode === "bubble") {
            const parent = element.parentElement;
            if (!parent) return;
            const observer = new ResizeObserver(() => {
                syncLayout();
            });
            observer.observe(parent);
            return () => observer.disconnect();
        }

        const observer = new ResizeObserver(() => {
            syncLayout();
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [elementRef, enabled, mode, syncLayout]);
}
