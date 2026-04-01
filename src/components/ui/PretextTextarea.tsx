"use client";

import { forwardRef, type FormEvent, type TextareaHTMLAttributes, useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import {
    buildFontShorthand,
    measureTextLayoutWithPretext,
    resolveLineHeightPx,
    type PretextWhiteSpaceMode,
} from "@/lib/text-layout/pretext";

interface PretextTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    autoResize?: boolean;
    minRows?: number;
    maxRows?: number;
    measurementValue?: string;
    whiteSpaceMode?: PretextWhiteSpaceMode;
}

function toPixelNumber(raw: string): number {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0;
}

export const PretextTextarea = forwardRef<HTMLTextAreaElement, PretextTextareaProps>(function PretextTextarea(
    {
        autoResize = true,
        minRows,
        maxRows,
        measurementValue,
        whiteSpaceMode = "pre-wrap",
        className,
        rows,
        onInput,
        value,
        placeholder,
        ...props
    },
    forwardedRef,
) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const syncHeight = useCallback(() => {
        if (!autoResize || typeof window === "undefined") return;
        const element = textareaRef.current;
        if (!element) return;

        const style = window.getComputedStyle(element);
        const paddingTop = toPixelNumber(style.paddingTop);
        const paddingBottom = toPixelNumber(style.paddingBottom);
        const paddingLeft = toPixelNumber(style.paddingLeft);
        const paddingRight = toPixelNumber(style.paddingRight);
        const borderTop = toPixelNumber(style.borderTopWidth);
        const borderBottom = toPixelNumber(style.borderBottomWidth);
        const lineHeight = resolveLineHeightPx(style);
        const contentWidth = Math.max(1, element.clientWidth - paddingLeft - paddingRight);
        const minRowCount = Math.max(minRows ?? (typeof rows === "number" ? rows : 1), 1);
        const maxRowCount = maxRows && maxRows > 0 ? Math.max(maxRows, minRowCount) : null;
        const minContentHeight = minRowCount * lineHeight;
        const maxContentHeight = maxRowCount ? maxRowCount * lineHeight : Number.POSITIVE_INFINITY;
        const candidateText = (measurementValue ?? element.value) || element.placeholder || " ";
        const text = candidateText.length > 0 ? candidateText : " ";
        const font = buildFontShorthand(style);

        element.style.height = "auto";
        element.style.overflowY = "hidden";

        const pretextResult = measureTextLayoutWithPretext({
            text,
            font,
            maxWidth: contentWidth,
            lineHeight,
            whiteSpace: whiteSpaceMode,
        });

        const fallbackContentHeight = Math.max(
            lineHeight,
            element.scrollHeight - paddingTop - paddingBottom,
        );
        const rawContentHeight = pretextResult?.height ?? fallbackContentHeight;
        const clampedContentHeight = Math.max(
            minContentHeight,
            Math.min(maxContentHeight, rawContentHeight),
        );
        const totalHeight = Math.ceil(
            clampedContentHeight + paddingTop + paddingBottom + borderTop + borderBottom,
        );
        element.style.height = `${Math.max(totalHeight, 1)}px`;
        element.style.overflowY = Number.isFinite(maxContentHeight) && clampedContentHeight >= maxContentHeight
            ? "auto"
            : "hidden";
    }, [autoResize, maxRows, measurementValue, minRows, rows, whiteSpaceMode]);

    useLayoutEffect(() => {
        syncHeight();
    }, [placeholder, syncHeight, value]);

    useEffect(() => {
        if (!autoResize || typeof ResizeObserver === "undefined") return;
        const element = textareaRef.current;
        if (!element) return;

        const observer = new ResizeObserver(() => {
            syncHeight();
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [autoResize, syncHeight]);

    const handleInput = (event: FormEvent<HTMLTextAreaElement>) => {
        onInput?.(event);
        if (!autoResize) return;
        requestAnimationFrame(() => {
            syncHeight();
        });
    };

    return (
        <textarea
            {...props}
            value={value}
            placeholder={placeholder}
            rows={rows}
            ref={(node) => {
                textareaRef.current = node;
                if (typeof forwardedRef === "function") {
                    forwardedRef(node);
                } else if (forwardedRef) {
                    forwardedRef.current = node;
                }
            }}
            onInput={handleInput}
            className={cn(className)}
        />
    );
});
