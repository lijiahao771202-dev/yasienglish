"use client";

import { memo, useEffect, useState } from "react";
import { BrainCircuit, Skull, Zap } from "lucide-react";
import { requestSemanticGrade, subscribeBGEStatus, type BGEStatus } from "@/lib/bge-client";
import { cn } from "@/lib/utils";

export const LocalEngineBadge = memo(function LocalEngineBadge() {
    const [bgeStatus, setBgeStatus] = useState<BGEStatus>("idle");

    useEffect(() => {
        const unsubscribe = subscribeBGEStatus((status) => setBgeStatus(status));
        return () => {
            if (typeof unsubscribe === "function") {
                unsubscribe();
            }
        };
    }, []);

    const pingEngine = async () => {
        if (bgeStatus !== "ready") return;
        setBgeStatus("loading");
        try {
            await requestSemanticGrade("ping", "ping");
            setTimeout(() => setBgeStatus("ready"), 300);
        } catch {
            setBgeStatus("error");
        }
    };

    if (bgeStatus === "idle") return null;

    return (
        <div
            onClick={pingEngine}
            className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-all",
                bgeStatus === "ready"
                    ? "border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100 dark:border-teal-800/50 dark:bg-teal-900/20 dark:text-teal-400"
                    : bgeStatus === "loading"
                        ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-400"
                        : "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-800/50 dark:bg-rose-900/20 dark:text-rose-400",
            )}
            title="点击进行测试 (Ping)"
        >
            {bgeStatus === "loading" ? (
                <Zap className="h-2.5 w-2.5 animate-pulse fill-amber-500" />
            ) : bgeStatus === "ready" ? (
                <BrainCircuit className="h-2.5 w-2.5" />
            ) : (
                <Skull className="h-2.5 w-2.5" />
            )}
            {bgeStatus === "ready"
                ? "Xenova/bge-m3 离线运算舱：就绪 (Ping 检测正常)"
                : bgeStatus === "loading"
                    ? "Xenova/bge-m3 硬件装载校验中..."
                    : "本地向量引擎掉线"}
        </div>
    );
});
