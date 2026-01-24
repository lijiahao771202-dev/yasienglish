"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';

type ThemeId = 'warm' | 'sunlight' | 'vintage' | 'green' | 'cool' | 'mono' | 'dark' | 'navy' | 'coal';
type FontId = 'serif' | 'sans' | 'mono' | 'merriweather' | 'lora' | 'inter' | 'roboto-mono' | 'libre-baskerville' | 'source-serif' | 'work-sans' | 'comic';
type FontSize = 'text-base' | 'text-lg' | 'text-xl' | 'text-2xl';

interface ReadingSettings {
    theme: ThemeId;
    font: FontId;
    fontSize: FontSize;
    isFocusMode: boolean;
    isBionicMode: boolean;
}

interface ReadingSettingsContextType extends ReadingSettings {
    setTheme: (theme: ThemeId) => void;
    setFont: (font: FontId) => void;
    setFontSize: (size: FontSize) => void;
    toggleFocusMode: () => void;
    toggleBionicMode: () => void;
    // Computed classes
    fontClass: string;
    fontSizeClass: string;
}

const ReadingSettingsContext = createContext<ReadingSettingsContextType | undefined>(undefined);

const THEMES = [
    { id: 'warm', class: 'bg-gradient-to-br from-orange-50 via-white to-rose-50' },
    {
        id: 'sunlight',
        // Uses the CSS class from globals.css which composites noise and gradient
        class: 'theme-sunlight-bg'
    },
    { id: 'vintage', class: 'bg-[#EBE5D9] bg-[linear-gradient(135deg,_rgba(0,0,0,0.02)_25%,_transparent_25%,_transparent_50%,_rgba(0,0,0,0.02)_50%,_rgba(0,0,0,0.02)_75%,_transparent_75%,_transparent_100%)] bg-[length:4px_4px]' },
    { id: 'green', class: 'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50' },
    { id: 'cool', class: 'bg-gradient-to-br from-slate-50 via-blue-50 to-sky-50' },
    { id: 'mono', class: 'bg-gradient-to-br from-stone-50 via-white to-stone-100' },
    { id: 'dark', class: 'bg-slate-950 text-slate-200' },
    { id: 'navy', class: 'bg-blue-950 text-blue-100' },
    { id: 'coal', class: 'bg-stone-950 text-stone-200' },
];

const FONTS = {
    serif: 'font-serif', // Default System Serif
    sans: 'font-sans',   // Default System Sans
    mono: 'font-mono',    // Default System Mono
    merriweather: 'font-merriweather',
    lora: 'font-lora',
    inter: 'font-inter',
    'roboto-mono': 'font-roboto-mono',
    'libre-baskerville': 'font-libre-baskerville',
    'source-serif': 'font-source-serif',
    'work-sans': 'font-work-sans',
    'comic': 'font-comic',
};

export function ReadingSettingsProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<ThemeId>('warm');
    const [font, setFont] = useState<FontId>('serif');
    const [fontSize, setFontSize] = useState<FontSize>('text-xl');
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isBionicMode, setIsBionicMode] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Load settings from localStorage
        const storedTheme = localStorage.getItem('reading_theme') as ThemeId;
        const storedFont = localStorage.getItem('reading_font') as FontId;
        const storedSize = localStorage.getItem('reading_size') as FontSize;
        const storedFocus = localStorage.getItem('reading_focus_mode');

        if (storedTheme) setTheme(storedTheme);
        if (storedFont) setFont(storedFont);
        if (storedSize) setFontSize(storedSize);
        if (storedFocus === 'true') setIsFocusMode(true);
        const storedBionic = localStorage.getItem('reading_bionic_mode');
        if (storedBionic === 'true') setIsBionicMode(true);

        setMounted(true);
    }, []);

    const updateTheme = (newTheme: ThemeId) => {
        setTheme(newTheme);
        localStorage.setItem('reading_theme', newTheme);
    };

    const updateFont = (newFont: FontId) => {
        setFont(newFont);
        localStorage.setItem('reading_font', newFont);
    };

    const updateFontSize = (newSize: FontSize) => {
        setFontSize(newSize);
        localStorage.setItem('reading_size', newSize);
    };

    const toggleFocusMode = () => {
        setIsFocusMode(prev => {
            const newVal = !prev;
            localStorage.setItem('reading_focus_mode', String(newVal));
            return newVal;
        });
    };

    const toggleBionicMode = () => {
        setIsBionicMode(prev => {
            const newVal = !prev;
            localStorage.setItem('reading_bionic_mode', String(newVal));
            return newVal;
        });
    };

    return (
        <ReadingSettingsContext.Provider value={{
            theme,
            font,
            fontSize,
            setTheme: updateTheme,
            setFont: updateFont,
            setFontSize: updateFontSize,
            isFocusMode,
            toggleFocusMode,
            isBionicMode,
            toggleBionicMode,
            fontClass: FONTS[font],
            fontSizeClass: fontSize
        }}>
            <div className={mounted ? "" : "invisible"}>
                {children}
            </div>
        </ReadingSettingsContext.Provider>
    );
}

export function useReadingSettings() {
    const context = useContext(ReadingSettingsContext);
    if (!context) {
        throw new Error('useReadingSettings must be used within a ReadingSettingsProvider');
    }
    return context;
}

export const READING_THEMES = THEMES;
