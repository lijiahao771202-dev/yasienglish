"use client";

import React, { createContext, useContext, useSyncExternalStore } from 'react';

type ThemeId = 'welcome' | 'warm' | 'sunlight' | 'vintage' | 'green' | 'cool' | 'mono' | 'dark' | 'navy' | 'coal' | 'mint' | 'lavender' | 'rose' | 'sky' | 'sand' | 'latte' | 'mocha' | 'slate' | 'dracula' | 'hacker' | 'midnight' | 'crimson' | 'forest' | 'ocean' | 'sepia' | 'peach' | 'matcha' | 'berry' | 'cyberpunk' | 'nord';
type FontId = 'serif' | 'sans' | 'mono' | 'merriweather' | 'lora' | 'inter' | 'roboto-mono' | 'libre-baskerville' | 'source-serif' | 'work-sans' | 'comic' | 'arial' | 'helvetica' | 'georgia' | 'verdana' | 'tahoma' | 'trebuchet' | 'times' | 'palatino' | 'garamond' | 'bookman' | 'impact' | 'lucida' | 'courier' | 'consolas' | 'optima' | 'didot' | 'copperplate' | 'papyrus' | 'century' | 'candara';
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
    {
        id: 'welcome',
        class: 'bg-[linear-gradient(180deg,#8fa0de_0%,#a8b5e8_18%,#d5d9f3_42%,#d9dcf7_60%,#c8d4f3_74%,#b8c9eb_100%)]',
    },
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
    { id: 'mint', class: 'bg-emerald-50 text-emerald-900 border-emerald-200' },
    { id: 'lavender', class: 'bg-purple-50 text-purple-900 border-purple-200' },
    { id: 'rose', class: 'bg-rose-50 text-rose-900 border-rose-200' },
    { id: 'sky', class: 'bg-sky-50 text-sky-900 border-sky-200' },
    { id: 'sand', class: 'bg-[#fdf9e3] text-[#5b4636] border-[#e6d9b1]' },
    { id: 'latte', class: 'bg-orange-50 text-stone-800' },
    { id: 'mocha', class: 'bg-stone-200 text-stone-900 border-stone-300' },
    { id: 'slate', class: 'bg-slate-200 text-slate-900 border-slate-300' },
    { id: 'dracula', class: 'bg-zinc-900 text-purple-200 border-purple-900' },
    { id: 'hacker', class: 'bg-black text-emerald-400 border-emerald-900' },
    { id: 'midnight', class: 'bg-indigo-950 text-indigo-100' },
    { id: 'crimson', class: 'bg-rose-950 text-rose-100' },
    { id: 'forest', class: 'bg-emerald-950 text-emerald-100' },
    { id: 'ocean', class: 'bg-cyan-950 text-cyan-100' },
    { id: 'sepia', class: 'bg-[#f4ecd8] text-[#5b4636] border-[#d8c8a8]' },
    { id: 'peach', class: 'bg-[#fff0e6] text-orange-950 border-[#ffdeb3]' },
    { id: 'matcha', class: 'bg-[#e8f4e6] text-[#2c4c3b] border-[#bad8b6]' },
    { id: 'berry', class: 'bg-fuchsia-50 text-fuchsia-950 border-fuchsia-200' },
    { id: 'cyberpunk', class: 'bg-yellow-400 text-black border-black' },
    { id: 'nord', class: 'bg-[#2E3440] text-[#D8DEE9]' },
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
    arial: 'font-[Arial,sans-serif]',
    helvetica: 'font-[Helvetica,sans-serif]',
    georgia: 'font-[Georgia,serif]',
    verdana: 'font-[Verdana,sans-serif]',
    tahoma: 'font-[Tahoma,sans-serif]',
    trebuchet: 'font-[Trebuchet_MS,sans-serif]',
    times: 'font-[Times_New_Roman,serif]',
    palatino: 'font-[Palatino,serif]',
    garamond: 'font-[Garamond,serif]',
    bookman: 'font-[Bookman_Old_Style,serif]',
    impact: 'font-[Impact,sans-serif]',
    lucida: 'font-[Lucida_Sans_Unicode,sans-serif]',
    courier: 'font-[Courier_New,monospace]',
    consolas: 'font-[Consolas,monospace]',
    optima: 'font-[Optima,sans-serif]',
    didot: 'font-[Didot,serif]',
    copperplate: 'font-[Copperplate,sans-serif]',
    papyrus: 'font-[Papyrus,fantasy]',
    century: 'font-[Century_Gothic,sans-serif]',
    candara: 'font-[Candara,sans-serif]',
};

