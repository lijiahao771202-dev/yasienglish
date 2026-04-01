"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, PencilLine, X } from "lucide-react";
import { PretextTextarea } from "@/components/ui/PretextTextarea";
import { type VocabItem } from "@/lib/db";
import { updateVocabularyEntry } from "@/lib/user-repository";
import { cn } from "@/lib/utils";
import { normalizeHighlightedMeanings, parseMeaningGroups } from "@/lib/vocab-meanings";

type VocabEditFocusTarget = "word" | "phonetic" | "meanings" | "example";

interface VocabEditDialogProps {
    open: boolean;
    item: VocabItem | null;
    onClose: () => void;
    onSaved?: (item: VocabItem) => void;
    initialFocus?: VocabEditFocusTarget;
}

interface VocabEditDraft {
    word: string;
    phonetic: string;
    definition: string;
    translation: string;
    highlighted_meanings: string;
    source_sentence: string;
    example: string;
}

function buildDraft(item: VocabItem | null): VocabEditDraft {
    return {
        word: item?.word || "",
        phonetic: item?.phonetic || "",
        definition: item?.definition || "",
        translation: item?.translation || "",
        highlighted_meanings: (item?.highlighted_meanings || []).join("\n"),
        source_sentence: item?.source_sentence || "",
        example: item?.example || "",
    };
}

