"use client";

import { motion } from "framer-motion";
import { BACKGROUND_THEMES, BackgroundThemeId } from "@/lib/background-preferences";
import { ThemeThumbnailMock } from "./ThemeThumbnailMock";
import { Check } from "lucide-react";

interface LiveThemeThumbnailSelectorProps {
    currentThemeId: BackgroundThemeId;
    onThemeSelect: (themeId: BackgroundThemeId) => void;
}

export function LiveThemeThumbnailSelector({ currentThemeId, onThemeSelect }: LiveThemeThumbnailSelectorProps) {
    return (
        <div className="flex w-full gap-4 overflow-x-auto overflow-y-hidden pb-4 pt-2 px-2 snap-x snap-mandatory __hide-scrollbars">
            {BACKGROUND_THEMES.map((theme) => {
                const isSelected = theme.id === currentThemeId;

                return (
                    <motion.button
                        key={theme.id}
                        type="button"
                        onClick={() => onThemeSelect(theme.id)}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        className={`relative flex-shrink-0 snap-center flex flex-col items-center gap-2 group outline-none`}
                    >
                        {/* Selected Indicator Ring */}
                        <div
                            className={`absolute -inset-1.5 rounded-2xl border-[3px] transition-colors duration-300 ${
                                isSelected ? "border-[#facc15] shadow-[0_0_12px_rgba(250,204,21,0.4)] z-0" : "border-transparent z-0"
                            }`}
                        />

                        {/* Theme Live Preview Container */}
                        <div 
                            className="relative w-[132px] h-[100px] rounded-xl overflow-hidden bg-white shadow-md border border-gray-200 isolation z-10 transition-shadow group-hover:shadow-lg"
                            data-bg-theme={theme.id}
                            title={theme.description}
                        >
                            {/* The Live Scaling Wrapper */}
                            <div className="absolute inset-0 bg-theme-base-bg transition-colors duration-500">
                                <div 
                                    className="origin-top-left"
                                    style={{ transform: "scale(0.33)" }} 
                                    aria-hidden="true"
                                >
                                    <ThemeThumbnailMock />
                                </div>
                            </div>
                            
                            {/* Optional: Hover Overlay showing Name/Description visually if needed, right now we just show it below */}
                            {isSelected && (
                                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-[#facc15] rounded-full flex items-center justify-center shadow-sm z-20">
                                    <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />
                                </div>
                            )}
                        </div>

                        {/* Theme Label */}
                        <span className={`text-[12px] font-black tracking-tight z-10 ${isSelected ? "text-theme-text" : "text-gray-500 group-hover:text-theme-text"}`}>
                            {theme.name}
                        </span>
                    </motion.button>
                );
            })}
        </div>
    );
}
