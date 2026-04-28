import re

file_path = "src/components/vocab/GhostTextarea.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update GhostTextareaProps
props_old = """    aiCoachTip?: { 
        text: string; 
        type: 'scaffold' | 'polish';
        errorWord?: string;
        fixWord?: string;
        backtrans?: string;
        bandScore?: string;
        errorTags?: string[];
    } | null;"""

props_new = """    aiCoachTip?: { 
        text: string; 
        type: 'scaffold' | 'polish';
        errorWord?: string;
        fixWord?: string;
        backtrans?: string;
        bandScore?: string;
        errorTags?: string[];
        vocabCard?: string;
        grammarTree?: string;
        chalkboard?: string;
    } | null;"""

content = content.replace(props_old, props_new)

# 2. Add Imports
imports_idx = content.find("export const CoachErrorMark")
imports_insert = """import { ChalkboardUI } from '@/components/drill/AiTeacherConversation';

const VocabCardUI = ({ parts }: { parts: string[] }) => {
    const [word, meaning, collocation] = parts.length >= 3 ? parts : [parts[0], parts[1] || '', parts[2] || ''];
    return (
        <div className="mt-2 mb-1 p-3 rounded-[0.85rem] bg-gradient-to-br from-white/95 to-slate-50/90 border border-slate-200/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] backdrop-blur-md relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="flex justify-between items-start mb-1.5">
                <span className="font-serif text-[15px] font-bold text-slate-800 tracking-wide drop-shadow-sm">{word}</span>
                <span className="px-2 py-0.5 mt-0.5 rounded-[4px] bg-emerald-50/80 border border-emerald-200/80 text-[9px] font-bold text-emerald-600 uppercase tracking-[0.15em] shadow-sm">Vocab</span>
            </div>
            <p className="text-slate-600 text-[12px] font-medium leading-relaxed mb-2.5">{meaning}</p>
            {collocation && (
                <div className="pt-2 border-t border-slate-100/80 relative">
                    <div className="absolute top-0 left-4 -mt-px w-8 h-px bg-emerald-400/40" />
                    <p className="text-[11px] font-mono text-emerald-700/90 bg-emerald-50/50 p-2 rounded-md border border-emerald-100/50 leading-relaxed shadow-inner">
                        <span className="font-bold text-emerald-600/60 block mb-0.5 select-none uppercase text-[9px] tracking-wider">Collocation</span>
                        {collocation}
                    </p>
                </div>
            )}
        </div>
    );
};

const GrammarTreeUI = ({ structure }: { structure: string }) => {
    const nodes = structure.split(/(?:->|→)/).map(s => s.trim()).filter(Boolean);
    return (
        <div className="mt-2 mb-1 p-3.5 rounded-[0.85rem] bg-[#1a1b1e] border border-slate-700/60 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-2 opacity-20 select-none pointer-events-none">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><path d="M12 2v20"/><path d="M12 7l-5 5"/><path d="M12 12l5 5"/></svg>
            </div>
            <div className="flex flex-col gap-2 relative z-10 w-full pl-1">
                {nodes.map((node, i) => (
                    <div key={i} className="flex flex-col pt-0.5">
                        <div className="flex items-center gap-2.5 mb-1">
                            <div className="opacity-90">
                                {i === 0 ? (
                                    <div className="w-4 h-4 rounded-full bg-indigo-500/20 border border-indigo-400/50 flex items-center justify-center shadow-[0_0_8px_rgba(99,102,241,0.3)]">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_4px_rgba(99,102,241,0.8)]"></div>
                                    </div>
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-[4px] bg-emerald-500/10 border border-emerald-500/30 font-bold text-[9px] flex items-center justify-center text-emerald-400 shadow-sm" style={{ marginLeft: i * 10 }}>
                                        {i+1}
                                    </div>
                                )}
                            </div>
                            <span className="font-medium text-slate-100 text-[11.5px] leading-tight flex-1 break-words pb-0.5 border-b border-white/5 inline-block">
                                {node}
                            </span>
                        </div>
                        {i < nodes.length - 1 && (
                            <div className="w-px h-3 bg-gradient-to-b from-indigo-500/30 to-emerald-500/30 ml-[7px] mb-0.5" style={{ marginLeft: i === 0 ? 7 : (i * 10 + 6) }}></div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

"""
content = content[:imports_idx] + imports_insert + content[imports_idx:]

# 3. Add to UI tree
ai_coach_ui_old = """                                    {aiCoachTip.backtrans && (
                                        <div className="mt-1 p-2 rounded-lg bg-red-50/80 border border-red-100 italic text-red-800/90 text-xs shadow-inner">
                                            “外国人听到的原意可能是：{aiCoachTip.backtrans}”
                                        </div>
                                    )}"""

ai_coach_ui_new = """                                    {aiCoachTip.backtrans && (
                                        <div className="mt-1 p-2 rounded-lg bg-red-50/80 border border-red-100 italic text-red-800/90 text-[11.5px] shadow-inner font-bold">
                                            “外国人听到的原意可能是：{aiCoachTip.backtrans}”
                                        </div>
                                    )}
                                    
                                    {aiCoachTip.vocabCard && (
                                        <VocabCardUI parts={aiCoachTip.vocabCard.split('|').map(s => s.trim())} />
                                    )}
                                    
                                    {aiCoachTip.grammarTree && (
                                        <GrammarTreeUI structure={aiCoachTip.grammarTree} />
                                    )}
                                    
                                    {aiCoachTip.chalkboard && (
                                        <div className="[&>div]:my-2 scale-95 origin-top-left w-[105%]">
                                            <ChalkboardUI content={aiCoachTip.chalkboard} />
                                        </div>
                                    )}"""

content = content.replace(ai_coach_ui_old, ai_coach_ui_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated GhostTextarea.tsx")
