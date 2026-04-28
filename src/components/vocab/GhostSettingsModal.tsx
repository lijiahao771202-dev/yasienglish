import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Zap, Clock, Wand2, SpellCheck, Activity, Layers, Component, Sparkles, Fingerprint, Palette, AlignLeft, LifeBuoy } from 'lucide-react';
import { useGhostSettingsStore } from '@/lib/ghost-settings-store';
import { subscribeBGEStatus, BGEStatus, ensureBGEReady, requestSemanticGrade, switchBGEModel } from '@/lib/bge-client';
import { useVectorEngineStore } from '@/lib/vector-engine-store';

interface Props {
    open: boolean;
    onClose: () => void;
}

export function GhostSettingsModal({ open, onClose }: Props) {
    const {
        passiveRescueEnabled, passiveRescueTimeoutSeconds,
        activeRescueEnabled, activeRescueTimeoutSeconds,
        autocorrectEnabled, allowDuplicates, semanticBranchingEnabled, grammarCompensationEnabled, passiveRescueWordCount, activeRescueWordCount, maxReferenceAlternatives,
        fuzzyTolerance, rescueColor, algorithmMode, writingGuideEnabled,
        setPassiveRescueEnabled, setPassiveRescueTimeoutSeconds,
        setActiveRescueEnabled, setActiveRescueTimeoutSeconds,
        setAutocorrectEnabled, setAllowDuplicates, setSemanticBranchingEnabled, setGrammarCompensationEnabled, setPassiveRescueWordCount, setActiveRescueWordCount, setMaxReferenceAlternatives,
        setFuzzyTolerance, setRescueColor, setAlgorithmMode, setWritingGuideEnabled,
        nlpShowMorphologyUI, nlpChunkWaterfallEnabled, nlpWaterfallDepth, nlpAutocorrectEnabled, nlpFuzzyTolerance, nlpSemanticBranchingEnabled, nlpGrammarCompensationEnabled,
        setNlpShowMorphologyUI, setNlpChunkWaterfallEnabled, setNlpWaterfallDepth, setNlpAutocorrectEnabled, setNlpFuzzyTolerance, setNlpSemanticBranchingEnabled, setNlpGrammarCompensationEnabled
    } = useGhostSettingsStore();

    // Unified Setters
    const handleAutocorrectChange = (val: boolean) => { setAutocorrectEnabled(val); setNlpAutocorrectEnabled(val); };
    const handleSemanticChange = (val: boolean) => { setSemanticBranchingEnabled(val); setNlpSemanticBranchingEnabled(val); };
    const handleGrammarChange = (val: boolean) => { setGrammarCompensationEnabled(val); setNlpGrammarCompensationEnabled(val); };
    const handleFuzzyChange = (val: number) => { setFuzzyTolerance(val); setNlpFuzzyTolerance(val); };

    const [bgeStatus, setBgeStatus] = useState<BGEStatus>('idle');
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [diagResult, setDiagResult] = useState<string | null>(null);
    const vectorModelId = useVectorEngineStore(state => state.vectorModelId);

    React.useEffect(() => {
        return subscribeBGEStatus((status) => {
            setBgeStatus(status);
        });
    }, []);

    const runBGEDiagnostics = async () => {
        setIsDiagnosing(true);
        setDiagResult(null);
        try {
            const ready = await ensureBGEReady();
            if (!ready) {
                setDiagResult('❌ 安装失败无响应');
                setIsDiagnosing(false);
                return;
            }
            const start = performance.now();
            const score = await requestSemanticGrade("hello", "hello");
            const ms = Math.round(performance.now() - start);

            if (score > 0.9) {
                setDiagResult(`✅ 运算健康 (${ms}ms)`);
            } else {
                setDiagResult('⚠️ 精度校验失败');
            }
        } catch (e) {
            setDiagResult('❌ 唤醒或推理失败');
        }
        setIsDiagnosing(false);
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 z-50 w-full max-w-[480px] max-h-[90vh] flex flex-col -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[2rem] bg-stone-50 shadow-2xl dark:bg-stone-950 border border-white/20 dark:border-white/5"
                    >
                        <div className="flex shrink-0 items-center justify-between p-6 pb-4 bg-white dark:bg-stone-900/50">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md">
                                    <Sparkles className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">预测器调优</h2>
                                    <p className="text-xs text-stone-500 dark:text-stone-400">全局引擎与容差感知配置</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="rounded-full p-2 bg-stone-100 text-stone-400 hover:bg-stone-200 hover:text-stone-600 transition-colors dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-6 overflow-y-auto p-6 pt-4">

                            {/* Informational Banner */}
                            <div className="bg-indigo-50/50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-xl p-3 flex gap-3 text-sm">
                                <div className="text-indigo-500 mt-0.5"><Sparkles className="w-5 h-5" /></div>
                                <div className="text-stone-600 dark:text-stone-300">
                                    <p className="font-bold text-indigo-900 dark:text-indigo-300 mb-1">系统已升级至「结构化语块」一代</p>
                                    <p className="text-xs leading-relaxed">由于新版全面推行了原生定界的切块输入法，不再存在长难句的“游标流失”风险。因此底层架构中的众多<span className="font-semibold">「模糊容错」</span>与<span className="font-semibold">「防断流」</span>算法在新版中已光荣隐退，仅在旧版长句题型中生效。</p>
                                </div>
                            </div>

                            {/* Section 1: Core Engine */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-1">
                                    <Activity className="h-4 w-4 text-indigo-500" />
                                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">核心引擎架构</h3>
                                    <span className="ml-1 text-[10px] bg-stone-100 text-stone-500 border border-stone-200 px-1.5 py-0.5 rounded shadow-sm dark:bg-stone-800 dark:border-stone-700 dark:text-stone-400">仅旧版长句生效</span>
                                </div>
                                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/80">
                                    <div className="flex w-full bg-stone-100 dark:bg-stone-800/50 rounded-xl p-1 mb-4">
                                        <button
                                            onClick={() => setAlgorithmMode('auto')}
                                            className={`flex-1 min-w-0 truncate h-8 px-2 rounded-lg text-[13px] font-bold transition-all ${algorithmMode === 'auto' ? 'bg-white text-indigo-600 shadow-sm dark:bg-stone-700 dark:text-indigo-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}
                                        >Auto</button>
                                        <button
                                            onClick={() => setAlgorithmMode('deterministic')}
                                            className={`flex-1 min-w-0 truncate h-8 px-2 rounded-lg text-[13px] font-bold transition-all ${algorithmMode === 'deterministic' ? 'bg-white text-indigo-600 shadow-sm dark:bg-stone-700 dark:text-indigo-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}
                                        >Det</button>
                                        <button
                                            onClick={() => setAlgorithmMode('vector')}
                                            className={`flex-1 min-w-0 truncate h-8 px-2 rounded-lg text-[13px] font-bold transition-all ${algorithmMode === 'vector' ? 'bg-white text-indigo-600 shadow-sm dark:bg-stone-700 dark:text-indigo-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}
                                        >Vec</button>
                                        <button
                                            onClick={() => setAlgorithmMode('nlp')}
                                            className={`flex-1 min-w-0 truncate h-8 px-2 rounded-lg text-[13px] font-bold transition-all relative ${algorithmMode === 'nlp' ? 'bg-gradient-to-r from-amber-100 to-amber-50 text-amber-700 shadow-sm border-amber-200/50 dark:from-amber-900/40 dark:to-amber-800/40 dark:text-amber-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}
                                        >NLP 🧬</button>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">向量基座模型 (Vector Backbone)</span>
                                            <button
                                                onClick={runBGEDiagnostics}
                                                disabled={isDiagnosing}
                                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 transition-colors disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {isDiagnosing ? '...' : '自检'}
                                            </button>
                                        </div>
                                        <div className="flex gap-2 items-center">
                                            {bgeStatus === 'ready' ? (
                                                <select
                                                    value={vectorModelId}
                                                    onChange={(e) => window.confirm(`这会导致本地向量缓存失效，需要重新执行全量Embedding。\n确定切换到 ${e.target.value} 吗？`) && switchBGEModel(e.target.value)}
                                                    className="flex-1 w-0 truncate px-2 py-1.5 rounded-lg text-xs font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 ring-1 ring-stone-200 dark:ring-stone-700 focus:outline-none appearance-none"
                                                >
                                                    <option value="Xenova/bge-m3">bge-m3 (1024维/多语种)</option>
                                                    <option value="Xenova/bge-large-en-v1.5">bge-large-en (1024维/长文本)</option>
                                                    <option value="Xenova/bge-small-en-v1.5">bge-small-en (384维/平衡)</option>
                                                    <option value="Xenova/all-MiniLM-L6-v2">MiniLM-L6 (384维/极速)</option>
                                                </select>
                                            ) : (
                                                <div className="flex-1 px-2 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400 flex items-center gap-1"><Zap className="w-3 h-3 animate-pulse" /> 装载与预热中...</div>
                                            )}
                                        </div>
                                        {diagResult && <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{diagResult}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Section 1.5: Writing Guide Engine */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-1 mt-6">
                                    <Sparkles className="h-4 w-4 text-purple-500" />
                                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">结构化造句引导 (Writing Guide)</h3>
                                </div>
                                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/80 space-y-5">
                                    <ToggleRow 
                                        icon={Sparkles} title="在卡壳时显示引导解构" 
                                        desc="基于 DeepSeek 的智能解构，当你在翻译发呆卡住 4 秒以上时，右下角将为你提供当前句子下一步建议和语法要点。" 
                                        checked={writingGuideEnabled} onChange={setWritingGuideEnabled} 
                                        tint="indigo"
                                    />
                                </div>
                            </div>

                            {/* Section 1.5: Writing Guide Engine */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-1 mt-6">
                                    <Sparkles className="h-4 w-4 text-purple-500" />
                                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">结构化造句引导 (Writing Guide)</h3>
                                    <span className="ml-1 text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded shadow-sm dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400">新版语块模式天然集成</span>
                                </div>
                                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/80 space-y-5">
                                    <ToggleRow 
                                        icon={Sparkles} title="在卡壳时显示引导解构" 
                                        desc="基于 DeepSeek 的智能解构，当你在发呆卡住时，提供当前句子下一步建议和语法要点。" 
                                        checked={writingGuideEnabled} onChange={setWritingGuideEnabled} 
                                        tint="indigo"
                                    />
                                </div>
                            </div>

                            {/* Section 2: Flow Control */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-1 mt-6">
                                    <AlignLeft className="h-4 w-4 text-emerald-500" />
                                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">补全延伸与截断</h3>
                                </div>
                                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/80 space-y-5">

                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">幽灵预判深度 (深度防剧透)
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">完美兼容新版语块</span>
                                            </h4>
                                            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">控制向未来预判透传的单词数。0为只补完当前单词的残缺侧。</p>
                                        </div>
                                        <div className="flex bg-stone-100 dark:bg-stone-800/50 rounded-lg p-1 shrink-0 ml-4 opacity-100">
                                            {[0, 1, 2, 3, 4].map(num => (
                                                <button key={num} onClick={() => setNlpWaterfallDepth(num)} className={`h-7 w-7 rounded-md text-xs font-bold transition-all ${nlpWaterfallDepth === num ? 'bg-emerald-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}`}>{num}</button>
                                            ))}
                                        </div>
                                    </div>

                                    <ToggleRow
                                        icon={Component} title="意群块级智能截断 (Chunk-Aware)"
                                        desc="基于名词/动词短语切分，避免硬性截断破坏语义。"
                                        checked={nlpChunkWaterfallEnabled} onChange={setNlpChunkWaterfallEnabled}
                                        disabled={algorithmMode !== 'nlp'}
                                        badge={algorithmMode !== 'nlp' ? '仅 NLP 🧬' : undefined}
                                        tint="emerald"
                                    />

                                    <ToggleRow
                                        icon={Layers} title="引擎探索视野拓宽"
                                        desc="引入更多的参考句变体同时计算，包容更多的平行表达。"
                                        checked={maxReferenceAlternatives > 1}
                                        onChange={(checked: boolean) => setMaxReferenceAlternatives(checked ? 4 : 1)}
                                        tint="emerald"
                                    />
                                </div>
                            </div>

                            {/* Section 3: Tolerances */}
                            <div className="space-y-4 relative">
                                <div className="flex items-center gap-2 px-1 mt-6">
                                    <Fingerprint className="h-4 w-4 text-rose-500" />
                                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">宽容度与智能纠错</h3>
                                    <span className="ml-1 text-[10px] bg-stone-100 text-stone-500 border border-stone-200 px-1.5 py-0.5 rounded shadow-sm dark:bg-stone-800 dark:border-stone-700 dark:text-stone-400">旧版长句特性</span>
                                </div>
                                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/80 space-y-5">
                                    <ToggleRow
                                        icon={SpellCheck} title="智能接轨与纠错"
                                        desc="输入出现小拼写错误时，直接高亮替代并允许接力。"
                                        checked={autocorrectEnabled || nlpAutocorrectEnabled} onChange={handleAutocorrectChange}
                                        tint="rose"
                                    />

                                    <div className="flex items-center justify-between border-t border-stone-100 dark:border-stone-800 pt-5">
                                        <div>
                                            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100">底层模糊容差级别</h4>
                                            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">0:严谨 / 1:平衡 / 2:极度宽容(Levenshtein)</p>
                                        </div>
                                        <div className="flex bg-stone-100 dark:bg-stone-800/50 rounded-lg p-1 shrink-0 ml-4">
                                            {[0, 1, 2].map(num => (
                                                <button key={num} onClick={() => handleFuzzyChange(num)} className={`h-7 w-7 rounded-md text-xs font-bold transition-all ${fuzzyTolerance === num ? 'bg-rose-500 text-white shadow-sm' : 'text-stone-500 dark:text-stone-400'}`}>{num}</button>
                                            ))}
                                        </div>
                                    </div>

                                    <ToggleRow
                                        icon={Zap} title="语义偏航吸附"
                                        desc="基于高能向量计算，输入意义相同的同义词时不打断流。"
                                        checked={semanticBranchingEnabled || nlpSemanticBranchingEnabled} onChange={handleSemanticChange}
                                        tint="rose"
                                    />

                                    <ToggleRow
                                        icon={Wand2} title="语境时态/复数代偿"
                                        desc="拼错时态但词根相同时，底层接力不中断并在后期通过气泡提示纠正。"
                                        checked={grammarCompensationEnabled || nlpGrammarCompensationEnabled} onChange={handleGrammarChange}
                                        tint="rose"
                                    />

                                    <ToggleRow
                                        icon={Palette} title="显示形态纠错气泡"
                                        desc="在光标上方弹出实时的单复数、时态偏误气泡。"
                                        checked={nlpShowMorphologyUI} onChange={setNlpShowMorphologyUI}
                                        disabled={algorithmMode !== 'nlp'}
                                        badge={algorithmMode !== 'nlp' ? '仅 NLP 🧬' : undefined}
                                        tint="rose"
                                    />
                                    <ToggleRow
                                        icon={Layers} title="允许词汇交叉重复"
                                        desc="允许出现冗余的多余虚词而不强制中断。"
                                        checked={allowDuplicates} onChange={setAllowDuplicates}
                                        tint="rose"
                                    />
                                </div>
                            </div>

                            {/* Section 4: Rescue */}
                            <div className="space-y-4 pb-12">
                                <div className="flex items-center gap-2 px-1 mt-6">
                                    <LifeBuoy className="h-4 w-4 text-sky-500" />
                                    <h3 className="text-sm font-bold text-stone-800 dark:text-stone-200 uppercase tracking-wider">神游救援系统</h3>
                                    <span className="ml-1 text-[10px] bg-emerald-50 text-emerald-600 border border-emerald-200 px-1.5 py-0.5 rounded shadow-sm dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400">新版完美融入</span>
                                </div>
                                <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/80 space-y-6">

                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-stone-400" /> 被动抢救 (发呆触发)</h4>
                                            </div>
                                            <label className="relative inline-flex cursor-pointer items-center">
                                                <input type="checkbox" className="peer sr-only" checked={passiveRescueEnabled} onChange={(e) => setPassiveRescueEnabled(e.target.checked)} />
                                                <div className="peer h-5 w-9 rounded-full bg-stone-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-amber-500 peer-checked:after:translate-x-full peer-focus:outline-none dark:bg-stone-700"></div>
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-4 px-1 opacity-90 disabled:opacity-50">
                                            <input type="range" min="0" max="10" step="0.5" disabled={!passiveRescueEnabled} value={passiveRescueTimeoutSeconds} onChange={(e) => setPassiveRescueTimeoutSeconds(parseFloat(e.target.value))} className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-stone-200 dark:bg-stone-700 accent-amber-500" />
                                            <span className="w-8 text-right text-xs font-medium text-stone-500">{passiveRescueTimeoutSeconds}s</span>
                                        </div>
                                    </div>

                                    <div className="border-t border-stone-100 dark:border-stone-800/80 pt-5">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-stone-400" /> 主动抢救 (首字母奖励)</h4>
                                            </div>
                                            <label className="relative inline-flex cursor-pointer items-center">
                                                <input type="checkbox" className="peer sr-only" checked={activeRescueEnabled} onChange={(e) => setActiveRescueEnabled(e.target.checked)} />
                                                <div className="peer h-5 w-9 rounded-full bg-stone-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-indigo-500 peer-checked:after:translate-x-full peer-focus:outline-none dark:bg-stone-700"></div>
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-4 px-1 opacity-90">
                                            <input type="range" min="0" max="10" step="0.5" disabled={!activeRescueEnabled} value={activeRescueTimeoutSeconds} onChange={(e) => setActiveRescueTimeoutSeconds(parseFloat(e.target.value))} className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-stone-200 dark:bg-stone-700 accent-indigo-500" />
                                            <span className="w-8 text-right text-xs font-medium text-stone-500">{activeRescueTimeoutSeconds}s</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-stone-100 dark:border-stone-800/80 pt-5">
                                        <div>
                                            <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                                                神游触发接力基础强度
                                                {nlpChunkWaterfallEnabled && <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">已托管给智能意群</span>}
                                            </h4>
                                            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">当抢救被触发时，兜底填充多长的词汇量。</p>
                                        </div>
                                        <div className={`flex bg-stone-100 dark:bg-stone-800/50 rounded-lg p-1 shrink-0 ml-4 transition-opacity ${nlpChunkWaterfallEnabled ? 'opacity-30 pointer-events-none' : ''}`}>
                                            {[0, 1, 2, 3, 4].map(num => (
                                                <button key={num} onClick={() => { setActiveRescueWordCount(num); setPassiveRescueWordCount(num); }} className={`h-7 w-7 rounded-md text-xs font-bold transition-all ${activeRescueWordCount === num ? 'bg-stone-800 text-white shadow-sm dark:bg-stone-200 dark:text-stone-800' : 'text-stone-500 dark:text-stone-400'}`}>{num === 0 ? '🎲' : num}</button>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            </div>

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// 提取一个复用的 Toggle 行组件，内置顶部分隔线(自动过滤第一个的线不在这个组件内做，用父级 space-y 代替比较省事，也可以用 border-t)
function ToggleRow({ icon: Icon, title, desc, checked, onChange, disabled = false, badge, tint = "indigo" }: any) {
    const tintColors: Record<string, string> = {
        indigo: "peer-checked:bg-indigo-500 title-indigo-500",
        emerald: "peer-checked:bg-emerald-500 title-emerald-500",
        rose: "peer-checked:bg-rose-500 title-rose-500",
    };

    return (
        <div className={`flex items-start justify-between border-t border-stone-100 dark:border-stone-800/80 pt-5 first:border-0 first:pt-0 ${disabled ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-2.5">
                <Icon className={`h-4 w-4 mt-0.5 text-stone-400 shrink-0`} />
                <div>
                    <h4 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                        {title}
                        {badge && <span className="px-1.5 py-0.5 rounded text-[9px] bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400 leading-none">{badge}</span>}
                    </h4>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 max-w-[260px] leading-relaxed">{desc}</p>
                </div>
            </div>
            <label className={`relative inline-flex items-center shrink-0 ml-4 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
                <div className={`peer h-5 w-9 rounded-full bg-stone-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full peer-focus:outline-none dark:bg-stone-700/80 dark:border-stone-600 ${tintColors[tint]}`}></div>
            </label>
        </div>
    );
}
