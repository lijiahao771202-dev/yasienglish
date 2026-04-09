"use client";

import { useEffect, useMemo, useState } from "react";
import {
    BACKGROUND_THEMES,
    DEFAULT_BACKGROUND_THEME,
    getBackgroundThemeSpec,
    getSavedBackgroundTheme,
    setSavedBackgroundTheme,
} from "@/lib/background-preferences";
import { ThemeThumbnailMock } from "@/components/home/theme-picker/ThemeThumbnailMock";

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
        <section className="h-full flex flex-col p-6">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-theme-text-muted font-black border-b-[3px] border-theme-border inline-block pb-1 mb-2">Global Appearance</p>
                    <h2 className="text-3xl font-welcome-display tracking-tight text-theme-text">全局主题</h2>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setSavedBackgroundTheme(DEFAULT_BACKGROUND_THEME, userId);
                        setSelected(DEFAULT_BACKGROUND_THEME);
                    }}
                    className="rounded-xl border-[3px] border-theme-border bg-theme-active-bg px-5 py-2 text-sm font-black text-theme-active-text transition hover:-translate-y-1 shadow-[0_4px_0_0_var(--theme-shadow)] active:translate-y-0 active:shadow-[0_2px_0_0_var(--theme-shadow)]"
                >
                    默认
                </button>
            </div>

            <div 
                className="mb-6 rounded-[1.5rem] border-[3px] border-theme-border bg-theme-base-bg p-4 shadow-[0_6px_0_0_var(--theme-shadow)] transition-colors duration-500"
                data-bg-theme={selectedSpec.id}
            >
                <div className="relative h-32 md:h-40 overflow-hidden rounded-[1rem] border-[3px] border-theme-border shadow-[inset_0_4px_12px_rgba(0,0,0,0.05)] bg-theme-base-bg flex items-center justify-center pointer-events-none transition-colors duration-500">
                    <div className="origin-center" style={{ transform: "scale(0.85)" }}>
                        <ThemeThumbnailMock />
                    </div>
                </div>
                <p className="mt-4 flex items-center justify-between"><span className="text-[15px] font-black text-theme-text">{selectedSpec.name}</span><span className="text-xs font-bold text-theme-text-muted">{selectedSpec.description}</span></p>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto pr-2 sm:grid-cols-3 md:grid-cols-4 pb-4">
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
                            className={`group overflow-hidden rounded-[1.2rem] border-[3px] text-left transition hover:-translate-y-1 ${active ? "border-theme-primary-bg ring-[4px] ring-theme-primary-bg/40 shadow-[0_6px_0_0_var(--theme-shadow)]" : "border-theme-border shadow-[0_4px_0_0_var(--theme-shadow)] hover:shadow-[0_8px_0_0_var(--theme-shadow)]"}`}
                            data-bg-theme={theme.id}
                        >
                            <div className="relative aspect-[4/3] w-full border-b-[3px] border-theme-border overflow-hidden bg-theme-base-bg flex items-center justify-center transition-colors duration-500 pointer-events-none">
                                <div className="origin-center" style={{ transform: "scale(0.35)" }}>
                                    <ThemeThumbnailMock />
                                </div>
                            </div>
                            <div className="bg-theme-card-bg px-3 py-2.5 flex flex-col items-center justify-center">
                                <p className="w-full text-center truncate text-[11px] font-black text-theme-text">{theme.name}</p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

