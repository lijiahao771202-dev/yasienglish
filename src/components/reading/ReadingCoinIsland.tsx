"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Gem, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { type ReadingCoinFxEvent } from "@/lib/reading-coin-fx";

interface ReadingCoinIslandProps {
    event: ReadingCoinFxEvent | null;
}

export function ReadingCoinIsland({ event }: ReadingCoinIslandProps) {
    return (
        <AnimatePresence>
            {event ? (
                <motion.div
                    key={event.id}
                    className="pointer-events-none fixed left-1/2 top-[96px] z-[88] -translate-x-1/2"
                    initial={{ opacity: 0, y: -20, scale: 0.92, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -14, scale: 0.97, filter: "blur(6px)" }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div
                        className={cn(
                            "relative flex min-w-[280px] items-center gap-3 overflow-hidden rounded-[24px] border px-4 py-3 shadow-[0_26px_52px_-30px_rgba(15,23,42,0.82)] ring-1 backdrop-blur-2xl",
                            event.delta > 0
                                ? "border-emerald-200/75 bg-[linear-gradient(130deg,rgba(236,253,245,0.86),rgba(220,252,231,0.76),rgba(186,230,253,0.68))] ring-emerald-100/70"
                                : "border-rose-200/75 bg-[linear-gradient(130deg,rgba(255,241,242,0.88),rgba(254,226,226,0.78),rgba(255,237,213,0.68))] ring-rose-100/70",
                        )}
                    >
                        <div
                            className={cn(
                                "relative z-10 flex h-9 w-9 items-center justify-center rounded-full border bg-white/86 shadow-[0_10px_20px_-14px_rgba(15,23,42,0.7)]",
                                event.delta > 0 ? "border-emerald-200 text-emerald-600" : "border-rose-200 text-rose-600",
                            )}
                        >
                            <Gem className="h-4 w-4" />
                        </div>
                        <div className="relative z-10 min-w-0 flex-1">
                            <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                {event.delta > 0 ? "Reading Coin Gain" : "Reading Coin Consume"}
                            </p>
                            <p className="truncate text-[14px] font-bold text-slate-800">
                                {event.label}
                            </p>
                        </div>
                        <div
                            className={cn(
                                "relative z-10 flex items-center gap-1 rounded-full border bg-white/78 px-3 py-1 text-xs font-black tabular-nums",
                                event.delta > 0 ? "border-emerald-200 text-emerald-700" : "border-rose-200 text-rose-700",
                            )}
                        >
                            {event.delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            <span>{event.delta > 0 ? `+${event.delta}` : event.delta}</span>
                        </div>
                        <motion.div
                            className={cn(
                                "absolute inset-y-2 left-[-28%] w-[36%] -skew-x-12 bg-gradient-to-r blur-sm",
                                event.delta > 0 ? "from-transparent via-emerald-50/80 to-transparent" : "from-transparent via-rose-50/80 to-transparent",
                            )}
                            animate={{ x: [0, 340] }}
                            transition={{ duration: 1.05, ease: "easeInOut" }}
                        />
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