const DEFAULT_THEME: ThemeId = 'warm';
const DEFAULT_FONT: FontId = 'serif';
const DEFAULT_FONT_SIZE: FontSize = 'text-xl';
const READING_SETTINGS_EVENT = 'reading-settings-change';

function readStoredTheme(): ThemeId {
    const storedTheme = localStorage.getItem('reading_theme');
    return THEMES.some((item) => item.id === storedTheme) ? (storedTheme as ThemeId) : DEFAULT_THEME;
}

function readStoredFont(): FontId {
    const storedFont = localStorage.getItem('reading_font');
    return storedFont && storedFont in FONTS ? (storedFont as FontId) : DEFAULT_FONT;
}

function readStoredFontSize(): FontSize {
    const storedSize = localStorage.getItem('reading_size');
    return storedSize === 'text-base' || storedSize === 'text-lg' || storedSize === 'text-xl' || storedSize === 'text-2xl'
        ? storedSize
        : DEFAULT_FONT_SIZE;
}

function readStoredFocusMode() {
    return localStorage.getItem('reading_focus_mode') === 'true';
}

function readStoredBionicMode() {
    return localStorage.getItem('reading_bionic_mode') === 'true';
}

function subscribeReadingSettings(onStoreChange: () => void) {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    const handleChange = () => onStoreChange();
    window.addEventListener('storage', handleChange);
    window.addEventListener(READING_SETTINGS_EVENT, handleChange);

    return () => {
        window.removeEventListener('storage', handleChange);
        window.removeEventListener(READING_SETTINGS_EVENT, handleChange);
    };
}

function emitReadingSettingsChange() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(READING_SETTINGS_EVENT));
}

export function ReadingSettingsProvider({ children }: { children: React.ReactNode }) {
    const theme = useSyncExternalStore(subscribeReadingSettings, readStoredTheme, () => DEFAULT_THEME);
    const font = useSyncExternalStore(subscribeReadingSettings, readStoredFont, () => DEFAULT_FONT);
    const fontSize = useSyncExternalStore(subscribeReadingSettings, readStoredFontSize, () => DEFAULT_FONT_SIZE);
    const isFocusMode = useSyncExternalStore(subscribeReadingSettings, readStoredFocusMode, () => false);
    const isBionicMode = useSyncExternalStore(subscribeReadingSettings, readStoredBionicMode, () => false);

    const updateTheme = (newTheme: ThemeId) => {
        localStorage.setItem('reading_theme', newTheme);
        emitReadingSettingsChange();
    };

    const updateFont = (newFont: FontId) => {
        localStorage.setItem('reading_font', newFont);
        emitReadingSettingsChange();
    };

    const updateFontSize = (newSize: FontSize) => {
        localStorage.setItem('reading_size', newSize);
        emitReadingSettingsChange();
    };

    const toggleFocusMode = () => {
        const newVal = !isFocusMode;
        localStorage.setItem('reading_focus_mode', String(newVal));
        emitReadingSettingsChange();
    };

    const toggleBionicMode = () => {
        const newVal = !isBionicMode;
        localStorage.setItem('reading_bionic_mode', String(newVal));
        emitReadingSettingsChange();
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
            {children}
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
