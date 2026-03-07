'use client';

import { motion } from 'framer-motion';
import {
    BookOpen, Languages, Lightbulb, Volume2,
    ArrowRight, Puzzle, AlertTriangle, Brain, Zap, Hash, Link2, RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeachingData {
    sentence_breakdown: {
        parts: Array<{ chinese: string; english: string; role: string }>;
        structure_hint: string;
    };
    key_vocab: Array<{
        word: string;
        phonetic: string;
        chinese: string;
        example: string;
        root?: string;
        synonyms?: string[];
        collocations?: string[];
    }>;
    grammar_point: {
        title: string;
        rule: string;
        examples: Array<{ chinese: string; english: string; highlight: string }>;
        common_mistakes: string;
    };
    chinglish_alerts?: Array<{
        wrong: string;
        correct: string;
        explanation: string;
    }>;
    memory_anchor?: string;
    translation_tips: string[];
}

interface TeachingCardProps {
    data: TeachingData;
    onReady: () => void;
    isLoading?: boolean;
}

// Minimal, elegant role colors matching a "bento/notion" aesthetic
const roleColors: Record<string, { bg: string; text: string; border: string }> = {
    '主语': { bg: 'bg-indigo-50/80', text: 'text-indigo-600', border: 'border-indigo-100/50' },
    '谓语': { bg: 'bg-emerald-50/80', text: 'text-emerald-700', border: 'border-emerald-100/50' },
    '宾语': { bg: 'bg-amber-50/80', text: 'text-amber-700', border: 'border-amber-100/50' },
    '状语': { bg: 'bg-purple-50/80', text: 'text-purple-600', border: 'border-purple-100/50' },
    '定语': { bg: 'bg-cyan-50/80', text: 'text-cyan-700', border: 'border-cyan-100/50' },
    '补语': { bg: 'bg-rose-50/80', text: 'text-rose-600', border: 'border-rose-100/50' },
    '表语': { bg: 'bg-blue-50/80', text: 'text-blue-600', border: 'border-blue-100/50' },
    '连词': { bg: 'bg-stone-100/80', text: 'text-stone-600', border: 'border-stone-200/50' },
};

function getRoleColor(role: string) {
    for (const [key, value] of Object.entries(roleColors)) {
        if (role.includes(key)) return value;
    }
    return { bg: 'bg-stone-50', text: 'text-stone-600', border: 'border-stone-200/50' };
}

// Clean section divider approach instead of boxed cards
function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
    return (
        <div className="py-1">
            <div className="flex items-center gap-2 mb-4 px-1">
                <Icon className="w-4 h-4 text-stone-400 shrink-0" />
                <h3 className="text-[13px] font-bold text-stone-800 tracking-wide">{title}</h3>
            </div>
            <div className="px-1">
                {children}
            </div>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-stone-200/60 to-transparent mt-8 mb-6" />
        </div>
    );
}

