"use client";

import { useEffect, useMemo, useState } from "react";
import {
    BACKGROUND_THEMES,
    DEFAULT_BACKGROUND_THEME,
    getBackgroundThemeSpec,
    getSavedBackgroundTheme,
    setSavedBackgroundTheme,
} from "@/lib/background-preferences";

interface BackgroundThemePickerProps {
    userId?: string | null;
}

export function BackgroundThemePicker({ userId }: BackgroundThemePickerProps) {
    const [selected, setSelected] = useState(DEFAULT_BACKGROUND_THEME);

    useEffect(() => {
        setSelected(getSavedBackgroundTheme(userId));
    }, [userId]);

    const selectedSpec = useMemo(() => getBackgroundThemeSpec(selected), [selected]);

    return (
        <section className="rounded-[1.2rem] border border-[#e9edf5] bg-white p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#97a0b2]">Background</p>
                    <p className="text-sm font-semibold text-[#111827]">主题背景</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setSavedBackgroundTheme(DEFAULT_BACKGROUND_THEME, userId);
                        setSelected(DEFAULT_BACKGROUND_THEME);
                    }}
                    className="rounded-full border border-[#dce3ef] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#425466]"
                >
                    默认
                </button>
            </div>

            <div className="mb-3 rounded-xl border border-[#e8edf5] bg-[#f8fbff] p-2">
                <div className="relative h-20 overflow-hidden rounded-lg">
                    <div className={`absolute inset-0 ${selectedSpec.baseLayer}`} />
                    <div className={`absolute inset-0 ${selectedSpec.glassLayer}`} />
                    <div className={`absolute inset-0 ${selectedSpec.glowLayer}`} />
                    <div className={`absolute inset-x-0 bottom-0 h-[42%] ${selectedSpec.bottomLayer}`} />
                    <div className={`absolute inset-0 ${selectedSpec.vignetteLayer}`} />
                </div>
                <p className="mt-2 text-xs font-semibold text-[#1f2937]">{selectedSpec.name}</p>
                <p className="text-[11px] text-[#64748b]">{selectedSpec.description}</p>
            </div>

            <div className="grid max-h-[44vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                {BACKGROUND_THEMES.map((theme) => {
                    const active = selected === theme.id;
                    return (
                        <button
                            key={theme.id}
                            type="button"
                            onClick={() => {
                                setSavedBackgroundTheme(theme.id, userId);
                                setSelected(theme.id);
                            }}
                            className={`group overflow-hidden rounded-xl border text-left transition ${active ? "border-[#3b82f6] ring-2 ring-[#bfdbfe]" : "border-[#e5e9f1]"}`}
                        >
                            <div className="relative aspect-[4/3] w-full">
                                <div className={`absolute inset-0 ${theme.baseLayer}`} />
                                <div className={`absolute inset-0 ${theme.glassLayer}`} />
                                <div className={`absolute inset-0 ${theme.glowLayer}`} />
                                <div className={`absolute inset-x-0 bottom-0 h-[40%] ${theme.bottomLayer}`} />
                                <div className={`absolute inset-0 ${theme.vignetteLayer}`} />
                            </div>
                            <div className="bg-white px-2 py-1.5">
                                <p className="truncate text-[11px] font-semibold text-[#334155]">{theme.name}</p>
                                <p className="truncate text-[10px] text-[#94a3b8]">{theme.description}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

