"use client";

import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface DrillShopModalItem {
    canBuy: boolean;
    consumeAction: string;
    count: number;
    description: string;
    icon: string;
    id: string;
    isFocused: boolean;
    name: string;
    price: number;
}

export interface DrillShopModalProps {
    canUseModeShop: boolean;
    checkButtonClass: string;
    coins: number;
    iconButtonClass: string;
    itemClass: string;
    isOpen: boolean;
    items: DrillShopModalItem[];
    mutedClass: string;
    onBuy: (itemId: string) => void;
    onClose: () => void;
    shellClass: string;
    textClass: string;
    wordBadgeActiveClass: string;
}

export function DrillShopModal({
    canUseModeShop,
    checkButtonClass,
    coins,
    iconButtonClass,
    itemClass,
    isOpen,
    items,
    mutedClass,
    onBuy,
    onClose,
    shellClass,
    textClass,
    wordBadgeActiveClass,
}: DrillShopModalProps) {
    return (
        <AnimatePresence key="shop-modal">
            {isOpen && canUseModeShop ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: 18, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 12, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className={cn(
                            "w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.24)]",
                            shellClass,
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-white/55 px-5 py-4">
                            <div className="space-y-1">
                                <p className={cn("text-sm font-black tracking-[0.2em]", textClass)}>商场</p>
                                <p className={cn("text-xs", mutedClass)}>金币购买道具，立即生效</p>
                            </div>
                            <div className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 border", iconButtonClass)}>
                                <span className="text-sm">✨</span>
                                <span className="font-mono text-sm font-black tabular-nums">{coins}</span>
                            </div>
                        </div>

                        <div className="space-y-3 p-4">
                            {items.map((item) => (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "rounded-2xl border p-4 flex items-center justify-between gap-4 transition-all",
                                        itemClass,
                                        item.isFocused
                                            ? "ring-2 ring-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.75),0_18px_36px_rgba(15,23,42,0.12)]"
                                            : "hover:-translate-y-0.5",
                                    )}
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">{item.icon}</span>
                                            <p className={cn("text-sm font-bold", textClass)}>{item.name}</p>
                                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-mono font-bold", wordBadgeActiveClass)}>
                                                x {item.count}
                                            </span>
                                        </div>
                                        <p className={cn("mt-1 text-xs", mutedClass)}>{item.description}</p>
                                        <p className={cn("mt-1 text-[11px] font-medium opacity-85", mutedClass)}>用途：{item.consumeAction}</p>
                                    </div>

                                    <button
                                        onClick={() => onBuy(item.id)}
                                        disabled={!item.canBuy}
                                        className={cn(
                                            "shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-all",
                                            item.canBuy
                                                ? cn(checkButtonClass, "hover:-translate-y-0.5")
                                                : "bg-stone-100 text-stone-400 border-stone-200 cursor-not-allowed",
                                        )}
                                        title={item.canBuy ? `花费 ${item.price} ✨ 购买 1 个 ${item.name}` : `星光币不足 ${item.price} ✨`}
                                    >
                                        {item.price} ✨ 购买
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="px-5 pb-4 flex justify-end">
                            <button
                                onClick={onClose}
                                className={cn("rounded-full border px-4 py-2 text-xs font-bold transition-all", iconButtonClass)}
                            >
                                关闭
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
