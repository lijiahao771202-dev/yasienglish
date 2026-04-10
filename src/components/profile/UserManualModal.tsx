"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, BookOpen, CalendarCheck, BookType, Headphones, BrainCircuit, Swords } from "lucide-react";

interface UserManualModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const MANUAL_SECTIONS = [
    {
        id: "overview",
        icon: BookOpen,
        title: "初识 Yasi",
        subtitle: "降维打击系统",
        content: () => (
            <div className="flex flex-col gap-5">
                <div className="bg-indigo-50 border-[3px] border-indigo-200 rounded-[1.2rem] p-5">
                    <h3 className="text-xl font-black text-indigo-900 mb-2">欢迎来到次世代的语言掌控终端</h3>
                    <p className="text-[14px] text-indigo-800/80 leading-relaxed font-medium">
                        Yasi 不是一款传统的背单词软件，也不是一款无聊的阅读器。它是一个以全息语言流（Reading, Listening, Vocabulary, Battle）为核心的智能神经元手术刀。在这里，我们痛恨低效的死记硬背与粗制滥造的教条。通过动态机器学习（FSRS）引擎，我们将你的语言习得效率拔高到了指数级逃逸速度。
                    </p>
                </div>

                <div className="flex flex-col gap-3 mt-2">
                    <h4 className="font-bold text-[16px] text-theme-text border-b-[3px] border-theme-border pb-2 mb-1">💡 核心工作流设计准则</h4>
                    
                    <div className="bg-theme-card-bg border-[3px] border-theme-border shadow-[0_4px_0_0_var(--theme-shadow)] rounded-[1.2rem] p-4 flex gap-4 items-start">
                        <div className="h-10 w-10 shrink-0 bg-yellow-100 text-yellow-600 border-2 border-yellow-200 rounded-full flex items-center justify-center font-black text-lg">1</div>
                        <div>
                            <h5 className="font-bold text-[15px] mb-1">拒绝沙盒孤岛 (No Sandbox)</h5>
                            <p className="text-[13px] text-theme-text-muted leading-relaxed">语言不该是孤立的词汇表。在 Yasi，你可以在阅读（Reading）和听力（Listening Cabin）的真实语境中发现生词，并一键无缝抓取进你的个人引擎中，实现所见即所得。</p>
                        </div>
                    </div>

                    <div className="bg-theme-card-bg border-[3px] border-theme-border shadow-[0_4px_0_0_var(--theme-shadow)] rounded-[1.2rem] p-4 flex gap-4 items-start">
                        <div className="h-10 w-10 shrink-0 bg-emerald-100 text-emerald-600 border-2 border-emerald-200 rounded-full flex items-center justify-center font-black text-lg">2</div>
                        <div>
                            <h5 className="font-bold text-[15px] mb-1">极度克制的认知负荷 (Cognitive Load Control)</h5>
                            <p className="text-[13px] text-theme-text-muted leading-relaxed">绝不允许复习你早就烂熟于心的东西。我们的底层算法会通过贝叶斯模型精准踩中你的遗忘点。如果某样东西你认识，请霸道地按下「简单」，把它永远踢出你宝贵的“短时工作记忆池”。</p>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: "daily-plan",
        icon: CalendarCheck,
        title: "每日日课",
        subtitle: "任务调度中心",
        content: () => (
            <div className="flex flex-col gap-5">
                <div className="flex items-center gap-3 bg-theme-base-bg border-[3px] border-theme-border/50 p-4 rounded-[1.2rem]">
                    <div className="bg-blue-100 text-blue-600 h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border-[3px] border-blue-200"><CalendarCheck /></div>
                    <div>
                        <h4 className="font-black text-[16px]">智能今日清单</h4>
                        <p className="text-[13px] text-theme-text-muted mt-0.5">你的超级仪表盘。不用纠结今天要做什么，主页早就帮你排好了最优解。</p>
                    </div>
                </div>
                
                <div className="bg-theme-card-bg border-[3px] border-theme-border rounded-[1.2rem] p-5">
                    <ul className="space-y-4">
                        <li className="flex gap-3">
                            <span className="text-xl">☀️</span>
                            <div>
                                <strong className="text-[14px] block mb-0.5">晨雾行动（碎片时间追踪）</strong>
                                <span className="text-[13px] text-theme-text-muted leading-relaxed">主页顶部的状态栏会实时展现今日待复习生词和各项进度。你不需要定闹钟，只需要每天打开 Yasi 遵循这道引导即可。</span>
                            </div>
                        </li>
                        <li className="flex gap-3">
                            <span className="text-xl">✅</span>
                            <div>
                                <strong className="text-[14px] block mb-0.5">三项打卡（金字塔闭环）</strong>
                                <span className="text-[13px] text-theme-text-muted leading-relaxed">日课的极境是平衡。每天我们建议您完成「一局生死战（Battle）」「一篇沉浸阅读」和「一次深核复习」。全部点亮后，会拥有特殊的成就反馈。</span>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: "reading",
        icon: BookType,
        title: "沉浸阅读",
        subtitle: "CAT 互动解码",
        content: () => (
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 bg-rose-50 border-[3px] border-rose-200 rounded-[1.2rem] p-5">
                    <h3 className="text-[16px] font-black text-rose-900 border-b-2 border-rose-200/50 pb-2">告别走马观花式的浅阅读</h3>
                    <p className="text-[13px] text-rose-800 leading-relaxed font-medium">
                        Yasi 的阅读器采用最高规格的结构解析引擎（AI Studio）。文章不是一大段生冷死板的乱码，而是一层一层可展开的 <b>CAT (Computer Adaptive Training)</b> 互动长城。
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-theme-card-bg border-[3px] border-theme-border rounded-xl p-4 shadow-[0_4px_0_0_var(--theme-shadow)]">
                        <h4 className="font-bold text-[14px] flex items-center gap-1.5"><span className="text-lg">🎯</span> 精读解剖</h4>
                        <p className="mt-2 text-[12px] text-theme-text-muted leading-relaxed">
                            遇到读不懂的长难句？直接启动 AI 翻译器，为您抽丝剥茧分析语法树，提炼核心主谓宾短语。不懂哪里点哪里。
                        </p>
                    </div>
                    <div className="bg-theme-card-bg border-[3px] border-theme-border rounded-xl p-4 shadow-[0_4px_0_0_var(--theme-shadow)]">
                        <h4 className="font-bold text-[14px] flex items-center gap-1.5"><span className="text-lg">🎣</span> 捕获生词</h4>
                        <p className="mt-2 text-[12px] text-theme-text-muted leading-relaxed">
                            长按或点击任何生词，一键查看深度图文释义，并能瞬间收录到您的 Vocab 生词本中，作为 FSRS 的养料。这正是“从自然语境中获取资源”的绝佳典范。
                        </p>
                    </div>
                </div>

                <div className="bg-emerald-50 border-[3px] border-emerald-200 rounded-[1.2rem] p-4 text-emerald-900">
                    <h4 className="font-bold text-[14px]">🏁 文章精研重塑评价</h4>
                    <p className="mt-1.5 text-[13px] leading-relaxed opacity-90">
                        每次啃完一篇文章，不要急着关掉。利用底部的「自我评估模块」：太简单？刚好？太硬核？您的每一次点击，都在帮助系统更精准地为您下发明日推荐流。
                    </p>
                </div>
            </div>
        )
    },
    {
        id: "listening",
        icon: Headphones,
        title: "听力魔方",
        subtitle: "纯粹的声学实验",
        content: () => (
            <div className="flex flex-col gap-4">
                <div className="bg-theme-card-bg border-[3px] border-theme-border shadow-[0_4px_0_0_var(--theme-shadow)] rounded-[1.2rem] p-5">
                    <h3 className="font-black text-xl mb-3">极致掌控声音细节</h3>
                    <p className="text-[13px] text-theme-text-muted leading-relaxed mb-4">
                        听力魔方（Listening Cabin）将最前沿的语音合成引擎与磁带机体验融为一体。为泛听（盲听）和精听（逐句跟读）打造了手术级别的精细操作台。
                    </p>

                    <div className="space-y-3">
                        <div className="flex items-start gap-3 bg-theme-base-bg p-3 rounded-lg border-2 border-theme-border/30">
                            <span className="font-bold bg-theme-text text-theme-base-bg px-2 py-0.5 rounded-[0.4rem] text-[12px] shrink-0 mt-0.5">悬浮提词器</span>
                            <span className="text-[13px] text-theme-text/90">不用再在一堆英文里找你听到哪了。极其丝滑的逐句高亮滚动条，保证你的眼睛和耳朵物理同轨。</span>
                        </div>
                        <div className="flex items-start gap-3 bg-theme-base-bg p-3 rounded-lg border-2 border-theme-border/30">
                            <span className="font-bold bg-theme-text text-theme-base-bg px-2 py-0.5 rounded-[0.4rem] text-[12px] shrink-0 mt-0.5">盲盒发言人</span>
                            <span className="text-[13px] text-theme-text/90">在右上角头像菜单中设置【动态随机发言人】，系统会不停变幻口音来锤炼你的听力泛化能力。</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: "vocab",
        icon: BrainCircuit,
        title: "生词引擎",
        subtitle: "FSRS 降维打击",
        content: () => (
            <div className="flex flex-col gap-4">
                <div className="bg-theme-card-bg border-[3px] border-theme-border rounded-[1.2rem] p-5">
                    <div className="text-[12px] md:text-[13px] text-theme-text leading-relaxed bg-indigo-500/10 border-l-[4px] border-indigo-500 p-3 rounded-r-xl mb-4">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">📐 算法底层硬核推演：</span> 
                        <span className="text-theme-text-muted opacity-90">FSRS 的核心是用抽象的 DSR 时序偏微分方程去拟合大脑。当你在复习时做出选择，系统会提取真实反馈，利用梯度下降法（Gradient Descent）不断修正专属记忆衰退曲线。彻底告别静态的“艾宾浩斯测表”。</span>
                    </div>

                    <div className="flex flex-col gap-2.5">
                        <div className="font-bold text-[13px] text-theme-text/80 mb-0.5 pl-1 flex items-center gap-2">
                            三维核心追踪参量
                            <div className="h-px flex-1 bg-theme-border/30"></div>
                        </div>
                        
                        <div className="flex gap-3 bg-theme-base-bg border-2 border-theme-border/20 rounded-xl p-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[13px]">🏃</div>
                            <div className="flex flex-col gap-0.5">
                                <h4 className="font-bold text-[13px] text-theme-text">R: 维持度 (Retrievability)</h4>
                                <span className="text-[12px] text-theme-text-muted leading-tight">精准测算遗忘率，只在 R 跌落到你“将忘未忘”的濒死阈值时才让你复习。</span>
                            </div>
                        </div>

                        <div className="flex gap-3 bg-theme-base-bg border-2 border-theme-border/20 rounded-xl p-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-[13px]">⚓️</div>
                            <div className="flex flex-col gap-0.5">
                                <h4 className="font-bold text-[13px] text-theme-text">S: 稳定性 (Stability)</h4>
                                <span className="text-[12px] text-theme-text-muted leading-tight">点击“简单”立刻触发质变，下一次复习呈指数级飞跃推迟。</span>
                            </div>
                        </div>

                        <div className="flex gap-3 bg-theme-base-bg border-2 border-theme-border/20 rounded-xl p-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 text-[13px]">⛰️</div>
                            <div className="flex flex-col gap-0.5">
                                <h4 className="font-bold text-[13px] text-theme-text">D: 困难度 (Difficulty)</h4>
                                <span className="text-[12px] text-theme-text-muted leading-tight">对标“难”的孤岛，拉高内部 D 值频密刺激工作记忆，直至重新攻克。</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: "battle",
        icon: Swords,
        title: "竞技对战",
        subtitle: "PvP 肌肉反应",
        content: () => (
            <div className="flex flex-col gap-4 h-full">
                <div className="bg-slate-900 border-[3px] border-theme-border rounded-[1.2rem] p-5 text-white flex-1 flex flex-col justify-center overflow-hidden relative">
                    <div className="absolute right-0 top-0 opacity-10 blur-xl">
                        <Swords className="h-64 w-64 -rotate-12 translate-x-12 -translate-y-8" />
                    </div>
                    
                    <div className="relative z-10">
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#334155] bg-[#1e293b] px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-[#94a3b8] mb-3">
                            Extreme Reaction Arena
                        </span>
                        <h3 className="font-black text-2xl tracking-tight text-white mb-2">检验语感的唯一终极法庭</h3>
                        <p className="text-[13px] text-[#94a3b8] leading-relaxed mb-5">
                            抛弃那种盯着单词发呆三分钟才想起来意思的伪学习体验。在 Battle 竞技场，系统只认你的“毫秒级神经干预时间”。
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-[#1e293b]/80 border-[2px] border-[#334155] rounded-xl p-3">
                                <h4 className="font-bold text-[#e2e8f0] text-[14px]">🔥 秒杀连击</h4>
                                <p className="text-[11px] text-[#94a3b8] mt-1 line-clamp-2">只有在读秒倒计时内斩获四杀（四个选项），你才能登顶胜利王座，磨炼纯靠直觉的变态语感。</p>
                            </div>
                            <div className="bg-[#1e293b]/80 border-[2px] border-[#334155] rounded-xl p-3">
                                <h4 className="font-bold text-[#e2e8f0] text-[14px]">💀 残酷降调</h4>
                                <p className="text-[11px] text-[#94a3b8] mt-1 line-clamp-2">不要瞎蒙！答错将遭受剧烈惩罚，并会严重影响该词汇在底层 FSRS 库中的稳定性判定。</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
];

export function UserManualModal({ isOpen, onClose }: UserManualModalProps) {
    const [activeTab, setActiveTab] = useState(MANUAL_SECTIONS[0].id);

    const ActiveContent = MANUAL_SECTIONS.find(s => s.id === activeTab)?.content;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
                    animate={{ opacity: 1, backdropFilter: "blur(12px)" }}
                    exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="软件指南"
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-3 sm:p-5 md:p-8 overflow-hidden"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 30 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 30 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        className="relative flex w-full max-w-5xl h-[85vh] md:h-[75vh] flex-col md:flex-row overflow-hidden rounded-[2rem] border-4 border-theme-border bg-theme-base-bg shadow-[0_16px_40px_rgba(30,27,75,0.4)]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {/* Close Button (Absolute Top Right) */}
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute right-4 top-4 z-[999] flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-theme-border bg-theme-active-bg text-theme-text shadow-[0_4px_0_0_var(--theme-shadow)] transition-transform hover:-translate-y-0.5"
                            aria-label="关闭指南"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        {/* Sidebar Navigation */}
                        <div className="w-full md:w-[280px] shrink-0 bg-theme-card-bg border-b-4 md:border-b-0 md:border-r-4 border-theme-border flex flex-col p-4 md:p-5">
                            <div className="flex items-center gap-3 mb-6 px-1 mt-1">
                                <div className="h-10 w-10 rounded-xl bg-theme-text text-theme-base-bg flex items-center justify-center font-black shadow-[0_4px_0_0_var(--theme-shadow)] border-2 border-theme-border flex-shrink-0">
                                    <BookOpen className="h-5 w-5" />
                                </div>
                                <div>
                                    <h2 className="font-black tracking-tight text-xl text-theme-text">软件指南</h2>
                                    <div className="text-[10px] font-bold text-theme-text-muted uppercase tracking-widest mt-0.5">Yasi Manual V1</div>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto custom-scrollbar flex md:flex-col gap-2 -mx-2 px-2 pb-2 md:-mx-0 md:px-0 md:pb-0">
                                {MANUAL_SECTIONS.map((section) => {
                                    const isActive = activeTab === section.id;
                                    const Icon = section.icon;
                                    return (
                                        <button
                                            key={section.id}
                                            onClick={() => setActiveTab(section.id)}
                                            className={`
                                                relative flex items-center md:items-start gap-3 p-3 rounded-[1rem] border-2 transition-all text-left flex-shrink-0 min-w-[160px] md:min-w-0 md:w-full
                                                ${isActive 
                                                    ? 'bg-theme-active-bg border-theme-border shadow-[0_4px_0_0_var(--theme-shadow)] -translate-y-[2px]' 
                                                    : 'bg-transparent border-transparent hover:bg-theme-card-bg hover:border-theme-border/30 text-theme-text-muted hover:text-theme-text'}
                                            `}
                                        >
                                            <div className={`mt-0.5 p-1.5 rounded-lg border-2 ${isActive ? 'bg-theme-base-bg border-theme-border text-theme-text' : 'bg-transparent border-transparent text-inherit'}`}>
                                                <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.5 : 2} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className={`font-black text-[14px] ${isActive ? 'text-theme-text' : 'text-inherit'}`}>{section.title}</span>
                                                <span className={`text-[11px] font-bold tracking-wide ${isActive ? 'text-theme-text/70' : 'text-inherit opacity-70'} hidden md:block mt-0.5`}>{section.subtitle}</span>
                                            </div>
                                            {isActive && (
                                                <motion.div layoutId="manual-indicator" className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-theme-text hidden md:block" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Main Content Area */}
                        <div className="flex-1 bg-theme-base-bg flex flex-col min-h-0 overflow-hidden relative">
                            {/* Inner Title Header */}
                            <div className="px-6 md:px-10 pt-8 pb-4 shrink-0 border-b-[3px] border-theme-border/20 mt-8 md:mt-0">
                                {MANUAL_SECTIONS.map((section) => section.id === activeTab && (
                                    <motion.div 
                                        key={`title-${section.id}`}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="flex flex-col"
                                    >
                                        <div className="text-[11px] font-black uppercase text-theme-text-muted tracking-[0.2em] mb-1">{section.subtitle}</div>
                                        <h2 className="font-black text-2xl md:text-3xl tracking-tight text-theme-text">{section.title}</h2>
                                    </motion.div>
                                ))}
                            </div>

                            {/* Scrollable Content Pane */}
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 relative">
                                <AnimatePresence mode="wait">
                                    {MANUAL_SECTIONS.map((section) => section.id === activeTab && (
                                        <motion.div
                                            key={`content-${section.id}`}
                                            initial={{ opacity: 0, y: 15 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -15 }}
                                            transition={{ duration: 0.15 }}
                                        >
                                            {ActiveContent && <ActiveContent />}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                <div className="h-12 w-full shrink-0" /> {/* Bottom breathing room */}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