export function TeachingCard({ data, onReady, isLoading }: TeachingCardProps) {
    const pronounce = (text: string) => {
        const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`);
        audio.play().catch(() => { });
    };

    const pronounceSentence = (text: string) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.85;
            window.speechSynthesis.speak(utterance);
        }
    };

    if (isLoading) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full"
            >
                <div className="space-y-6 p-2">
                    <div className="h-24 rounded-2xl bg-stone-100 animate-pulse" />
                    <div className="space-y-4">
                        <div className="h-4 w-32 bg-stone-100 rounded-lg animate-pulse" />
                        <div className="h-32 rounded-xl bg-stone-50 animate-pulse" />
                    </div>
                    <div className="space-y-4">
                        <div className="h-4 w-32 bg-stone-100 rounded-lg animate-pulse" />
                        <div className="space-y-3">
                            <div className="h-16 rounded-xl bg-stone-50 animate-pulse" />
                            <div className="h-16 rounded-xl bg-stone-50 animate-pulse" />
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    if (!data) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full pb-4"
        >
            {/* Top Listen Button: Clean & Minimal */}
            {data.sentence_breakdown?.parts && (
                <button
                    onClick={() => pronounceSentence(data.sentence_breakdown.parts.map(p => p.english).join(' '))}
                    className="w-full group flex flex-col items-center justify-center py-6 px-4 rounded-[20px] bg-stone-50/50 hover:bg-stone-100/80 border border-stone-200/60 transition-all cursor-pointer mb-8 shadow-sm hover:shadow"
                >
                    <Volume2 className="w-5 h-5 text-stone-300 group-hover:text-indigo-500 transition-colors mb-2.5" />
                    <span className="text-[14px] leading-relaxed font-newsreader italic text-stone-700 group-hover:text-stone-900 transition-colors text-center">
                        "{data.sentence_breakdown.parts.map(p => p.english).join(' ')}"
                    </span>
                    <span className="text-[9px] text-stone-400 mt-3 font-medium tracking-widest uppercase">点击朗读原句</span>
                </button>
            )}

            {/* 1. Visual Syntax Tree */}
            <Section title="语法树可视化" icon={Languages}>
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                    {data.sentence_breakdown.parts.map((p, i) => {
                        const color = getRoleColor(p.role);
                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex flex-col overflow-hidden rounded-xl border border-stone-200/60 shadow-sm bg-white shrink-0 min-w-[72px]"
                            >
                                <div className={cn("text-[10px] font-bold text-center py-1 border-b", color.bg, color.text, color.border)}>
                                    {p.role}
                                </div>
                                <div className="flex flex-col items-center justify-center px-3 py-2.5 flex-1">
                                    <span className="text-[13px] font-medium text-stone-800">{p.chinese}</span>
                                    <span className="text-[11px] text-stone-500 font-newsreader mt-1">{p.english}</span>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
                <div className="flex items-center justify-center gap-2 text-[11px] text-stone-500 bg-stone-50/50 py-2.5 px-4 rounded-xl border border-stone-100">
                    <Puzzle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span><strong className="text-stone-700 font-medium mr-1">结构：</strong>{data.sentence_breakdown.structure_hint}</span>
                </div>
            </Section>

            {/* 2. Key Vocabulary (Clean List) */}
            <Section title="核心词汇解析" icon={BookOpen}>
                <div className="space-y-6">
                    {data.key_vocab.map((vocab, i) => (
                        <div key={i} className="group flex flex-col gap-2 pl-3.5 border-l-2 border-stone-100 hover:border-emerald-300 transition-colors relative">
                            {/* Header row */}
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-[15px] font-bold font-newsreader text-stone-900">{vocab.word}</span>
                                <span className="text-[11px] font-mono text-stone-400">{vocab.phonetic}</span>
                                <button
                                    onClick={() => pronounce(vocab.word)}
                                    className="ml-0.5 text-stone-300 hover:text-emerald-500 transition-colors cursor-pointer"
                                    title="发音"
                                >
                                    <Volume2 className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[13px] font-medium text-stone-600 ml-auto">{vocab.chinese}</span>
                            </div>

                            {/* Root */}
                            {vocab.root && (
                                <div className="text-[11px] text-stone-500 flex items-start gap-1.5 leading-relaxed">
                                    <Hash className="w-3 h-3 text-stone-300 shrink-0 mt-[2px]" />
                                    <span><strong className="text-stone-700 font-medium mr-1">词根拆解：</strong>{vocab.root}</span>
                                </div>
                            )}

                            {/* Tags (Synonyms/Collocations) */}
                            {(vocab.synonyms?.length || vocab.collocations?.length) && (
                                <div className="flex flex-wrap gap-x-3 gap-y-2 mt-0.5">
                                    {vocab.synonyms && vocab.synonyms.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <RefreshCw className="w-3 h-3 text-blue-300 shrink-0" />
                                            {vocab.synonyms.map((s, j) => (
                                                <span key={j} className="text-[10px] text-blue-600 bg-blue-50/50 px-1.5 py-0.5 rounded border border-blue-100/50">{s}</span>
                                            ))}
                                        </div>
                                    )}
                                    {vocab.collocations && vocab.collocations.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <Link2 className="w-3 h-3 text-purple-300 shrink-0" />
                                            {vocab.collocations.map((c, j) => (
                                                <span key={j} className="text-[10px] text-purple-600 bg-purple-50/50 px-1.5 py-0.5 rounded border border-purple-100/50 font-mono">{c}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Example */}
                            <div className="text-[11.5px] text-stone-500 italic font-newsreader mt-1 bg-stone-50/60 px-2.5 py-1.5 rounded-lg inline-block self-start">
                                "{vocab.example}"
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

            {/* 3. Grammar Point */}
            <Section title={data.grammar_point.title} icon={Lightbulb}>
                <div className="bg-amber-50/30 rounded-2xl p-4 border border-amber-100/50 shadow-sm shadow-amber-500/5">
                    <p className="text-[13px] text-stone-700 leading-relaxed mb-5">{data.grammar_point.rule}</p>

                    <div className="space-y-3 mb-5">
                        {data.grammar_point.examples.map((ex, i) => (
                            <div key={i} className="flex flex-col gap-1 text-[12px]">
                                <div className="text-stone-500">{ex.chinese}</div>
                                <div className="flex items-center gap-2">
                                    <div className="w-[3px] h-3 bg-stone-200 rounded-full" />
                                    <span className="font-newsreader text-stone-800 text-[13px]">{ex.english}</span>
                                </div>
                                <div className="text-[10px] text-amber-600/80 ml-[11px] mt-0.5 font-medium">▹ {ex.highlight}</div>
                            </div>
                        ))}
                    </div>

                    <div className="flex items-start gap-2 bg-white/80 p-3 rounded-xl border border-rose-100/50">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-[1px]" />
                        <span className="text-[11.5px] text-stone-600 leading-relaxed">
                            <strong className="text-rose-600 mr-1.5 font-bold">常见错误:</strong>
                            {data.grammar_point.common_mistakes}
                        </span>
                    </div>
                </div>
            </Section>

            {/* 4. Chinglish Alerts (Red/Green Minimal Blocks) */}
            {data.chinglish_alerts && data.chinglish_alerts.length > 0 && (
                <Section title="中式思维纠正" icon={AlertTriangle}>
                    <div className="space-y-3">
                        {data.chinglish_alerts.map((alert, i) => (
                            <div key={i} className="flex flex-col bg-stone-50/50 rounded-2xl p-3.5 border border-stone-100/80 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-rose-400 to-emerald-400 opacity-50" />

                                <div className="flex items-start gap-2.5 mb-2.5">
                                    <span className="text-[10px] font-bold text-rose-500 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded shadow-sm shrink-0">中式</span>
                                    <span className="text-[13px] text-stone-500 line-through decoration-rose-300 font-newsreader">{alert.wrong}</span>
                                </div>
                                <div className="flex items-start gap-2.5 mb-3">
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded shadow-sm shrink-0">地道</span>
                                    <span className="text-[13.5px] text-emerald-800 font-medium font-newsreader">{alert.correct}</span>
                                </div>
                                <div className="text-[11.5px] text-stone-500 pl-3 border-l-[2px] border-stone-200 ml-[34px] leading-relaxed">
                                    {alert.explanation}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Bottom Group: Memory & Tips seamlessly joined */}
            <div className="mt-2 space-y-4">
                {/* 5. Memory Anchor */}
                {data.memory_anchor && (
                    <div className="flex items-start gap-3.5 bg-gradient-to-br from-stone-50 to-stone-100 p-4 rounded-xl border border-stone-200/60 shadow-sm">
                        <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-stone-100 shrink-0">
                            <Brain className="w-4 h-4 text-amber-500" />
                        </div>
                        <div className="pt-0.5">
                            <h4 className="text-[11px] font-bold text-stone-800 mb-1.5 tracking-wide">记忆锚点</h4>
                            <p className="text-[12px] text-stone-600 leading-relaxed">{data.memory_anchor}</p>
                        </div>
                    </div>
                )}

                {/* Translation Tips */}
                {data.translation_tips && data.translation_tips.length > 0 && (
                    <div className="bg-indigo-50/40 rounded-xl p-4 border border-indigo-100/40 shadow-sm shadow-indigo-500/5">
                        <h4 className="text-[11px] font-bold text-indigo-500 flex items-center gap-1.5 mb-3 tracking-wide">
                            <Zap className="w-3.5 h-3.5" /> 翻译要点提醒
                        </h4>
                        <ul className="space-y-2">
                            {data.translation_tips.map((tip, i) => (
                                <li key={i} className="text-[12px] text-stone-600 flex items-start gap-2.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 mt-[5px] shrink-0" />
                                    <span className="leading-relaxed">{tip}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Ready Button */}
            <motion.button
                onClick={onReady}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full mt-8 py-3.5 rounded-xl bg-stone-900 text-white font-bold text-[13px] shadow-md hover:bg-stone-800 transition-colors flex items-center justify-center gap-2 cursor-pointer outline-none"
            >
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="tracking-wide">学完了，开始翻译</span>
            </motion.button>
        </motion.div>
    );
}