export function VocabEditDialog({ open, item, onClose, onSaved, initialFocus = "word" }: VocabEditDialogProps) {
    const [draft, setDraft] = useState<VocabEditDraft>(() => buildDraft(item));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wordInputRef = useRef<HTMLInputElement>(null);
    const phoneticInputRef = useRef<HTMLInputElement>(null);
    const meaningsTextareaRef = useRef<HTMLTextAreaElement>(null);
    const exampleTextareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!open) return;
        setDraft(buildDraft(item));
        setError(null);
        setIsSaving(false);
    }, [item, open]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, open]);

    useEffect(() => {
        if (!open) return;
        const focusTarget = () => {
            switch (initialFocus) {
                case "phonetic":
                    phoneticInputRef.current?.focus();
                    phoneticInputRef.current?.select();
                    break;
                case "meanings":
                    meaningsTextareaRef.current?.focus();
                    break;
                case "example":
                    exampleTextareaRef.current?.focus();
                    break;
                case "word":
                default:
                    wordInputRef.current?.focus();
                    wordInputRef.current?.select();
                    break;
            }
        };
        const frame = window.requestAnimationFrame(focusTarget);
        return () => window.cancelAnimationFrame(frame);
    }, [initialFocus, open]);

    const canSubmit = useMemo(() => {
        return Boolean(draft.word.trim()) && !isSaving;
    }, [draft.word, isSaving]);

    if (!open || !item || typeof document === "undefined") return null;

    const handleChange = (field: keyof VocabEditDraft, value: string) => {
        setDraft((current) => ({ ...current, [field]: value }));
    };

    const handleSave = async () => {
        if (!canSubmit) return;

        setIsSaving(true);
        setError(null);
        try {
            const highlightedMeanings = normalizeHighlightedMeanings(
                draft.highlighted_meanings
                    .split(/\n|;/)
                    .map((value) => value.trim())
                    .filter(Boolean),
            );
            const saved = await updateVocabularyEntry(item.word, {
                ...item,
                word: draft.word.trim().replace(/\s+/g, " "),
                phonetic: draft.phonetic.trim(),
                definition: draft.definition.trim(),
                translation: draft.translation.trim(),
                meaning_groups: parseMeaningGroups(draft.definition.trim(), draft.translation.trim(), draft.word.trim()),
                highlighted_meanings: highlightedMeanings,
                source_sentence: draft.source_sentence.trim(),
                example: draft.example.trim(),
            });
            onSaved?.(saved);
            onClose();
        } catch (saveError) {
            const message = saveError instanceof Error ? saveError.message : "保存失败，请重试";
            if (message === "DUPLICATE_VOCAB_WORD") {
                setError("这个词已经在生词本里了，不能改成重复词。");
            } else {
                setError("保存失败，请重试。");
            }
        } finally {
            setIsSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label="关闭编辑弹窗"
                className="absolute inset-0 bg-[#2c1321]/22 backdrop-blur-[6px]"
                onClick={onClose}
            />
            <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/55 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,245,250,0.88))] shadow-[0_32px_80px_-42px_rgba(76,17,56,0.42)] backdrop-blur-2xl">
                <div className="border-b border-[#f2d8e6] px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#a16b85]">编辑词卡</p>
                            <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-[#3a1830]">
                                <PencilLine className="h-5 w-5 text-[#d0529b]" />
                                {item.word}
                            </h2>
                            <p className="mt-2 text-sm text-[#8a5d72]">
                                {item.source_label || "未标记来源"}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-white/65 bg-white/70 p-2 text-[#9b6880] transition-colors hover:text-[#6f3551]"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                    <label className="space-y-2 md:col-span-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#915f76]">单词 / 短语</span>
                        <input
                            ref={wordInputRef}
                            value={draft.word}
                            onChange={(event) => handleChange("word", event.target.value)}
                            className="h-12 w-full rounded-2xl border border-[#f2d8e6] bg-white/75 px-4 text-[15px] text-[#3a1830] outline-none transition focus:border-[#ef7eb6] focus:ring-2 focus:ring-[#f8b8d8]/60"
                        />
                    </label>

                    <label className="space-y-2 md:col-span-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#915f76]">音标</span>
                        <input
                            ref={phoneticInputRef}
                            value={draft.phonetic}
                            onChange={(event) => handleChange("phonetic", event.target.value)}
                            className="h-12 w-full rounded-2xl border border-[#f2d8e6] bg-white/75 px-4 text-[15px] text-[#3a1830] outline-none transition focus:border-[#ef7eb6] focus:ring-2 focus:ring-[#f8b8d8]/60"
                            placeholder="/rɪˈleɪ/"
                        />
                    </label>

                    <label className="space-y-2 md:col-span-1">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#915f76]">中文释义</span>
                        <input
                            value={draft.translation}
                            onChange={(event) => handleChange("translation", event.target.value)}
                            className="h-12 w-full rounded-2xl border border-[#f2d8e6] bg-white/75 px-4 text-[15px] text-[#3a1830] outline-none transition focus:border-[#ef7eb6] focus:ring-2 focus:ring-[#f8b8d8]/60"
                        />
                    </label>

                    <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#915f76]">英文释义 / 定义</span>
                        <PretextTextarea
                            ref={meaningsTextareaRef}
                            value={draft.definition}
                            onChange={(event) => handleChange("definition", event.target.value)}
                            rows={3}
                            minRows={3}
                            maxRows={12}
                            className="w-full rounded-2xl border border-[#f2d8e6] bg-white/75 px-4 py-3 text-[15px] leading-7 text-[#3a1830] outline-none transition focus:border-[#ef7eb6] focus:ring-2 focus:ring-[#f8b8d8]/60"
                        />
                    </label>

                    <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#915f76]">重点释义</span>
                        <PretextTextarea
                            value={draft.highlighted_meanings}
                            onChange={(event) => handleChange("highlighted_meanings", event.target.value)}
                            rows={3}
                            minRows={3}
                            maxRows={12}
                            className="w-full rounded-2xl border border-[#f2d8e6] bg-white/75 px-4 py-3 text-[15px] leading-7 text-[#3a1830] outline-none transition focus:border-[#ef7eb6] focus:ring-2 focus:ring-[#f8b8d8]/60"
                            placeholder={"每行一个重点释义\n例如：接力赛"}
                        />
                    </label>

                    <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#915f76]">来源例句</span>
                        <PretextTextarea
                            value={draft.source_sentence}
                            onChange={(event) => handleChange("source_sentence", event.target.value)}
                            rows={3}
                            minRows={3}
                            maxRows={12}
                            className="w-full rounded-2xl border border-[#f2d8e6] bg-white/75 px-4 py-3 text-[15px] leading-7 text-[#3a1830] outline-none transition focus:border-[#ef7eb6] focus:ring-2 focus:ring-[#f8b8d8]/60"
                        />
                    </label>

                    <label className="space-y-2 md:col-span-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#915f76]">AI / 字典例句</span>
                        <PretextTextarea
                            ref={exampleTextareaRef}
                            value={draft.example}
                            onChange={(event) => handleChange("example", event.target.value)}
                            rows={3}
                            minRows={3}
                            maxRows={12}
                            className="w-full rounded-2xl border border-[#f2d8e6] bg-white/75 px-4 py-3 text-[15px] leading-7 text-[#3a1830] outline-none transition focus:border-[#ef7eb6] focus:ring-2 focus:ring-[#f8b8d8]/60"
                        />
                    </label>
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-[#f2d8e6] bg-white/45 px-6 py-4">
                    <p className={cn("text-sm", error ? "text-rose-500" : "text-[#8a5d72]")}>
                        {error || "来源标签只读，避免把卡片来源改乱。"}
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl border border-[#f0d5e3] bg-white/75 px-4 py-2.5 text-sm font-semibold text-[#7a485f] transition hover:bg-white"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!canSubmit}
                            className="inline-flex min-w-[118px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#f37cb2] via-[#ea6faa] to-[#df63a1] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_18px_38px_-24px_rgba(223,99,161,0.8)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {isSaving ? "保存中..." : "保存修改"}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
