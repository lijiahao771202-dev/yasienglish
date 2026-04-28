"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiCoachHistoryMessage {
    role: string;
    content: string;
}

interface AiCoachHistoryDrawerProps {
    isOpen: boolean;
    history: AiCoachHistoryMessage[];
    inputValue: string;
    isPending: boolean;
    streamingText: string;
    onClose: () => void;
    onInputChange: (value: string) => void;
    onSubmit: (message: string) => void | Promise<void>;
}

function getDisplayMessage(message: AiCoachHistoryMessage) {
    const isUser = message.role === "user";
    let content = message.content;
    let parsedAssistantText: string | null = null;

    if (!isUser) {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as { chineseHint?: string };
                parsedAssistantText = parsed.chineseHint ?? null;
            }
        } catch {
            parsedAssistantText = null;
        }
    } else {
        const freeformMatch = content.match(/【学生自由提问】：([\s\S]*?)\n【当前输入框内容】/);
        if (freeformMatch) {
            content = freeformMatch[1];
        } else {
            const wrappedMatch = content.match(/已有内容：\n([\s\S]*)$/);
            if (wrappedMatch) {
                content = wrappedMatch[1];
            }
        }
        if (!content || !content.trim()) content = "[空白]";
    }

    return {
        isUser,
        content: parsedAssistantText ?? content,
    };
}

export function AiCoachHistoryDrawer({
    isOpen,
    history,
    inputValue,
    isPending,
    streamingText,
    onClose,
    onInputChange,
    onSubmit,
}: AiCoachHistoryDrawerProps) {
    return (
        <AnimatePresence>
            {isOpen ? (
                <motion.div
                    key="drawer-bg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 z-[130] bg-stone-900/20 backdrop-blur-sm"
                />
            ) : null}
            {isOpen ? (
                <motion.div
                    key="drawer-sheet"
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring" as const, damping: 25, stiffness: 200 }}
                    className="fixed right-0 top-0 bottom-0 z-[140] flex w-full max-w-[400px] flex-col border-l border-stone-200/50 bg-white/95 shadow-2xl backdrop-blur-xl"
                >
                    <div className="flex items-center justify-between border-b border-stone-100/80 p-5">
                        <div>
                            <h3 className="flex items-center gap-2 font-bold text-stone-800">
                                <Sparkles className="h-5 w-5 text-indigo-500" />
                                AI 智能答疑
                            </h3>
                            <p className="mt-0.5 text-[11px] font-medium tracking-wide text-stone-500">
                                随时解答你的语法和翻译疑惑
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-100"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex-1 space-y-6 overflow-y-auto p-5">
                        {history.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-3 text-stone-400">
                                <MessageCircle className="h-8 w-8 opacity-20" />
                                <p className="text-sm font-medium">暂无对话记录</p>
                            </div>
                        ) : (
                            history.map((msg, i) => {
                                const display = getDisplayMessage(msg);
                                return (
                                    <motion.div
                                        key={`${msg.role}-${i}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={cn("flex max-w-[85%] flex-col", display.isUser ? "ml-auto items-end" : "mr-auto items-start")}
                                    >
                                        <span className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                            {display.isUser ? "You wrote" : "AI 助手"}
                                        </span>
                                        <div
                                            className={cn(
                                                "rounded-[18px] p-3.5 text-sm leading-relaxed",
                                                display.isUser
                                                    ? "rounded-tr-sm bg-indigo-500 text-white shadow-sm"
                                                    : "rounded-tl-sm border border-stone-100 bg-white text-stone-800 shadow-sm",
                                            )}
                                        >
                                            {display.content}
                                        </div>
                                    </motion.div>
                                );
                            })
                        )}

                        {streamingText ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mr-auto flex max-w-[85%] flex-col items-start"
                            >
                                <span className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">AI 助手</span>
                                <div className="rounded-[18px] rounded-tl-sm border border-stone-100 bg-white p-3.5 text-sm leading-relaxed text-stone-800 shadow-sm whitespace-pre-wrap">
                                    {streamingText}
                                    <span className="ml-1 inline-block h-3 w-1.5 animate-pulse align-middle bg-stone-400" />
                                </div>
                            </motion.div>
                        ) : isPending ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mr-auto flex max-w-[85%] flex-col items-start"
                            >
                                <span className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">AI 助手</span>
                                <div className="flex h-[52px] items-center gap-1.5 rounded-[18px] rounded-tl-sm border border-stone-100 bg-white p-3.5 text-stone-800 shadow-sm">
                                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.3s]" />
                                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.15s]" />
                                    <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-stone-300" />
                                </div>
                            </motion.div>
                        ) : null}
                    </div>

                    <div className="border-t border-stone-100 bg-stone-50/50 p-4">
                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                void onSubmit(inputValue);
                            }}
                            className="relative flex items-center"
                        >
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(event) => onInputChange(event.target.value)}
                                placeholder="自由提问语法或结构..."
                                disabled={isPending}
                                className="w-full rounded-full border border-stone-200/80 bg-white py-3.5 pl-5 pr-12 text-[13px] font-medium text-stone-700 shadow-sm transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={isPending || !inputValue.trim()}
                                className="absolute right-2 rounded-full bg-indigo-500 p-2 text-white transition-all hover:scale-105 active:scale-95 disabled:bg-stone-200 disabled:text-stone-400"
                            >
                                <Send className="h-4 w-4" />
                            </button>
                        </form>
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
