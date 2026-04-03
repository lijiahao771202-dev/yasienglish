import type { CSSProperties } from "react";

export function getPressableStyle(shadowColor: string, depth = 6): CSSProperties {
    return {
        ["--press-shadow-color" as string]: shadowColor,
        ["--press-depth" as string]: `${depth}px`,
    };
}

export function getPressableTap(reducedMotion: boolean, depth = 6, scale = 0.98) {
    if (reducedMotion) return undefined;
    return { y: depth, scale };
}
