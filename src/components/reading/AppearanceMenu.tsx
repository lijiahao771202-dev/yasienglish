"use client";

import React from 'react';
import { useReadingSettings, READING_THEMES } from '@/contexts/ReadingSettingsContext';
import { Check, Type, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppearanceMenu({ onClose }: { onClose: () => void }) {
    const {
        theme, setTheme,
        font, setFont,
        fontSize, setFontSize
    } = useReadingSettings();

    const themes = [
        { id: 'warm', name: 'Warm', dot: 'bg-orange-300' },
        { id: 'sunlight', name: 'Sun', dot: 'bg-amber-400' },
        { id: 'vintage', name: 'Aged', dot: 'bg-stone-400' },
        { id: 'green', name: 'Eye Care', dot: 'bg-emerald-300' },
        { id: 'cool', name: 'Cool', dot: 'bg-blue-300' },
        { id: 'mono', name: 'Minimal', dot: 'bg-stone-300' },
        { id: 'dark', name: 'Dark', dot: 'bg-slate-700' },
        { id: 'navy', name: 'Navy', dot: 'bg-blue-800' },
        { id: 'coal', name: 'Coal', dot: 'bg-neutral-800 border-white/20' },
    ];

    const fonts = [
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
    ];

    const sizes = ['text-base', 'text-lg', 'text-xl', 'text-2xl'];

    const handleIncreaseSize = () => {
        const currentIndex = sizes.indexOf(fontSize);
        if (currentIndex < sizes.length - 1) {
            setFontSize(sizes[currentIndex + 1] as any);
        }
    };

    const handleDecreaseSize = () => {
        const currentIndex = sizes.indexOf(fontSize);
        if (currentIndex > 0) {
            setFontSize(sizes[currentIndex - 1] as any);
        }
    };

    return (
        <div className="absolute top-full right-0 mt-3 w-80 glass-panel p-4 rounded-xl flex flex-col gap-4 shadow-xl animate-in fade-in zoom-in-95 z-50 border border-white/50 text-stone-800">

            {/* Theme Section */}
            <div className="space-y-2">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Theme</span>
                <div className="grid grid-cols-3 gap-2">
                    {themes.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTheme(t.id as any)}
                            className={cn(
                                "flex items-center justify-center gap-2 px-2 py-2 rounded-lg text-xs font-medium transition-all border",
                                theme === t.id
                                    ? "bg-white shadow-sm border-stone-200 text-stone-900 ring-1 ring-stone-200"
                                    : "text-stone-500 hover:bg-stone-100/50 border-transparent hover:border-stone-100"
                            )}
                            title={t.name}
                        >
                            <div className={cn("w-2 h-2 rounded-full", t.dot)} />
                            {t.name}
                        </button>
                    ))}
                </div>
            </div>

            <div className="h-px bg-stone-200/50" />

            {/* Font & Size Section */}
            <div className="space-y-3">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Typography</span>

                {/* Font Selection */}
                <div className="grid grid-cols-2 gap-2 p-1">
                    {fonts.map(f => (
                        <button
                            key={f.id}
                            onClick={() => setFont(f.id as any)}
                            className={cn(
                                "px-3 py-2 rounded-md text-xs font-medium transition-all text-center border",
                                f.fontClass,
                                font === f.id
                                    ? "bg-white text-stone-900 shadow-sm border-stone-200 ring-1 ring-black/5"
                                    : "text-stone-500 hover:text-stone-700 border-transparent hover:bg-stone-100/50"
                            )}
                        >
                            {f.name}
                        </button>
                    ))}
                </div>

                {/* Size Controls */}
                <div className="flex items-center justify-between bg-stone-100/50 p-1 rounded-lg border border-stone-200/50">
                    <button
                        onClick={handleDecreaseSize}
                        disabled={fontSize === sizes[0]}
                        className="p-2 rounded-md hover:bg-white hover:shadow-sm text-stone-500 hover:text-stone-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                        <Minus className="w-4 h-4" />
                    </button>

                    <span className="text-sm font-medium text-stone-600 flex items-center gap-2">
                        <Type className="w-4 h-4 text-stone-400" />
                        {Math.round((sizes.indexOf(fontSize) + 2) * 100 / 3) - 16}%
                    </span>

                    <button
                        onClick={handleIncreaseSize}
                        disabled={fontSize === sizes[sizes.length - 1]}
                        className="p-2 rounded-md hover:bg-white hover:shadow-sm text-stone-500 hover:text-stone-800 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
