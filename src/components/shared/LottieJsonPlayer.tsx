"use client";

import { useEffect, useRef } from "react";

type LottieAnimationInstance = {
    destroy: () => void;
    play?: () => void;
    stop?: () => void;
    setSpeed?: (speed: number) => void;
};

type LottieGlobal = {
    loadAnimation: (config: {
        container: HTMLElement;
        renderer: "svg" | "canvas" | "html";
        loop: boolean;
        autoplay: boolean;
        animationData: unknown;
        rendererSettings?: {
            preserveAspectRatio?: string;
        };
    }) => LottieAnimationInstance;
};

declare global {
    interface Window {
        lottie?: LottieGlobal;
        __lottieLoaderPromise__?: Promise<LottieGlobal>;
    }
}

function loadLottieRuntime() {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Lottie runtime can only load in the browser."));
    }

    if (window.lottie) {
        return Promise.resolve(window.lottie);
    }

    if (window.__lottieLoaderPromise__) {
        return window.__lottieLoaderPromise__;
    }

    window.__lottieLoaderPromise__ = new Promise<LottieGlobal>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[data-lottie-runtime="true"]');
        if (existing) {
            existing.addEventListener("load", () => {
                if (window.lottie) resolve(window.lottie);
            });
            existing.addEventListener("error", () => reject(new Error("Failed to load Lottie runtime.")));
            return;
        }

        const script = document.createElement("script");
        script.src = "/vendor/lottie.min.js";
        script.async = true;
        script.dataset.lottieRuntime = "true";
        script.onload = () => {
            if (!window.lottie) {
                reject(new Error("Lottie runtime loaded but window.lottie is unavailable."));
                return;
            }
            resolve(window.lottie);
        };
        script.onerror = () => reject(new Error("Failed to load Lottie runtime."));
        document.head.appendChild(script);
    });

    return window.__lottieLoaderPromise__;
}

interface LottieJsonPlayerProps {
    animationData: unknown;
    className?: string;
    loop?: boolean;
    autoplay?: boolean;
    speed?: number;
}

export function LottieJsonPlayer({
    animationData,
    className,
    loop = true,
    autoplay = true,
    speed = 1,
}: LottieJsonPlayerProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let animation: LottieAnimationInstance | null = null;
        let cancelled = false;

        loadLottieRuntime()
            .then((lottie) => {
                if (cancelled || !containerRef.current) return;

                animation = lottie.loadAnimation({
                    container,
                    renderer: "svg",
                    loop,
                    autoplay,
                    animationData,
                    rendererSettings: {
                        preserveAspectRatio: "xMidYMid meet",
                    },
                });

                animation.setSpeed?.(speed);
            })
            .catch((error) => {
                console.error("[LottieJsonPlayer] Failed to initialize animation", error);
            });

        return () => {
            cancelled = true;
            animation?.destroy();
        };
    }, [animationData, autoplay, loop, speed]);

    return <div ref={containerRef} className={className} aria-hidden="true" />;
}
