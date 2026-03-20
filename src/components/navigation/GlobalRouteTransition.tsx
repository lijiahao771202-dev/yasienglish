"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

type TransitionPhase = "idle" | "exiting" | "entering";

const EXIT_MS = 420;
const ENTER_MS = 320;

export function GlobalRouteTransition() {
    const router = useRouter();
    const pathname = usePathname();
    const [phase, setPhase] = useState<TransitionPhase>("idle");
    const pendingHrefRef = useRef<string | null>(null);
    const navigatingRef = useRef(false);
    useEffect(() => {
        if (!navigatingRef.current) return;
        const startEnterId = window.setTimeout(() => {
            setPhase("entering");
        }, 0);
        navigatingRef.current = false;
        pendingHrefRef.current = null;
        const timer = window.setTimeout(() => {
            setPhase("idle");
        }, ENTER_MS);
        return () => {
            window.clearTimeout(startEnterId);
            window.clearTimeout(timer);
        };
    }, [pathname]);

    useEffect(() => {
        const onClickCapture = (event: MouseEvent) => {
            if (event.defaultPrevented) return;
            if (event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            if (phase === "exiting") return;

            const target = event.target as HTMLElement | null;
            const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
            if (!anchor) return;
            if (anchor.target && anchor.target !== "_self") return;
            if (anchor.hasAttribute("download")) return;
            if (anchor.getAttribute("rel")?.includes("external")) return;

            const href = anchor.getAttribute("href");
            if (!href) return;
            if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

            const url = new URL(anchor.href, window.location.href);
            if (url.origin !== window.location.origin) return;

            const next = `${url.pathname}${url.search}${url.hash}`;
            const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            if (next === current) return;

            event.preventDefault();
            pendingHrefRef.current = next;
            setPhase("exiting");
            navigatingRef.current = true;

            window.setTimeout(() => {
                if (!pendingHrefRef.current) return;
                router.push(pendingHrefRef.current);
            }, EXIT_MS);
        };

        document.addEventListener("click", onClickCapture, true);
        return () => {
            document.removeEventListener("click", onClickCapture, true);
        };
    }, [phase, router]);

    return (
        <AnimatePresence>
            {phase !== "idle" && (
                <motion.div
                    className="pointer-events-none fixed inset-0 z-[190]"
                    initial={{ opacity: phase === "exiting" ? 0 : 1 }}
                    animate={{ opacity: phase === "exiting" ? 1 : 0 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        duration: phase === "exiting" ? EXIT_MS / 1000 : ENTER_MS / 1000,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                >
                    <motion.div
                        className="absolute inset-0 bg-white/8"
                        initial={{ opacity: phase === "exiting" ? 0 : 0.9 }}
                        animate={{ opacity: phase === "exiting" ? 1 : 0 }}
                        transition={{ duration: phase === "exiting" ? EXIT_MS / 1000 : ENTER_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <motion.div
                        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,rgba(255,255,255,0.12),rgba(255,255,255,0.04)_52%,rgba(12,18,30,0.12)_100%)]"
                        initial={{ opacity: phase === "exiting" ? 0 : 0.8, scale: 1.01 }}
                        animate={{ opacity: phase === "exiting" ? 1 : 0, scale: 1 }}
                        transition={{ duration: phase === "exiting" ? EXIT_MS / 1000 : ENTER_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <motion.div
                        className="absolute inset-0 bg-[linear-gradient(112deg,rgba(255,255,255,0)_28%,rgba(255,255,255,0.22)_48%,rgba(255,255,255,0)_68%)]"
                        initial={{ opacity: phase === "exiting" ? 0.35 : 0.18, x: phase === "exiting" ? "-18%" : "8%" }}
                        animate={{ opacity: phase === "exiting" ? 0.22 : 0, x: phase === "exiting" ? "12%" : "18%" }}
                        transition={{ duration: phase === "exiting" ? EXIT_MS / 1000 : ENTER_MS / 1000, ease: [0.22, 1, 0.36, 1] }}
                    />
                </motion.div>
            )}
        </AnimatePresence>
    );
}
