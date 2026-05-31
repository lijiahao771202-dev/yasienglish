"use client";

import React, { useState } from 'react';
import { useReadingSettings } from '@/contexts/ReadingSettingsContext';
import { Type, Minus, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppearanceMenu({ onClose }: { onClose: () => void }) {
    const [typographyPanel, setTypographyPanel] = useState<"english" | "chinese">("english");
    const {
        theme, setTheme,
        font, setFont,
        fontSize, setFontSize,
        translationFont, setTranslationFont,
        translationFontSize, setTranslationFontSize,
        translationColor, setTranslationColor,
        phraseDisplayMode, setPhraseDisplayMode,
        paperStyle, setPaperStyle,
    } = useReadingSettings();

    type ThemeOption = {
        id: Parameters<typeof setTheme>[0];
        name: string;
        dot: string;
    };
    type FontOption = {
        id: Parameters<typeof setFont>[0];
        name: string;
        fontClass: string;
    };
    type PhraseDisplayOption = {
        id: Parameters<typeof setPhraseDisplayMode>[0];
        name: string;
        description: string;
    };
    type TranslationColorOption = {
        id: Parameters<typeof setTranslationColor>[0];
        name: string;
        swatch: string;
    };

    const themes: ThemeOption[] = [
        { id: 'welcome', name: 'Welcome', dot: 'bg-indigo-300' },
        { id: 'warm', name: 'Warm', dot: 'bg-orange-300' },
        { id: 'sunlight', name: 'Sun', dot: 'bg-amber-400' },
        { id: 'vintage', name: 'Aged', dot: 'bg-stone-400' },
        { id: 'green', name: 'Eye Care', dot: 'bg-emerald-300' },
        { id: 'cool', name: 'Cool', dot: 'bg-blue-300' },
        { id: 'mono', name: 'Minimal', dot: 'bg-stone-300' },
        { id: 'dark', name: 'Dark', dot: 'bg-slate-700' },
        { id: 'navy', name: 'Navy', dot: 'bg-blue-800' },
        { id: 'coal', name: 'Coal', dot: 'bg-neutral-800 border-white/20' },
        { id: 'mint', name: 'Mint', dot: 'bg-emerald-200' },
        { id: 'lavender', name: 'Lavender', dot: 'bg-purple-300' },
        { id: 'rose', name: 'Rose', dot: 'bg-rose-300' },
        { id: 'sky', name: 'Sky', dot: 'bg-sky-300' },
        { id: 'sand', name: 'Sand', dot: 'bg-[#e6d9b1]' },
        { id: 'latte', name: 'Latte', dot: 'bg-orange-200' },
        { id: 'mocha', name: 'Mocha', dot: 'bg-stone-400' },
        { id: 'slate', name: 'Slate', dot: 'bg-slate-400' },
        { id: 'dracula', name: 'Dracula', dot: 'bg-zinc-800 border-purple-500' },
        { id: 'hacker', name: 'Hacker', dot: 'bg-black border-emerald-500' },
        { id: 'midnight', name: 'Midnight', dot: 'bg-indigo-900' },
        { id: 'crimson', name: 'Crimson', dot: 'bg-rose-900' },
        { id: 'forest', name: 'Forest', dot: 'bg-emerald-900' },
        { id: 'ocean', name: 'Ocean', dot: 'bg-cyan-900' },
        { id: 'sepia', name: 'Sepia', dot: 'bg-[#d8c8a8]' },
        { id: 'peach', name: 'Peach', dot: 'bg-[#ffdeb3]' },
        { id: 'matcha', name: 'Matcha', dot: 'bg-[#bad8b6]' },
        { id: 'berry', name: 'Berry', dot: 'bg-fuchsia-300' },
        { id: 'cyberpunk', name: 'Cyberpunk', dot: 'bg-yellow-400 border-black' },
        { id: 'nord', name: 'Nord', dot: 'bg-[#2E3440]' },
    ];

    const fonts: FontOption[] = [
        { id: 'serif', name: 'System Serif', fontClass: 'font-serif' },
        { id: 'sans', name: 'System Sans', fontClass: 'font-sans' },
        { id: 'mono', name: 'System Mono', fontClass: 'font-mono' },
        { id: 'merriweather', name: 'Merriweather', fontClass: 'font-merriweather' },
        { id: 'libre-baskerville', name: 'Libre Basker', fontClass: 'font-libre-baskerville' },
        { id: 'source-serif', name: 'Source Serif', fontClass: 'font-source-serif' },
        { id: 'lora', name: 'Lora', fontClass: 'font-lora' },
        { id: 'inter', name: 'Inter', fontClass: 'font-inter' },
        { id: 'work-sans', name: 'Work Sans', fontClass: 'font-work-sans' },
        { id: 'roboto-mono', name: 'Roboto Mono', fontClass: 'font-roboto-mono' },
        { id: 'comic', name: 'Comic', fontClass: 'font-comic' },
        { id: 'arial', name: 'Arial', fontClass: 'font-[Arial,sans-serif]' },
        { id: 'helvetica', name: 'Helvetica', fontClass: 'font-[Helvetica,sans-serif]' },
        { id: 'georgia', name: 'Georgia', fontClass: 'font-[Georgia,serif]' },
        { id: 'verdana', name: 'Verdana', fontClass: 'font-[Verdana,sans-serif]' },
        { id: 'tahoma', name: 'Tahoma', fontClass: 'font-[Tahoma,sans-serif]' },
        { id: 'trebuchet', name: 'Trebuchet', fontClass: 'font-[Trebuchet_MS,sans-serif]' },
        { id: 'times', name: 'Times', fontClass: 'font-[Times_New_Roman,serif]' },
        { id: 'palatino', name: 'Palatino', fontClass: 'font-[Palatino,serif]' },
        { id: 'garamond', name: 'Garamond', fontClass: 'font-[Garamond,serif]' },
        { id: 'bookman', name: 'Bookman', fontClass: 'font-[Bookman_Old_Style,serif]' },
        { id: 'impact', name: 'Impact', fontClass: 'font-[Impact,sans-serif]' },
        { id: 'lucida', name: 'Lucida', fontClass: 'font-[Lucida_Sans_Unicode,sans-serif]' },
        { id: 'courier', name: 'Courier', fontClass: 'font-[Courier_New,monospace]' },
        { id: 'consolas', name: 'Consolas', fontClass: 'font-[Consolas,monospace]' },
        { id: 'optima', name: 'Optima', fontClass: 'font-[Optima,sans-serif]' },
        { id: 'didot', name: 'Didot', fontClass: 'font-[Didot,serif]' },
        { id: 'copperplate', name: 'Copperplate', fontClass: 'font-[Copperplate,sans-serif]' },
        { id: 'papyrus', name: 'Papyrus', fontClass: 'font-[Papyrus,fantasy]' },
        { id: 'century', name: 'Century', fontClass: 'font-[Century_Gothic,sans-serif]' },
        { id: 'candara', name: 'Candara', fontClass: 'font-[Candara,sans-serif]' },
    ];

    const sizes: Array<Parameters<typeof setFontSize>[0]> = ['text-base', 'text-lg', 'text-xl', 'text-2xl'];
    const translationSizes: Array<Parameters<typeof setTranslationFontSize>[0]> = ['text-base', 'text-lg', 'text-xl', 'text-2xl'];
    const phraseDisplayOptions: PhraseDisplayOption[] = [
        { id: 'capsule', name: 'Mode 1', description: '短语胶囊' },
        { id: 'inline_wavy', name: 'Mode 2', description: '原文波浪线' },
    ];
    const translationColors: TranslationColorOption[] = [
        { id: 'muted', name: 'Muted', swatch: 'bg-stone-400' },
        { id: 'stone', name: 'Stone', swatch: 'bg-stone-500' },
        { id: 'ink', name: 'Ink', swatch: 'bg-stone-700' },
        { id: 'indigo', name: 'Indigo', swatch: 'bg-indigo-600' },
        { id: 'sky', name: 'Sky', swatch: 'bg-sky-500' },
        { id: 'emerald', name: 'Emerald', swatch: 'bg-emerald-500' },
        { id: 'rose', name: 'Rose', swatch: 'bg-rose-500' },
        { id: 'amber', name: 'Amber', swatch: 'bg-amber-500' },
    ];

    const paperStyles: Array<{ id: typeof paperStyle; name: string; description: string }> = [
        { id: 'brutalist', name: 'Default', description: '粗野主义' },
        { id: 'glass', name: 'Liquid Glass', description: '液态玻璃' },
        { id: 'parchment', name: 'Parchment', description: '复古羊皮' },
        { id: 'grid', name: 'Grid', description: '网格笔记' },
        { id: 'sakura', name: 'Sakura Pink', description: '浪漫樱粉' },
        { id: 'matcha', name: 'Matcha Green', description: '护眼茶绿' },
        { id: 'sky', name: 'Sky Blue', description: '静谧晴空' },
        { id: 'charcoal', name: 'Charcoal Dark', description: '极客碳黑' },
        { id: 'borderless', name: 'Borderless', description: '无边框' },
    ];

    const handleIncreaseSize = () => {
        const currentIndex = sizes.indexOf(fontSize);
        if (currentIndex < sizes.length - 1) {
            setFontSize(sizes[currentIndex + 1]);
        }
    };

    const handleDecreaseSize = () => {
        const currentIndex = sizes.indexOf(fontSize);
        if (currentIndex > 0) {
            setFontSize(sizes[currentIndex - 1]);
        }
    };

    const handleIncreaseTranslationSize = () => {
        const currentIndex = translationSizes.indexOf(translationFontSize);
        if (currentIndex < translationSizes.length - 1) {
            setTranslationFontSize(translationSizes[currentIndex + 1]);
        }
    };

    const handleDecreaseTranslationSize = () => {
        const currentIndex = translationSizes.indexOf(translationFontSize);
        if (currentIndex > 0) {
            setTranslationFontSize(translationSizes[currentIndex - 1]);
        }
    };

    return (
        <div className="absolute top-full right-0 mt-4 w-[340px] bg-theme-card-bg p-5 rounded-[2rem] flex flex-col gap-4 text-theme-text border-4 border-theme-border shadow-[0_8px_0_var(--theme-shadow)] z-50 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center px-1">
                <span className="text-[13px] font-black tracking-widest text-theme-text-muted uppercase pl-1">外观设置</span>
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-theme-text-muted hover:bg-theme-primary-bg hover:text-theme-primary-text transition-colors border-2 border-transparent hover:border-theme-border"
                    aria-label="Close appearance menu"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>

            <div className="flex-1 max-h-[380px] overflow-y-auto no-scrollbar pr-0.5 space-y-4">

            {/* Theme Section */}
            <div className="space-y-3">
                <span className="text-xs font-black text-theme-text-muted uppercase tracking-widest pl-1 relative z-10 bg-theme-card-bg pb-1 w-full block">Theme</span>
                <div className="grid grid-cols-3 gap-2 max-h-[160px] overflow-y-auto no-scrollbar pr-1 -mt-2 pt-2 pb-2">
                    {themes.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTheme(t.id)}
                            className={cn(
                                "flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-black transition-all border-[3px]",
                                theme === t.id
                                    ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                    : "bg-theme-base-bg text-theme-text-muted border-transparent hover:border-theme-text-muted/30"
                            )}
                            title={t.name}
                        >
                            <div className={cn("w-2.5 h-2.5 rounded-full border border-black/10", t.dot)} />
                            {t.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-1 bg-theme-border/10 rounded-full" />

            {/* Paper Style Section */}
            <div className="space-y-3">
                <span className="text-xs font-black text-theme-text-muted uppercase tracking-widest pl-1 relative z-10 bg-theme-card-bg pb-1 w-full block">Paper Style</span>
                <div className="grid grid-cols-3 gap-1.5">
                    {paperStyles.map((p) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => setPaperStyle(p.id)}
                            className={cn(
                                "flex flex-col items-center gap-0.5 rounded-xl border-[3px] py-1.5 px-0.5 text-center transition-all",
                                paperStyle === p.id
                                    ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                    : "bg-theme-base-bg text-theme-text-muted border-transparent hover:border-theme-text-muted/30 hover:text-theme-text"
                            )}
                        >
                            <div className="text-[11px] font-black">{p.name}</div>
                            <div className="text-[9px] font-semibold opacity-70 leading-none">{p.description}</div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-1 bg-theme-border/10 rounded-full" />

            <div className="space-y-4">
                <div className="rounded-2xl border-2 border-theme-border/20 bg-theme-base-bg p-1">
                    <div className="grid grid-cols-2 gap-1">
                        <button
                            type="button"
                            onClick={() => setTypographyPanel("english")}
                            className={cn(
                                "rounded-xl px-3 py-2 text-[12px] font-black transition-all border-[3px]",
                                typographyPanel === "english"
                                    ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                    : "bg-theme-base-bg text-theme-text-muted hover:text-theme-text border-transparent hover:border-theme-text-muted/30"
                            )}
                        >
                            English
                        </button>
                        <button
                            type="button"
                            onClick={() => setTypographyPanel("chinese")}
                            className={cn(
                                "rounded-xl px-3 py-2 text-[12px] font-black transition-all border-[3px]",
                                typographyPanel === "chinese"
                                    ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                    : "bg-theme-base-bg text-theme-text-muted hover:text-theme-text border-transparent hover:border-theme-text-muted/30"
                            )}
                        >
                            Chinese
                        </button>
                    </div>
                </div>

                {typographyPanel === "english" ? (
                    <div className="space-y-4">
                        <span className="text-xs font-black text-theme-text-muted uppercase tracking-widest pl-1 relative z-10 bg-theme-card-bg pb-1 w-full block">Typography</span>

                        <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto no-scrollbar pr-1 -mt-2 pt-2 pb-2">
                            {fonts.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setFont(f.id)}
                                    className={cn(
                                        "px-3 py-2.5 rounded-xl text-[13px] font-black transition-all text-center border-[3px]",
                                        f.fontClass,
                                        font === f.id
                                            ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                            : "bg-theme-base-bg text-theme-text-muted hover:text-theme-text border-transparent hover:border-theme-text-muted/30"
                                    )}
                                >
                                    {f.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between bg-theme-base-bg p-1.5 rounded-2xl border-2 border-theme-border/20">
                            <button
                                onClick={handleDecreaseSize}
                                disabled={fontSize === sizes[0]}
                                className="flex items-center justify-center w-10 h-10 rounded-xl text-theme-text-muted hover:bg-theme-primary-bg border-[3px] border-transparent hover:border-theme-border hover:shadow-[0_2px_0_var(--theme-shadow)] hover:text-theme-primary-text disabled:opacity-30 transition-all font-black"
                            >
                                <Minus className="w-5 h-5 stroke-[3]" />
                            </button>

                            <span className="text-sm font-black text-theme-text flex items-center gap-2">
                                <Type className="w-5 h-5 text-theme-text-muted stroke-[3]" />
                                {Math.round((sizes.indexOf(fontSize) + 2) * 100 / 3) - 16}
                            </span>

                            <button
                                onClick={handleIncreaseSize}
                                disabled={fontSize === sizes[sizes.length - 1]}
                                className="flex items-center justify-center w-10 h-10 rounded-xl text-theme-text-muted hover:bg-theme-primary-bg border-[3px] border-transparent hover:border-theme-border hover:shadow-[0_2px_0_var(--theme-shadow)] hover:text-theme-primary-text disabled:opacity-30 transition-all font-black"
                            >
                                <Plus className="w-5 h-5 stroke-[3]" />
                            </button>
                        </div>

                        <div className="h-1 bg-theme-border/10 rounded-full" />

                        <div className="space-y-3">
                            <span className="text-xs font-black text-theme-text-muted uppercase tracking-widest pl-1 relative z-10 bg-theme-card-bg pb-1 w-full block">Phrase Display</span>
                            <div className="grid grid-cols-2 gap-2">
                                {phraseDisplayOptions.map((option) => (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => setPhraseDisplayMode(option.id)}
                                        className={cn(
                                            "rounded-xl border-[3px] px-3 py-3 text-left transition-all",
                                            phraseDisplayMode === option.id
                                                ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                                : "bg-theme-base-bg text-theme-text-muted border-transparent hover:border-theme-text-muted/30 hover:text-theme-text"
                                        )}
                                    >
                                        <div className="text-[12px] font-black">{option.name}</div>
                                        <div className="mt-1 text-[11px] font-semibold opacity-80">{option.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <span className="text-xs font-black text-theme-text-muted uppercase tracking-widest pl-1 relative z-10 bg-theme-card-bg pb-1 w-full block">Chinese</span>

                        <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto no-scrollbar pr-1 -mt-2 pt-2 pb-2">
                            {fonts.map(f => (
                                <button
                                    key={`translation-font-${f.id}`}
                                    onClick={() => setTranslationFont(f.id)}
                                    className={cn(
                                        "px-3 py-2.5 rounded-xl text-[13px] font-black transition-all text-center border-[3px]",
                                        f.fontClass,
                                        translationFont === f.id
                                            ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                            : "bg-theme-base-bg text-theme-text-muted hover:text-theme-text border-transparent hover:border-theme-text-muted/30"
                                    )}
                                >
                                    {f.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center justify-between bg-theme-base-bg p-1.5 rounded-2xl border-2 border-theme-border/20">
                            <button
                                onClick={handleDecreaseTranslationSize}
                                disabled={translationFontSize === translationSizes[0]}
                                className="flex items-center justify-center w-10 h-10 rounded-xl text-theme-text-muted hover:bg-theme-primary-bg border-[3px] border-transparent hover:border-theme-border hover:shadow-[0_2px_0_var(--theme-shadow)] hover:text-theme-primary-text disabled:opacity-30 transition-all font-black"
                            >
                                <Minus className="w-5 h-5 stroke-[3]" />
                            </button>

                            <span className="text-sm font-black text-theme-text flex items-center gap-2">
                                <Type className="w-5 h-5 text-theme-text-muted stroke-[3]" />
                                CN {Math.round((translationSizes.indexOf(translationFontSize) + 2) * 100 / 3) - 16}
                            </span>

                            <button
                                onClick={handleIncreaseTranslationSize}
                                disabled={translationFontSize === translationSizes[translationSizes.length - 1]}
                                className="flex items-center justify-center w-10 h-10 rounded-xl text-theme-text-muted hover:bg-theme-primary-bg border-[3px] border-transparent hover:border-theme-border hover:shadow-[0_2px_0_var(--theme-shadow)] hover:text-theme-primary-text disabled:opacity-30 transition-all font-black"
                            >
                                <Plus className="w-5 h-5 stroke-[3]" />
                            </button>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {translationColors.map((option) => (
                                <button
                                    key={`translation-color-${option.id}`}
                                    type="button"
                                    onClick={() => setTranslationColor(option.id)}
                                    className={cn(
                                        "rounded-xl border-[3px] px-2 py-2 text-[11px] font-black transition-all",
                                        translationColor === option.id
                                            ? "bg-theme-active-bg border-theme-border text-theme-active-text shadow-[0_3px_0_var(--theme-shadow)]"
                                            : "bg-theme-base-bg text-theme-text-muted border-transparent hover:border-theme-text-muted/30 hover:text-theme-text",
                                    )}
                                >
                                    <span className={cn("mx-auto mb-1 block h-3 w-3 rounded-full border border-black/10", option.swatch)} />
                                    {option.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}
