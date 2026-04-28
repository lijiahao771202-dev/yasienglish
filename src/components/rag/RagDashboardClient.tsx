"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, BrainCircuit, Database, Loader2, Sparkles, Send, Play, Search, Target } from "lucide-react";

import { db } from "@/lib/db";
import { initBGEWorker, requestRagStore, requestRagQuery, subscribeBGEStatus, switchBGEModel, type BGEStatus } from "@/lib/bge-client";
import { useVectorEngineStore } from "@/lib/vector-engine-store";

export function RagDashboardClient() {
    const memoryCount = useLiveQuery(() => db.rag_vectors.count()) || 0;
    
    // Calculate vocab sync progress
    const vocabList = useLiveQuery(() => db.vocabulary.toArray()) || [];
    const vectorMemories = useLiveQuery(() => db.rag_vectors.where('source').equals('vocab').toArray()) || [];
    
    // We map vectorized vocab via text for simplicity, or by metadata
    const vectorizedVocabIds = new Set(vectorMemories.map(v => v.metadata?.vocabId || v.id));
    const pendingVocab = vocabList.filter(v => !vectorizedVocabIds.has(v.word));
    const vocabProgress = vocabList.length > 0 
        ? Math.round(((vocabList.length - pendingVocab.length) / vocabList.length) * 100)
        : 0;

    const [inputText, setInputText] = useState("");
    const [isProcessingChunk, setIsProcessingChunk] = useState(false);
    const [isSyncingVocab, setIsSyncingVocab] = useState(false);
    const [isIngestingSysVocab, setIsIngestingSysVocab] = useState(false);
    
    // Testing Probe State
    const [probeQuery, setProbeQuery] = useState("");
    const [probeResults, setProbeResults] = useState<any[]>([]);
    const [isProbing, setIsProbing] = useState(false);
    
    const vectorModelId = useVectorEngineStore((state) => state.vectorModelId);
    
    const [bgeStatus, setBgeStatus] = useState<BGEStatus>('idle');
    const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
    const [injectedDicts, setInjectedDicts] = useState<Record<string, boolean>>({});

    useEffect(() => {
        initBGEWorker();
        const unsub = subscribeBGEStatus((status) => setBgeStatus(status));
        
        // Load initial injected dict statuses
        const statuses: Record<string, boolean> = {};
        ['chuzhong', 'gaozhong', 'cet4', 'cet6', 'ielts', 'cefr'].forEach(key => {
            if (localStorage.getItem(`dict_injected_${key}`) === 'true') {
                statuses[key] = true;
            }
        });
        setInjectedDicts(statuses);
        
        return () => {
            unsub();
        };
    }, []);

    const handleIngestDocs = async () => {
        if (!inputText.trim() || bgeStatus !== 'ready') return;
        
        setIsProcessingChunk(true);
        const rawChunks = inputText.split(/(?:\n\n|\.\s+)/).map(t => t.trim()).filter(t => t.length > 5);
        
        setProgress({ current: 0, total: rawChunks.length, label: "提取切片特征..." });
        
        for (let i = 0; i < rawChunks.length; i++) {
            try {
                await requestRagStore(rawChunks[i], 'note');
            } catch (e) {
                console.warn("Failed to vectorize chunk", e);
            }
            setProgress({ current: i + 1, total: rawChunks.length, label: "提取切片特征..." });
        }
        
        setIsProcessingChunk(false);
        setInputText("");
    };

    const handleSyncVocab = async () => {
        if (pendingVocab.length === 0 || bgeStatus !== 'ready' || isSyncingVocab) return;
        
        setIsSyncingVocab(true);
        setProgress({ current: 0, total: pendingVocab.length, label: "生词本向量化..." });
        
        for (let i = 0; i < pendingVocab.length; i++) {
            const v = pendingVocab[i];
            try {
                const textToEmbed = `${v.word} - ${v.translation}`;
                await requestRagStore(textToEmbed, 'vocab', { vocabId: v.word });
            } catch (e) {
                console.warn("Failed to vectorize vocab", e);
            }
            // Add a tiny delay to not freeze the UI too much
            await new Promise(r => setTimeout(r, 10));
            setProgress({ current: i + 1, total: pendingVocab.length, label: "生词本向量化..." });
        }
        
        setIsSyncingVocab(false);
    };

    const handleIngestSysVocab = async (examType: 'chuzhong' | 'gaozhong' | 'cet4' | 'cet6' | 'ielts' | 'cefr') => {
        if (bgeStatus !== 'ready' || isBusy || isIngestingSysVocab) return;
        
        setIsIngestingSysVocab(true);
        try {
            const fileNameMap: Record<string, string> = {
                'chuzhong': '1-CHUZHONG-顺序.json',
                'gaozhong': '2-GAOZHONG-顺序.json',
                'cet4': '3-CET4-顺序.json',
                'cet6': '4-CET6-顺序.json',
                'ielts': '5-IELTS-顺序.json',
                'cefr': '6-OXFORD-5000.json'
            };
            const fileName = fileNameMap[examType];
            setProgress({ current: 0, total: 1, label: `正在拉取 ${examType.toUpperCase()} 大纲数据集...` });
            const res = await fetch(`/data/${fileName}`);
            if (!res.ok) throw new Error("JSON file not found in public/data/");
            const json = await res.json();
            
            // Limit to first 2000 for rapid testing, or all if we want the full dictionary. We'll load all.
            const dataToProcess = json;
            setProgress({ current: 0, total: dataToProcess.length, label: `深度灌注 ${examType.toUpperCase()} 记忆池...` });
            
            for (let i = 0; i < dataToProcess.length; i++) {
                const doc = dataToProcess[i];
                if (!doc.word || !doc.translations) continue;
                
                // Format: "apple - n. 苹果"
                const meanings = doc.translations.map((t: any) => `${t.type || ''} ${t.translation}`).join('; ');
                const textToEmbed = `${doc.word} - ${meanings}`.trim();

                let specificCefrLevel = undefined;
                if (examType === 'cefr' && doc.translations.length > 0) {
                    const firstType = doc.translations[0].type || '';
                    const match = firstType.match(/^(A1|A2|B1|B2|C1|C2)/i);
                    if (match) {
                        specificCefrLevel = match[1].toUpperCase();
                    }
                }
                
                await requestRagStore(textToEmbed, 'system', { 
                    vocabId: doc.word, 
                    level: examType,
                    cefrLevel: specificCefrLevel,
                    type: 'system_dictionary'
                });
                
                // Let the UI breathe every 10 items
                if (i % 10 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                    setProgress({ current: i + 1, total: dataToProcess.length, label: `深度灌注 ${examType.toUpperCase()} 记忆池...` });
                }
            }
        } catch (e: any) {
            console.error("SysVocab Ingest Error:", e);
            alert(`导入失败: ${e.message}`);
        } finally {
            setIsIngestingSysVocab(false);
            localStorage.setItem(`dict_injected_${examType}`, 'true');
            setInjectedDicts(prev => ({ ...prev, [examType]: true }));
        }
    };

    const handleProbe = async () => {
        if (!probeQuery.trim() || bgeStatus !== 'ready') return;
        setIsProbing(true);
        const startTime = performance.now();
        try {
            const results = await requestRagQuery(probeQuery, 3, 0.4);
            const endTime = performance.now();
            setProbeResults(results.map(r => ({ ...r, latency: (endTime - startTime).toFixed(1) })));
        } catch (e) {
            console.error(e);
        }
        setIsProbing(false);
    };

    const isBusy = isProcessingChunk || isSyncingVocab;

    return (
        <main className="font-welcome-ui min-h-screen bg-theme-base-bg px-4 py-12 sm:px-6 lg:px-8 overflow-hidden relative transition-colors duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/30 to-emerald-50/30 pointer-events-none" />
            
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring" as const, stiffness: 300, damping: 25 }} className="mx-auto max-w-5xl space-y-8 relative z-10">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-2">
                        <motion.div whileHover={{ scale: 1.05 }} className="inline-flex items-center gap-2 rounded-full border-4 border-theme-border bg-theme-primary-bg px-4 py-1.5 text-xs font-black uppercase tracking-wider text-theme-primary-text shadow-[0_4px_0_0_var(--theme-shadow)] cursor-default transition-colors">
                            <BrainCircuit className="h-4 w-4" />
                            Neural Memory Engine
                        </motion.div>
                        <h1 className="font-welcome-display text-5xl tracking-[-0.05em] text-theme-text transition-colors">
                            私人记忆大脑腔
                        </h1>
                        <p className="max-w-2xl text-[15px] font-bold leading-6 text-theme-text-muted transition-colors">
                            管理您的本地零延迟 RAG（检索增强生成）向量库。数据断网可用，隐私绝对安全。
                        </p>
                    </div>
                    <Link href="/" passHref>
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            whileHover={{ scale: 1.05, y: -2 }}
                            className="inline-flex items-center gap-2 rounded-[1.2rem] border-4 border-theme-border bg-theme-card-bg px-5 py-3 text-sm font-black text-theme-text shadow-[0_4px_0_0_var(--theme-shadow)] transition-all hover:bg-theme-base-bg hover:shadow-[0_6px_0_0_var(--theme-shadow)]"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            返回主页
                        </motion.button>
                    </Link>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Setup & Status Panel */}
                    <div className="lg:col-span-1 rounded-[2.5rem] border-4 border-theme-border bg-theme-card-bg p-8 shadow-[0_12px_0_0_var(--theme-shadow)] relative overflow-hidden flex flex-col items-center justify-center space-y-6">
                        <div className="absolute top-0 right-0 p-8 opacity-5 filter blur-[2px] pointer-events-none">
                            <Database className="w-64 h-64 text-theme-text" />
                        </div>
                        
                        <div className="bg-theme-active-bg px-5 py-3 rounded-2xl border-[3px] border-theme-border flex flex-col items-center gap-1.5 shadow-[0_4px_0_0_var(--theme-shadow)] z-10 w-full justify-center">
                            <div className="flex items-center gap-3">
                                <div className={`w-4 h-4 rounded-full shadow-inner ${bgeStatus === 'ready' ? 'bg-emerald-500 animate-pulse shadow-emerald-500/50' : 'bg-amber-500 shadow-amber-500/50'}`} />
                                <span className="font-black text-[15px] tracking-wide text-theme-active-text uppercase">
                                    {bgeStatus === 'ready' ? '算力引擎：在线计算中' : '算力引擎：握手点火中...'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-2 w-full px-2">
                                <span className="text-[9px] font-black text-theme-text-muted tracking-widest uppercase shrink-0">全局模型</span>
                                <select 
                                    value={vectorModelId}
                                    onChange={(e) => {
                                        if (confirm(`⚠️ 危险操作预警\n\n切换至 [${e.target.value}] 将带来以下影响：\n1. 所有正在进行的检索查询将被切断。\n2. 因维度不同，底层已有的所有 记忆/笔记/错题 向量缓存会立即自毁清空！(需重新点击同步)\n3. 浏览器将消耗几十到上百兆流量拉取新引擎权重。\n\n您确定要切换并格式化向量库吗？`)) {
                                            switchBGEModel(e.target.value);
                                        }
                                    }}
                                    disabled={bgeStatus === 'loading'}
                                    className="flex-1 min-w-0 bg-theme-base-bg border border-theme-border/50 text-[10px] font-bold text-theme-text rounded-md px-2 py-1 outline-none focus:border-emerald-500/50 cursor-pointer disabled:opacity-50 transition-colors"
                                >
                                    <option value="Xenova/bge-m3">Xenova/bge-m3 (1024维/多语种/最高精度)</option>
                                    <option value="Xenova/bge-large-en-v1.5">Xenova/bge-large-en-v1.5 (1024维/纯英长文本优选)</option>
                                    <option value="Xenova/bge-small-en-v1.5">Xenova/bge-small-en-v1.5 (384维/平衡性能)</option>
                                    <option value="Xenova/all-MiniLM-L6-v2">Xenova/all-MiniLM-L6-v2 (384维/极简极速版)</option>
                                </select>
                            </div>
                        </div>
                        
                        <div className="z-10 w-full mt-4">
                            <motion.button 
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={async () => {
                                    if(confirm('警告：这将会彻底清空你所有的向量记忆缓存（生词、错误记录、笔记），是否继续？清空后需重新同步！')) {
                                        await db.rag_vectors.clear();
                                        ['chuzhong', 'gaozhong', 'cet4', 'cet6', 'ielts', 'cefr'].forEach(key => localStorage.removeItem(`dict_injected_${key}`));
                                        setInjectedDicts({});
                                        alert('🧹 向量数据库已完全格式化并清空！请重新进行各项同步。');
                                    }
                                }}
                                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 font-black text-xs py-2 px-4 rounded-xl border-[3px] border-red-500/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <Database className="w-3 h-3" />
                                格式化清空本地神经库
                            </motion.button>
                        </div>
                        
                        <div className="z-10 bg-theme-base-bg w-full rounded-[2rem] border-[3px] border-theme-border p-6 shadow-inner flex flex-col items-center justify-center space-y-2">
                            <span className="text-xs font-black text-theme-text-muted uppercase tracking-widest flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                神经细胞总体积
                            </span>
                            <span className="font-welcome-display text-6xl text-theme-text">{memoryCount}</span>
                        </div>
                    </div>

                    {/* Main Interaction Area */}
                    <div className="lg:col-span-2 space-y-6">
                        
                        {/* Vocab Sync Module */}
                        <div className="rounded-[2.5rem] border-4 border-theme-border bg-theme-card-bg p-8 shadow-[0_12px_0_0_var(--theme-shadow)] relative transition-colors">
                            <h3 className="font-welcome-display text-2xl font-black text-theme-text flex items-center gap-3">
                                自动向量同步 (生词库)
                            </h3>
                            <p className="mt-2 text-sm font-bold text-theme-text-muted">
                                将您的生词和例句提取至向量空间。辅导老师讲解时将自动搜刮引用这些神经片段。
                            </p>
                            
                            <div className="mt-6 flex flex-col sm:flex-row items-center gap-6">
                                <div className="flex-1 w-full relative">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-sm font-black text-theme-text">当前同步进度</span>
                                        <span className="text-2xl font-welcome-display font-black text-theme-text">{vocabProgress}%</span>
                                    </div>
                                    <div className="h-6 w-full bg-theme-base-bg border-[3px] border-theme-border rounded-full overflow-hidden p-1">
                                        <motion.div 
                                            className="h-full bg-emerald-500 rounded-full" 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${vocabProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-xs font-bold text-theme-text-muted mt-2 text-right">
                                        已同步 {vocabList.length - pendingVocab.length} / 共 {vocabList.length} 词
                                    </p>
                                </div>
                                
                                <motion.button 
                                    whileHover={pendingVocab.length > 0 && !isBusy && bgeStatus === 'ready' ? { scale: 1.05 } : {}}
                                    whileTap={pendingVocab.length > 0 && !isBusy && bgeStatus === 'ready' ? { scale: 0.95 } : {}}
                                    onClick={handleSyncVocab}
                                    disabled={pendingVocab.length === 0 || isBusy || bgeStatus !== 'ready'}
                                    className={`shrink-0 h-14 px-6 rounded-2xl border-[3px] border-theme-border font-black text-[15px] shadow-[0_4px_0_0_var(--theme-shadow)] flex items-center gap-2 transition-all
                                        ${pendingVocab.length === 0 ? 'bg-theme-base-bg text-theme-text opacity-50 cursor-not-allowed' : 
                                            isSyncingVocab ? 'bg-indigo-50 text-indigo-500 border-indigo-200' :
                                            'bg-theme-text text-theme-card-bg hover:-translate-y-1 hover:shadow-[0_6px_0_0_var(--theme-shadow)]'}`}
                                >
                                    {isSyncingVocab ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : pendingVocab.length === 0 ? (
                                        <Sparkles className="w-5 h-5" />
                                    ) : (
                                        <Play className="w-5 h-5 ml-1" />
                                    )}
                                    {pendingVocab.length === 0 ? '已完全同步' : isSyncingVocab ? '同步中...' : '开始同步'}
                                </motion.button>
                            </div>
                        </div>

                        {/* System Vocab Ingest Module */}
                        <div className="rounded-[2.5rem] border-4 border-theme-border bg-theme-card-bg p-8 shadow-[0_12px_0_0_var(--theme-shadow)] relative transition-colors bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-900/10 dark:to-purple-900/10 border-indigo-200 dark:border-indigo-800">
                            <h3 className="font-welcome-display text-2xl font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-3">
                                核心大纲词库强行灌脑 (实验性)
                            </h3>
                            <p className="mt-2 text-sm font-bold text-theme-text-muted">
                                一键将开源框架大纲（CET-4 / CET-6 等）压入底层向量数据库。供 CAT 测验或 AI 写作老师参考。由于数据量庞大（几千词），可能需要 1~2 分钟。您可以点击后去其他页面，它会在后台默默完成。
                            </p>
                            
                            {isIngestingSysVocab && (
                                <div className="mt-4 bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl p-4 shadow-inner">
                                    <div className="flex justify-between flex-wrap gap-2 items-center mb-2 px-1">
                                        <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            {progress.label}
                                        </span>
                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-800/50 px-2 py-1 rounded-md">
                                            {progress.current} / {progress.total}
                                        </span>
                                    </div>
                                    <div className="h-3 w-full bg-indigo-200/50 dark:bg-indigo-900/50 rounded-full overflow-hidden p-[2px]">
                                        <motion.div 
                                            className="h-full bg-indigo-500 rounded-full shrink-0" 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.max(1, (progress.current / (progress.total || 1)) * 100)}%` }}
                                            transition={{ ease: "linear" }}
                                        />
                                    </div>
                                </div>
                            )}
                            
                            <div className="mt-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
                                <motion.button 
                                    whileHover={!isBusy && bgeStatus === 'ready' && !injectedDicts['chuzhong'] ? { scale: 1.05 } : {}}
                                    whileTap={!isBusy && bgeStatus === 'ready' && !injectedDicts['chuzhong'] ? { scale: 0.95 } : {}}
                                    onClick={() => handleIngestSysVocab('chuzhong')}
                                    disabled={isIngestingSysVocab || bgeStatus !== 'ready' || injectedDicts['chuzhong']}
                                    className={`w-full h-14 px-2 rounded-2xl border-[3px] border-cyan-300 dark:border-cyan-700 font-black text-[13px] sm:text-[14px] shadow-[0_4px_0_0_var(--theme-shadow)] flex items-center justify-center gap-2 transition-all
                                        ${injectedDicts['chuzhong'] ? 'bg-cyan-500/20 text-cyan-600 border-cyan-500/30 cursor-not-allowed opacity-60' : isIngestingSysVocab ? 'bg-cyan-100 text-cyan-600 opacity-50' : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 dark:hover:bg-cyan-900/50 hover:-translate-y-1 hover:shadow-[0_6px_0_0_rgba(6,182,212,0.2)]'}`}
                                >
                                    {isIngestingSysVocab && !injectedDicts['chuzhong'] ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                                    <span className="truncate">{injectedDicts['chuzhong'] ? '已注入 (3000词)' : '初中基础 3000词'}</span>
                                </motion.button>
                                
                                <motion.button 
                                    whileHover={!isBusy && bgeStatus === 'ready' && !injectedDicts['gaozhong'] ? { scale: 1.05 } : {}}
                                    whileTap={!isBusy && bgeStatus === 'ready' && !injectedDicts['gaozhong'] ? { scale: 0.95 } : {}}
                                    onClick={() => handleIngestSysVocab('gaozhong')}
                                    disabled={isIngestingSysVocab || bgeStatus !== 'ready' || injectedDicts['gaozhong']}
                                    className={`w-full h-14 px-2 rounded-2xl border-[3px] border-sky-300 dark:border-sky-700 font-black text-[13px] sm:text-[14px] shadow-[0_4px_0_0_var(--theme-shadow)] flex items-center justify-center gap-2 transition-all
                                        ${injectedDicts['gaozhong'] ? 'bg-sky-500/20 text-sky-600 border-sky-500/30 cursor-not-allowed opacity-60' : isIngestingSysVocab ? 'bg-sky-100 text-sky-600 opacity-50' : 'bg-sky-50 hover:bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50 hover:-translate-y-1 hover:shadow-[0_6px_0_0_rgba(14,165,233,0.2)]'}`}
                                >
                                    {isIngestingSysVocab && !injectedDicts['gaozhong'] ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                                    <span className="truncate">{injectedDicts['gaozhong'] ? '已注入 (4600词)' : '高中进阶 4600词'}</span>
                                </motion.button>
                                
                                <motion.button 
                                    whileHover={!isBusy && bgeStatus === 'ready' && !injectedDicts['cet4'] ? { scale: 1.05 } : {}}
                                    whileTap={!isBusy && bgeStatus === 'ready' && !injectedDicts['cet4'] ? { scale: 0.95 } : {}}
                                    onClick={() => handleIngestSysVocab('cet4')}
                                    disabled={isIngestingSysVocab || bgeStatus !== 'ready' || injectedDicts['cet4']}
                                    className={`w-full h-14 px-2 rounded-2xl border-[3px] border-indigo-300 dark:border-indigo-700 font-black text-[13px] sm:text-[14px] shadow-[0_4px_0_0_var(--theme-shadow)] flex items-center justify-center gap-2 transition-all
                                        ${injectedDicts['cet4'] ? 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30 cursor-not-allowed opacity-60' : isIngestingSysVocab ? 'bg-indigo-100 text-indigo-600 opacity-50' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 hover:-translate-y-1 hover:shadow-[0_6px_0_0_rgba(99,102,241,0.2)]'}`}
                                >
                                    {isIngestingSysVocab && !injectedDicts['cet4'] ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                                    <span className="truncate">{injectedDicts['cet4'] ? '已注入 (5300词)' : '注入 5300 四级词'}</span>
                                </motion.button>

                                <motion.button 
                                    whileHover={!isBusy && bgeStatus === 'ready' && !injectedDicts['cet6'] ? { scale: 1.05 } : {}}
                                    whileTap={!isBusy && bgeStatus === 'ready' && !injectedDicts['cet6'] ? { scale: 0.95 } : {}}
                                    onClick={() => handleIngestSysVocab('cet6')}
                                    disabled={isIngestingSysVocab || bgeStatus !== 'ready' || injectedDicts['cet6']}
                                    className={`w-full h-14 px-2 rounded-2xl border-[3px] border-purple-300 dark:border-purple-700 font-black text-[13px] sm:text-[14px] shadow-[0_4px_0_0_var(--theme-shadow)] flex items-center justify-center gap-2 transition-all
                                        ${injectedDicts['cet6'] ? 'bg-purple-500/20 text-purple-600 border-purple-500/30 cursor-not-allowed opacity-60' : isIngestingSysVocab ? 'bg-purple-100 text-purple-600 opacity-50' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 hover:-translate-y-1 hover:shadow-[0_6px_0_0_rgba(168,85,247,0.2)]'}`}
                                >
                                    {isIngestingSysVocab && !injectedDicts['cet6'] ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                                    <span className="truncate">{injectedDicts['cet6'] ? '已注入 (2900词)' : '注入 2900 六级词'}</span>
                                </motion.button>

                                <motion.button 
                                    whileHover={!isBusy && bgeStatus === 'ready' && !injectedDicts['ielts'] ? { scale: 1.05 } : {}}
                                    whileTap={!isBusy && bgeStatus === 'ready' && !injectedDicts['ielts'] ? { scale: 0.95 } : {}}
                                    onClick={() => handleIngestSysVocab('ielts')}
                                    disabled={isIngestingSysVocab || bgeStatus !== 'ready' || injectedDicts['ielts']}
                                    className={`w-full h-14 px-2 rounded-2xl border-[3px] border-rose-300 dark:border-rose-700 font-black text-[13px] sm:text-[14px] shadow-[0_4px_0_0_var(--theme-shadow)] flex items-center justify-center gap-2 transition-all
                                        ${injectedDicts['ielts'] ? 'bg-rose-500/20 text-rose-600 border-rose-500/30 cursor-not-allowed opacity-60' : isIngestingSysVocab ? 'bg-rose-100 text-rose-600 opacity-50' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50 hover:-translate-y-1 hover:shadow-[0_6px_0_0_rgba(244,63,94,0.2)]'}`}
                                >
                                    {isIngestingSysVocab && !injectedDicts['ielts'] ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                                    <span className="truncate">{injectedDicts['ielts'] ? '已注入 (7000词)' : '注入 7000 雅思词'}</span>
                                </motion.button>
                                
                                <motion.button 
                                    whileHover={!isBusy && bgeStatus === 'ready' && !injectedDicts['cefr'] ? { scale: 1.05 } : {}}
                                    whileTap={!isBusy && bgeStatus === 'ready' && !injectedDicts['cefr'] ? { scale: 0.95 } : {}}
                                    onClick={() => handleIngestSysVocab('cefr')}
                                    disabled={isIngestingSysVocab || bgeStatus !== 'ready' || injectedDicts['cefr']}
                                    className={`w-full col-span-2 lg:col-span-1 h-14 px-2 rounded-2xl border-[3px] border-amber-300 dark:border-amber-700 font-black text-[13px] sm:text-[14px] shadow-[0_4px_0_0_var(--theme-shadow)] flex items-center justify-center gap-2 transition-all
                                        ${injectedDicts['cefr'] ? 'bg-amber-500/20 text-amber-600 border-amber-500/30 cursor-not-allowed opacity-60' : isIngestingSysVocab ? 'bg-amber-100 text-amber-600 opacity-50' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50 hover:-translate-y-1 hover:shadow-[0_6px_0_0_rgba(245,158,11,0.2)]'}`}
                                >
                                    {isIngestingSysVocab && !injectedDicts['cefr'] ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                                    <span className="truncate">{injectedDicts['cefr'] ? '已注入 (牛津5000)' : '牛津 5000 (CEFR难度)'}</span>
                                </motion.button>
                            </div>
                        </div>

                        {/* Custom Feed Module */}
                        <div className="rounded-[2.5rem] border-4 border-theme-border bg-theme-card-bg p-8 shadow-[0_12px_0_0_var(--theme-shadow)] relative transition-colors overflow-hidden">
                            <h3 className="font-welcome-display text-2xl font-black text-theme-text flex items-center gap-3">
                                主动喂养舱 (外部语料)
                            </h3>
                            <p className="mt-2 text-sm font-bold text-theme-text-muted mb-4">
                                粘贴自己的私房笔记、外刊段落、写作满分句式。投喂后它们将永久印刻到你的 AI 教练脑海中。
                            </p>
                            
                            <div className="relative">
                                <textarea 
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    disabled={isBusy}
                                    placeholder="输入要向量化处理的文本... 比如一段精彩的外刊："
                                    className="w-full bg-white/50 dark:bg-black/20 rounded-2xl border-[3px] border-theme-border p-5 text-[15px] font-medium text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 resize-none h-44 transition-all disabled:opacity-50"
                                />
                                <motion.button 
                                    whileHover={inputText.trim() && !isBusy && bgeStatus === 'ready' ? { scale: 1.05 } : {}}
                                    whileTap={inputText.trim() && !isBusy && bgeStatus === 'ready' ? { scale: 0.95 } : {}}
                                    onClick={handleIngestDocs}
                                    disabled={!inputText.trim() || isBusy || bgeStatus !== 'ready'}
                                    className={`absolute bottom-5 right-5 p-4 rounded-full border-[3px] border-theme-border text-white shadow-[0_4px_0_0_var(--theme-shadow)] transition-all ${!inputText.trim() || isBusy || bgeStatus !== 'ready' ? 'bg-stone-300 dark:bg-stone-700 opacity-50 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 hover:-translate-y-1 hover:shadow-[0_6px_0_0_var(--theme-shadow)] cursor-pointer'}`}
                                >
                                    {isProcessingChunk ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 -ml-1" />}
                                </motion.button>
                            </div>
                        </div>

                        {/* Memory Probe Module to prove it works */}
                        <div className="rounded-[2.5rem] border-4 border-theme-border bg-theme-base-bg p-8 shadow-inner relative transition-colors">
                            <h3 className="font-welcome-display text-2xl font-black text-theme-text flex items-center gap-3">
                                <Search className="w-6 h-6 text-indigo-500" />
                                潜意识探针 (验证记忆提取)
                            </h3>
                            <p className="mt-2 text-sm font-bold text-theme-text-muted mb-4">
                                输入任何能联想到你生词的中文或英文残片，感受本地 GPU 毫秒级的神经检索能力。绝不骗你。
                            </p>
                            
                            <div className="relative">
                                <input 
                                    value={probeQuery}
                                    onChange={(e) => setProbeQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleProbe()}
                                    placeholder="输入任意句子测试联想，例如：开心、发财、科技..."
                                    className="w-full bg-white/80 dark:bg-black/40 rounded-2xl border-[3px] border-theme-border p-4 pr-16 text-[15px] font-medium text-theme-text placeholder:text-theme-text-muted/50 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all"
                                />
                                <motion.button 
                                    whileHover={probeQuery.trim() && !isProbing && bgeStatus === 'ready' ? { scale: 1.05 } : {}}
                                    whileTap={probeQuery.trim() && !isProbing && bgeStatus === 'ready' ? { scale: 0.95 } : {}}
                                    onClick={handleProbe}
                                    disabled={!probeQuery.trim() || isProbing || bgeStatus !== 'ready'}
                                    className={`absolute top-2 right-2 bottom-2 aspect-square rounded-xl border-[2px] border-theme-border flex items-center justify-center text-white shadow-[0_2px_0_0_var(--theme-shadow)] transition-all ${!probeQuery.trim() || isProbing || bgeStatus !== 'ready' ? 'bg-stone-300 dark:bg-stone-700 opacity-50 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-400 cursor-pointer'}`}
                                >
                                    {isProbing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                </motion.button>
                            </div>
                            
                            {probeResults.length > 0 && (
                                <div className="mt-6 space-y-3">
                                    <h4 className="text-xs font-black uppercase text-theme-text-muted tracking-wider flex items-center gap-2">
                                        <Target className="w-4 h-4" /> 神经共振结果 (耗时：{probeResults[0]?.latency}ms)
                                    </h4>
                                    {probeResults.map((result, idx) => (
                                        <div key={idx} className="bg-theme-card-bg rounded-xl border-2 border-theme-border p-3 flex justify-between items-center shadow-[0_2px_0_0_var(--theme-shadow)]">
                                            <span className="font-bold text-sm text-theme-text font-mono truncate">{result.text}</span>
                                            <span className="text-xs font-black px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md whitespace-nowrap">
                                                相似度 {(result.score * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            </motion.div>
            
            {/* Global Overlay for Processing UI */}
            <AnimatePresence>
                {isBusy && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-theme-base-bg/60 backdrop-blur-md flex flex-col items-center justify-center pointer-events-auto"
                    >
                        <div className="bg-theme-card-bg border-[4px] border-theme-border rounded-[2.5rem] p-8 max-w-sm w-full mx-4 shadow-[0_24px_0_0_var(--theme-shadow)] flex flex-col items-center space-y-6 text-center">
                            <Loader2 className="w-12 h-12 text-theme-text animate-spin" />
                            <div className="space-y-2 w-full">
                                <h4 className="font-welcome-display tracking-wide font-black text-xl text-theme-text">{progress.label}</h4>
                                <div className="flex justify-between items-end mb-1 px-1">
                                    <span className="text-sm font-bold text-theme-text-muted">完成度</span>
                                    <span className="text-[15px] font-black text-theme-text">{progress.current} / {progress.total}</span>
                                </div>
                                <div className="h-4 w-full bg-theme-base-bg border-[3px] border-theme-border rounded-full overflow-hidden p-[2px]">
                                    <motion.div 
                                        className="h-full bg-theme-text rounded-full shrink-0" 
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.max(1, (progress.current / (progress.total || 1)) * 100)}%` }}
                                        transition={{ ease: "linear" }}
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
