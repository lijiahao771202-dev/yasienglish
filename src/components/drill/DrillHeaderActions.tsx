"use client";

import { RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

type EconomyTargetId = "coins" | "capsule" | "hint_ticket" | "vocab_ticket" | "audio_ticket" | "refresh_ticket";

interface DrillHeaderActionsThemeUi {
    audioUnlockedClass: string;
    checkButtonClass: string;
    iconButtonClass: string;
    ledgerClass: string;
}

export interface DrillHeaderActionsProps {
    activeCosmeticUi: DrillHeaderActionsThemeUi;
    audioTicketCount: number;
    canUseModeShop: boolean;
    capsuleCount: number;
    coins: number;
    getEconomyPulseClass: (targetId: EconomyTargetId) => string;
    hintTicketCount: number;
    isHintShake: boolean;
    isShopInventoryExpanded: boolean;
    onClose?: (() => void) | null;
    onOpenShop: () => void;
    onShopDockHoveredChange: (value: boolean) => void;
    refreshTicketCount: number;
    setEconomyTargetRef: (targetId: EconomyTargetId) => (node: HTMLDivElement | null) => void;
    shopDockHasHoverSupport: boolean;
    vocabTicketCount: number;
}

export function DrillHeaderActions({
    activeCosmeticUi,
    audioTicketCount,
    canUseModeShop,
    capsuleCount,
    coins,
    getEconomyPulseClass,
    hintTicketCount,
    isHintShake,
    isShopInventoryExpanded,
    onClose,
    onOpenShop,
    onShopDockHoveredChange,
    refreshTicketCount,
    setEconomyTargetRef,
    shopDockHasHoverSupport,
    vocabTicketCount,
}: DrillHeaderActionsProps) {
    return (
        <div className="flex items-center gap-2">
            {canUseModeShop && (
                <div
                    className={cn(
                        "hidden md:flex items-center h-[38px] gap-1 p-0.5 rounded-full backdrop-blur-xl border ring-1 shrink-0 transition-all duration-300",
                        activeCosmeticUi.ledgerClass,
                        isHintShake && "animate-[shake_0.4s_ease-in-out] border-red-300 shadow-[0_0_18px_rgba(220,38,38,0.2)]"
                    )}
                    onMouseEnter={() => {
                        if (shopDockHasHoverSupport) onShopDockHoveredChange(true);
                    }}
                    onMouseLeave={() => {
                        if (shopDockHasHoverSupport) onShopDockHoveredChange(false);
                    }}
                    onFocusCapture={() => onShopDockHoveredChange(true)}
                    onBlurCapture={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            onShopDockHoveredChange(false);
                        }
                    }}
                >
                    <div
                        className={cn(
                            "overflow-hidden transition-all duration-300 ease-out",
                            isShopInventoryExpanded ? "max-w-[460px] opacity-100 mr-1" : "max-w-0 opacity-0 mr-0"
                        )}
                        aria-hidden={!isShopInventoryExpanded}
                    >
                        <div className="flex items-center h-[34px] shrink-0 gap-1 px-1">
                            <div
                                ref={setEconomyTargetRef("coins")}
                                data-economy-target="coins"
                                className={cn("flex items-center gap-1 px-2.5 h-full rounded-full transition-all duration-300 cursor-default text-stone-700 hover:bg-white/70", getEconomyPulseClass("coins"))}
                            >
                                <span className="text-[12px] leading-none drop-shadow-sm mb-[1px]">✨</span>
                                <span className="font-mono font-bold text-[12px] tabular-nums">{coins}</span>
                            </div>

                            <div
                                ref={setEconomyTargetRef("capsule")}
                                data-economy-target="capsule"
                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-blue-700/80 hover:bg-blue-50", getEconomyPulseClass("capsule"))}
                            >
                                <span className="text-[11px] leading-none mb-[1px]">💊</span>
                                <span className="font-mono font-semibold text-[11px] tabular-nums">{capsuleCount}</span>
                            </div>

                            <div
                                ref={setEconomyTargetRef("hint_ticket")}
                                data-economy-target="hint_ticket"
                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-amber-700/80 hover:bg-amber-50", getEconomyPulseClass("hint_ticket"))}
                            >
                                <span className="text-[11px] leading-none mb-[1px]">🪄</span>
                                <span className="font-mono font-semibold text-[11px] tabular-nums">{hintTicketCount}</span>
                            </div>

                            <div
                                ref={setEconomyTargetRef("vocab_ticket")}
                                data-economy-target="vocab_ticket"
                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-emerald-700/80 hover:bg-emerald-50", getEconomyPulseClass("vocab_ticket"))}
                            >
                                <span className="text-[11px] leading-none mb-[1px]">🧩</span>
                                <span className="font-mono font-semibold text-[11px] tabular-nums">{vocabTicketCount}</span>
                            </div>

                            <div
                                ref={setEconomyTargetRef("audio_ticket")}
                                data-economy-target="audio_ticket"
                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-indigo-700/80 hover:bg-indigo-50", getEconomyPulseClass("audio_ticket"))}
                            >
                                <span className="text-[11px] leading-none mb-[1px]">🔊</span>
                                <span className="font-mono font-semibold text-[11px] tabular-nums">{audioTicketCount}</span>
                            </div>

                            <div
                                ref={setEconomyTargetRef("refresh_ticket")}
                                data-economy-target="refresh_ticket"
                                className={cn("flex items-center gap-1 px-2 h-full rounded-full transition-all duration-300 cursor-default text-cyan-700/80 hover:bg-cyan-50", getEconomyPulseClass("refresh_ticket"))}
                            >
                                <RefreshCw className="h-[11px] w-[11px]" />
                                <span className="font-mono font-semibold text-[11px] tabular-nums">{refreshTicketCount}</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onOpenShop}
                        className={cn(
                            "relative flex items-center justify-center h-full min-w-[68px] rounded-full px-4 transition-all duration-300 shrink-0 border",
                            activeCosmeticUi.audioUnlockedClass
                        )}
                        title="打开商场"
                    >
                        <span className="font-bold text-[11px] tracking-widest leading-none mt-[1px]">商场</span>
                    </button>
                </div>
            )}

            {onClose && (
                <button
                    onClick={onClose}
                    className={cn(
                        "w-[38px] h-[38px] rounded-full flex items-center justify-center transition-all duration-300 group shrink-0 border",
                        activeCosmeticUi.iconButtonClass
                    )}
                >
                    <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
                </button>
            )}
        </div>
    );
}
