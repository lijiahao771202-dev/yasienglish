import re

with open("src/components/vocab/GhostSettingsModal.tsx", "r", encoding="utf-8") as f:
    text = f.read()

# 1. Extract Algorithm Mode Block
# It starts at: {/* Algorithm Mode */}
# and ends right before: {/* Fuzzy Tolerance */}
algo_start = text.find("{/* Algorithm Mode */}")
fuzzy_start = text.find("{/* Fuzzy Tolerance */}")

algorithm_mode_code = text[algo_start:fuzzy_start]

# 2. Remove it from its original place
new_text = text[:algo_start] + text[fuzzy_start:]

# 3. Find the beginning of the container
container_start = new_text.find('<div className="space-y-6 overflow-y-auto p-6 pt-2">')
if container_start == -1:
    print("Container not found!")
    exit(1)

# Find where to insert (after the opening tag of the container)
insert_pos = container_start + len('<div className="space-y-6 overflow-y-auto p-6 pt-2">') + 1

nlp_ui = """
                            {algorithmMode === 'nlp' ? (
                                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-6 dark:border-indigo-800/50 dark:bg-indigo-900/10 text-center animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300">
                                    <div className="w-16 h-16 mx-auto bg-indigo-100/80 text-indigo-500 rounded-2xl flex items-center justify-center mb-5 border border-indigo-200 shadow-sm dark:bg-indigo-900/50 dark:border-indigo-700/50 dark:text-indigo-400 rotate-3">
                                        <span className="text-3xl -rotate-3">🧬</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 mb-3">NLP 语法智能核心</h3>
                                    <p className="text-[13px] text-indigo-600/90 dark:text-indigo-300/90 leading-relaxed mb-6 text-left bg-white/50 dark:bg-black/20 p-4 rounded-xl border border-indigo-100/50 dark:border-white/5">
                                        基于 <strong>Compromise.js</strong> 构建的超轻量形态分析树。
                                        能够在毫秒级比对输入文本与参考答案。
                                        <br/><br/>
                                        <span className="flex items-center gap-2 mt-1">
                                            <svg className="w-3 h-3 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            极简纯粹，不带有任何强制覆盖和延迟判定。
                                        </span>
                                        <span className="flex items-center gap-2 mt-1.5">
                                            <svg className="w-3 h-3 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            实时高亮时态、单复数错误并提供纠正气泡。
                                        </span>
                                    </p>
                                    <div className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500 text-white shrink-0"><svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></span>
                                        自动应用最优参数，旧版规则类功能已静默挂起
                                    </div>
                                </div>
                            ) : (
                                <>
"""

# Modify the algorithm mode code to be wrapped inside a stylized block maybe? 
# Wait, algorithm mode is already styled well. Let's just wrap it. 
# actually algorithm mode code had a bottom border: 'border-b border-stone-200 pb-4'
# Let's remove that border so it looks like a standalone card when pulled out
algo_mode_modified = algorithm_mode_code.replace('border-b border-stone-200 pb-4 dark:border-stone-700', 'rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-800/50')

# assemble part 1
new_text = new_text[:insert_pos] + '\n' + algo_mode_modified + nlp_ui + new_text[insert_pos:]

# 4. Find the end of the container to close the `)`
# The container ends at:
#                                 </div>
#                             </div>
#                         </div>
# 
#                     </motion.div>
# We want to close before the last </div> before motion.div
end_pos = new_text.rfind('                        </div>\n\n                    </motion.div>')

if end_pos == -1:
    print("End container not found")
    exit(1)

new_text = new_text[:end_pos] + "                                </>\n                            )}\n" + new_text[end_pos:]

with open("src/components/vocab/GhostSettingsModal.tsx", "w", encoding="utf-8") as f:
    f.write(new_text)

print("Settings modal refactored!")
