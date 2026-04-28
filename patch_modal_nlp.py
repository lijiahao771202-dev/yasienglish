import re

with open("src/components/vocab/GhostSettingsModal.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Destructure the new properties
find_vars = "setFuzzyTolerance, setRescueColor, setAlgorithmMode"
replace_vars = "setFuzzyTolerance, setRescueColor, setAlgorithmMode, nlpShowMorphologyUI, nlpWaterfallDepth, setNlpShowMorphologyUI, setNlpWaterfallDepth"

text = text.replace(find_vars, replace_vars)

# 2. Add the dynamic controls to the NLP block
find_block = """                                        <span className="flex items-center gap-2 mt-1.5">
                                            <svg className="w-3 h-3 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            实时高亮时态、单复数错误并提供纠正气泡。
                                        </span>
                                    </p>
                                    <div className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500 text-white shrink-0"><svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>
                                        自动应用最优参数，旧版规则类功能已静默挂起
                                    </div>
                                </div>"""

replace_block = """                                        <span className="flex items-center gap-2 mt-1.5">
                                            <svg className="w-3 h-3 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            实时高亮时态、单复数错误并提供纠正气泡。
                                        </span>
                                    </p>
                                    
                                    {/* NLP Parameters Segment */}
                                    <div className="mt-6 flex flex-col gap-3 text-left">
                                        {/* Morph UI Toggle */}
                                        <div className="flex items-center justify-between border border-indigo-200/60 dark:border-indigo-800/60 bg-white/40 dark:bg-black/20 p-3 rounded-xl">
                                            <div>
                                                <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">形态对齐提示 (Morphology Bubble)</h4>
                                                <p className="text-xs text-indigo-700/70 dark:text-indigo-400/70 mt-0.5">当检测到时态/复数偏差时，在光标旁显示智能纠错气泡。</p>
                                            </div>
                                            <label className="relative inline-flex cursor-pointer items-center shrink-0 ml-4">
                                                <input type="checkbox" className="peer sr-only" checked={nlpShowMorphologyUI} onChange={(e) => setNlpShowMorphologyUI(e.target.checked)} />
                                                <div className="peer h-6 w-11 rounded-full bg-indigo-200/50 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-indigo-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-indigo-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none dark:bg-indigo-900/40 dark:after:border-indigo-700"></div>
                                            </label>
                                        </div>

                                        {/* Waterfall Depth */}
                                        <div className="flex items-center justify-between border border-indigo-200/60 dark:border-indigo-800/60 bg-white/40 dark:bg-black/20 p-3 rounded-xl">
                                            <div>
                                                <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200">瀑流补全深度 (Waterfall Depth)</h4>
                                                <p className="text-xs text-indigo-700/70 dark:text-indigo-400/70 mt-0.5">触发自动接力时，预填充的词汇延展长度 (当前 {nlpWaterfallDepth} 词)。</p>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 ml-4 bg-indigo-100/50 dark:bg-indigo-900/40 p-1 rounded-lg">
                                                {[1, 2, 3, 4].map((num) => (
                                                    <button
                                                        key={num}
                                                        onClick={() => setNlpWaterfallDepth(num)}
                                                        className={`h-7 w-7 rounded-md text-sm font-bold transition-all ${
                                                            nlpWaterfallDepth === num 
                                                            ? 'bg-indigo-500 text-white shadow-sm' 
                                                            : 'text-indigo-600/70 hover:bg-indigo-200/50 dark:text-indigo-400 dark:hover:bg-indigo-800/50'
                                                        }`}
                                                    >
                                                        {num}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>"""

text = text.replace(find_block, replace_block)

with open("src/components/vocab/GhostSettingsModal.tsx", "w", encoding="utf-8") as f:
    f.write(text)

