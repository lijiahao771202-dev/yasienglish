"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight } from "lucide-react";

import { StepPitchIntro } from "./steps/StepPitchIntro";
import { StepPitchPain1_Island } from "./steps/StepPitchPain1_Island";
import { StepPitchPain2_Grammar } from "./steps/StepPitchPain2_Grammar";
import { StepPitchPain3_Deaf } from "./steps/StepPitchPain3_Deaf";
import { StepPitchPain4_Comfort } from "./steps/StepPitchPain4_Comfort";
import { StepPitchPain5_Willpower } from "./steps/StepPitchPain5_Willpower";
import { StepPitchPhilosophy_Pivot } from "./steps/StepPitchPhilosophy_Pivot";
import { StepPitchPhilosophy_Flow } from "./steps/StepPitchPhilosophy_Flow";
import { StepPitchFeature_Reading } from "./steps/StepPitchFeature_Reading";
import { StepPitchFeature_Syntax } from "./steps/StepPitchFeature_Syntax";
import { StepPitchFeature_Cabin } from "./steps/StepPitchFeature_Cabin";
import { StepPitchFeature_Voices } from "./steps/StepPitchFeature_Voices";
import { StepPitchFeature_ZPD } from "./steps/StepPitchFeature_ZPD";
import { StepPitchFeature_FSRS } from "./steps/StepPitchFeature_FSRS";
import { StepPitchFeature_CAT } from "./steps/StepPitchFeature_CAT";
import { StepPitchFeature_Scheduling } from "./steps/StepPitchFeature_Scheduling";
import { StepPitchFeature_Feedback } from "./steps/StepPitchFeature_Feedback";
import { StepPitchPhilosophy_Mute } from "./steps/StepPitchPhilosophy_Mute";
import { StepPitchProof } from "./steps/StepPitchProof";
import { StepPaywall } from "./steps/StepPaywall"; 
import { StepPitchFeature_Elo } from "./steps/StepPitchFeature_Elo";
import { StepPitchFeature_Topics } from "./steps/StepPitchFeature_Topics";
import { StepPitchFeature_Vocab } from "./steps/StepPitchFeature_Vocab";
import { requestTtsSegmentsPayload } from "@/lib/tts-client";

interface OnboardingWizardProps {
    onClose: () => void;
    onStartTrial: (planId: string) => void;
}

const TOTAL_STEPS = 23;
export const LUXURY_MOTION = { ease: [0.22, 1, 0.36, 1] as const };

export function OnboardingWizard({ onClose, onStartTrial }: OnboardingWizardProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [showCloseButton, setShowCloseButton] = useState(false);

    const bgmRef = React.useRef<HTMLAudioElement | null>(null);

    // Mount Cheerful Light Background Music
    useEffect(() => {
        const bgm = new Audio("/bgm_piano.mp3");
        bgm.loop = true;
        bgm.volume = 0; // Fade in slowly
        bgmRef.current = bgm;

        const tryPlay = () => {
            bgm.play().catch(() => {});
        };

        let vol = 0;
        const fadeInterval = setInterval(() => {
            vol = Math.min(0.20, vol + 0.02); // Max 20% volume
            if (bgmRef.current) bgmRef.current.volume = vol;
            if (vol >= 0.20) clearInterval(fadeInterval);
        }, 300);

        // Attempt immediately
        tryPlay();

        document.addEventListener('click', tryPlay);
        document.addEventListener('keydown', tryPlay);

        return () => {
            document.removeEventListener('click', tryPlay);
            document.removeEventListener('keydown', tryPlay);
            clearInterval(fadeInterval);
            bgm.pause();
            bgm.currentTime = 0;
            bgmRef.current = null;
        };
    }, []);

    const NARRATOR_SCRIPT: { voice: string; text: string }[][] = [
        // 0 Intro (Xiaoxiao + Andrew)
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "欢迎来到 Yasi。请先深呼吸，这将是你认知历史上最重要的一场重构。在接下来的几分钟里，我们将彻底推翻你过去对语言学习所有的刻板幻觉。" },
            { voice: "en-US-AndrewNeural", text: "Forget everything you have been told. This is not a classroom, this is the absolute frontier of cognitive training." }
        ],
        // 1 Pain Island
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "仔细回想，为什么有些单词你背了十年，到了真实场景依然形同陌路？因为背诵孤立的单词根本毫无意义。没有织成上下文网络的孤岛记忆，注定会被物理规律无情抹去。" }
        ],
        // 2 Pain Grammar
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "你可能把枯燥的语法规则背得滚瓜烂熟。但在面对长难句时，第一反应竟然还是在脑子里默默翻译。这种本能的滞后，是你永远无法达到直觉阅读的终极死穴。" }
        ],
        // 3 Pain Deaf
        [
            { voice: "zh-CN-XiaoyiNeural", text: "你的卷面听力或许拿了高分，但这只是一场虚假的繁荣。面对真实生活里充满连读、底噪和惊人语速的对话，你瞬间失聪。刻意放慢的廉价语料全都是在骗你。" }
        ],
        // 4 Pain Comfort
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "最悲哀的是，你的脑海里存了上万个高级单词。但需要开口的一瞬间，崩出来的只有那寥寥几个干瘪的基础词汇。你的语言边界，早就被死死困在了这座安全牢笼里。" }
        ],
        // 5 Pain Willpower
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "而市面上的背词软件却正像吸血鬼一样压榨你。为了虚拟的金币和并不存在的连胜，把你逼成了机械的打卡工。你的意志力正在被一点点掏空，直到崩溃。" }
        ],
        // 6 Philosophy Pivot 
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "让这一切停下吧。请认清残酷的事实：语言，从人类文明诞生之初，就从来不是通过刻意做题被『学会』的。那是对人类智力进化的背叛。" }
        ],
        // 7 Philosophy Mute (Xiaoyi + Ava)
        [
            { voice: "zh-CN-XiaoyiNeural", text: "高分应试只能是副产品。我们要用最残暴的极致语境，完全终结哑巴英语。把外语强行植入你的潜意识边缘，让它化作你如臂使指的全新本能。" },
            { voice: "en-US-AvaMultilingualNeural", text: "You don't study a language to master it. You allow it to infiltrate your subconscious through overpowering immersion." }
        ],
        // 8 Philosophy Flow
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "试想一下，如果你像看好莱坞星际大片那样，被高潮迭起的故事情节死死抓住，你还会觉得学习是一场苦役吗？忘掉课本！当你被心流包裹，这本身就是多巴胺飙升的狂欢。" }
        ],
        // 9 Feature Topics
        [
            { voice: "zh-CN-XiaoyiNeural", text: "传统的『去超市买苹果』的家庭对话永远无法让你分泌多巴胺。我们的全局主题流涵盖了全球几万个高维前沿领域，从量子生物学到赛博朋克。用母语级的猎奇心去漫游，才是高强度输入的前提。" }
        ],
        // 10 Feature Reading
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "不要再去全网盲目搜划素材了。核心矩阵 AI 会像全球情报网一样，全天候实时探测你的能力天花板与知识边界。它每天都会凭空为你捏造出一篇完美覆盖认知盲区的定制高级别文章。" }
        ],
        // 11 Feature Syntax
        [
            { voice: "zh-CN-XiaoyiNeural", text: "哪怕在极其复杂的长难句迷宫中迷失了，也不用慌张。只要轻轻点击屏幕，全知视角的词法扫描引擎会瞬间降维，把极度复杂的主谓宾骨架，像高精度全息投影一样直接在你的视网膜上展开拉伸。" }
        ],
        // 12 Feature Vocab
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "绝对禁止你再次端着干瘪的中英对照表去背单词。核心系统会强迫你在鲜活涌动的文章里偶遇生词，通过极其庞大的上下文连结锚点，硬性建构母语者的原生直觉！" }
        ],
        // 13 Feature Cabin (Xiaoyi + Emma)
        [
            { voice: "zh-CN-XiaoyiNeural", text: "现在请务必戴上耳机。Yasi 的听力舱，绝非毫无生机的单人机器播报。我们将长篇自然素材直接丢给上百位数字生命，在真实语境中进行多角色、跨口音的无缝接力交锋！" },
            { voice: "en-US-EmmaMultilingualNeural", text: "Imagine diverse personas seamlessly passing the baton, bringing dense texts incredibly to life with breathtaking cadence." }
        ],
        // 14 Feature Voices
        [
            { voice: "en-US-ChristopherNeural", text: "System calibrated. The American acoustic model is now fully engaged. ... " },
            { voice: "en-GB-SoniaNeural", text: "Switching nodes. British pronunciation matrix is online and tracking. ... " },
            { voice: "en-AU-WilliamNeural", text: "Routing through Sydney. Our Australian dialect protocol is active. ... " },
            { voice: "en-IE-ConnorNeural", text: "Irish module connected. Adjusting voice frequency for local variations. ... " },
            { voice: "en-ZA-LukeNeural", text: "South African stream established. Preparing the engine for chaotic input. ... " },
            { voice: "en-IN-NeerjaNeural", text: "Indian neural matrix synchronized. Acoustic recognition thresholds have been set. ... " },
            { voice: "en-CA-ClaraNeural", text: "Canadian target locked. Environmental background noise filters are applied. ... " },
            { voice: "en-NZ-MitchellNeural", text: "New Zealand protocol running. Global immersion sequence is now complete. ... " },
            { voice: "zh-CN-XiaoxiaoNeural", text: "发现了吗？只听懂一种发音毫无实战价值。系统随机突变极其多样的全链路口音，为你生硬淬炼出无坚不摧的绝对实战听力！" }
        ],
        // 15 Feature Elo
        [
            { voice: "zh-CN-XiaoyiNeural", text: "而在 Yasi，针对高门槛单词的每一次斩杀或是退缩，底层都会进行极其严密的隐藏分数计算。这绝不仅仅是学习，它是一场暗网里的绝地排位赛。" }
        ],
        // 16 Feature CAT (Xiaoxiao + Brian)
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "这也是一场你在现实竞技场中永远不可能轻易赢下的残暴挑战。严苛的自适应排位引擎会死死咬住你的能力天花板，疯狂施加阻尼来逼迫你攀登更高维度。" },
            { voice: "en-US-BrianMultilingualNeural", text: "The computational difficulty tracks your proficiency relentlessly, adjusting the frictional drag until you achieve peak form." }
        ],
        // 17 Feature ZPD
        [
            { voice: "zh-CN-XiaoyiNeural", text: "从心理学来看，人类实现认知飞跃的秘境只存在于『舒适区』与『崩溃区』极其狭窄交界的边缘走廊中。每一次核心推送，都绝对精准锁定你只要踮起脚尖、恰好能碰上的维果茨基黄金特区。" }
        ],
        // 18 Feature FSRS
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "同时请抛弃曾经温水煮青蛙一样的随机翻书复习。系统底层装配了顶尖学者开发的极强非线性自由间隔复习算法。通过亿万级矩阵预算，精确捕捉你遗忘前的一微秒，精准抛发强烈的提取刺激。" }
        ],
        // 19 Feature Scheduling
        [
            { voice: "zh-CN-XiaoyiNeural", text: "所以从明天起床的一刻起，扔掉所有让人崩溃的进度规划。你不需要思考，一键按下，全自动智能核反应堆直接满负荷运转。海量的知识早被压缩成了你能毫无阻力吞没的超微胶囊粒子。" }
        ],
        // 20 Feature Feedback
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "为什么重度电玩令人废寝忘食？只因为无可匹敌的绝对情绪反馈。此后的每一次进阶突破，都伴随着不可名状的炸裂粒子狂潮与视觉轰炸。在多巴胺引擎下，疯狂吸收知识只会沦为您无法自拔的成瘾路径。" }
        ],
        // 21 Proof
        [
            { voice: "zh-CN-XiaoyiNeural", text: "至此，终结那些荒诞的在线选择题游戏吧。这一门繁杂的自然语言，绝对不仅仅只是一门外语。它即将成为你重新破译、降维解构并接管这个疯狂数字时代的最强认知显卡。" }
        ],
        // 22 Paywall (Xiaoxiao + Andrew)
        [
            { voice: "zh-CN-XiaoxiaoNeural", text: "所有冗杂的理论铺垫，至此彻底闭环。关于极客自我武装的一切终极进化体系，已经没有任何死角地暴露在你的瞳孔正中央。" },
            { voice: "en-US-AndrewNeural", text: "The entire system is completely armed. The blast doors are open. The ultimate choice lies purely in your hands." },
            { voice: "zh-CN-XiaoxiaoNeural", text: "那么，未来的高维穿梭者，你，准备好孤身踏入这片极寒深空潜流了么？" }
        ]
    ];

    useEffect(() => {
        let currentAudio: HTMLAudioElement | null = null;
        let isActive = true;

        const playNarration = async () => {
            try {
                // Wait for the exit animation of the previous page to complete (around 1-1.2s)
                // Start speaking AS the new page begins to fade in, making it feel immediate but not overlapping.
                await new Promise((resolve) => setTimeout(resolve, 1400));
                
                if (!isActive) return;

                const scriptChunks = NARRATOR_SCRIPT[currentStep] as { voice: string; text: string }[];
                if (!scriptChunks || scriptChunks.length === 0) return;

                // Send chunks directly to TTS backend WITHOUT fragmenting by punctuation. 
                // This drastically reduces network requests, eliminating the "long pause" before audio starts!
                // And because Edge TTS easily handles these lengths, playback won't be artificially truncated.
                const ttsInputs: {text: string; voice: string}[] = scriptChunks.map(chunk => ({
                    text: chunk.text.trim(),
                    voice: chunk.voice
                }));

                const payload = await requestTtsSegmentsPayload(ttsInputs);

                if (!isActive) return;

                currentAudio = new Audio(payload.audio);
                
                // Emitting precise audio timelines for the "Feature Voices" UI sync.
                // This eliminates all hardcoded guessing, and directly reads the TTS boundaries.
                if (currentStep === 14 && payload.segmentTimings) {
                    currentAudio.addEventListener("timeupdate", () => {
                        if (!currentAudio) return;
                        const timeMs = currentAudio.currentTime * 1000;
                        const activeSeg = payload.segmentTimings!.find(s => timeMs >= s.startMs && timeMs < s.endMs);
                        if (activeSeg) {
                            // Substract 1 because segmentTimings backend returns 1-indexed segments
                            window.dispatchEvent(new CustomEvent('voicesSync', { detail: { activeIndex: activeSeg.index - 1 } }));
                        }
                    });
                    currentAudio.addEventListener("ended", () => {
                        window.dispatchEvent(new CustomEvent('voicesSync', { detail: { activeIndex: -1 } }));
                    });
                }

                // Enable auto-advance to next page when TTS finishes reading
                currentAudio.onended = () => {
                    if (!isActive) return;
                    // Auto-advance but only up to the final checkout/paywall
                    setCurrentStep(prev => {
                        if (prev < TOTAL_STEPS - 1) return prev + 1;
                        return prev;
                    });
                };

                currentAudio.play().catch(() => {});
            } catch (error) {
                console.error("Narrator TTS failed", error);
            }
        };

        playNarration();

        return () => {
            isActive = false;
            if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
            }
        };
    }, [currentStep]);

    useEffect(() => {
        if (currentStep >= 3) {
            const timer = setTimeout(() => setShowCloseButton(true), 15000); 
            return () => clearTimeout(timer);
        } else {
            setShowCloseButton(false);
        }
    }, [currentStep]);

    const handleNext = () => {
        if (bgmRef.current && bgmRef.current.paused) {
            bgmRef.current.play().catch(() => {});
        }
        if (currentStep < TOTAL_STEPS - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            handleNext();
        }
    };

    // Deep thematic backgrounds for 17 steps
    // Progressing from pure pitch black -> deep reddish (pain) -> deep bluish (flow) -> deep purples (tech) -> pitch black
    const backgroundColors = [
        "bg-[#020202]", // 0 Intro
        "bg-[#050202]", // 1 Pain Island
        "bg-[#080202]", // 2 Pain Grammar
        "bg-[#0a0303]", // 3 Pain Deaf
        "bg-[#0c0404]", // 4 Pain Comfort
        "bg-[#0f0202]", // 5 Pain Willpower
        "bg-[#030305]", // 6 Philosophy Pivot 
        "bg-[#020206]", // 7 Philosophy Mute
        "bg-[#020308]", // 8 Philosophy Flow
        "bg-[#02030A]", // 9 Feature Topics
        "bg-[#020508]", // 10 Feature Reading
        "bg-[#02070a]", // 11 Feature Syntax
        "bg-[#030206]", // 12 Feature Vocab
        "bg-[#04020a]", // 13 Feature Cabin
        "bg-[#06020c]", // 14 Feature Voices
        "bg-[#0A0402]", // 15 Feature Elo
        "bg-[#0A0604]", // 16 Feature CAT
        "bg-[#060408]", // 17 Feature ZPD
        "bg-[#080305]", // 18 Feature FSRS
        "bg-[#06070a]", // 19 Feature Scheduling
        "bg-[#080602]", // 20 Feature Feedback
        "bg-[#040404]", // 21 Proof
        "bg-[#fbfbfd]", // 22 Paywall (Apple signature off-white)
    ];

    return (
        <div 
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden font-sans text-neutral-50 selection:bg-white/20 outline-none"
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            <motion.div 
                key={`bg-${currentStep}`}
                initial={{ opacity: 0.8 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, ease: "linear" }}
                className={`absolute inset-0 ${backgroundColors[currentStep]} transition-colors duration-1000`} 
            />

            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden mix-blend-overlay opacity-[0.03]"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }}
            />

            <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-6">
                <AnimatePresence>
                    {currentStep > 0 && currentStep < TOTAL_STEPS - 1 && (
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setCurrentStep(prev => prev - 1)}
                            className="p-2 text-white/40 transition-colors hover:text-white relative z-50 pointer-events-auto"
                        >
                            <ChevronRight className="h-6 w-6 rotate-180" strokeWidth={1.5} />
                        </motion.button>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {(showCloseButton || currentStep === TOTAL_STEPS - 1) && (
                        <motion.button
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="p-2 text-white/40 transition-colors hover:text-white relative z-50 pointer-events-auto ml-auto"
                        >
                            <X className="h-6 w-6" strokeWidth={1.5} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {currentStep > 0 && currentStep < TOTAL_STEPS - 1 && (
                <div className="absolute top-8 left-1/2 flex -translate-x-1/2 gap-[2px] z-40 max-w-[80vw] flex-wrap justify-center overflow-hidden">
                    {[...Array(TOTAL_STEPS - 2)].map((_, i) => (
                        <div key={i} className={`h-1 rounded-full transition-colors duration-500 w-3 md:w-5 ${i < currentStep ? "bg-white" : "bg-white/10"}`} />
                    ))}
                </div>
            )}

            <div className="relative z-10 flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 md:px-12 pt-16 pb-32 overflow-y-auto hide-scrollbar">
                <AnimatePresence mode="wait">
                    {currentStep === 0 && <StepPitchIntro key="s0" />}
                    {currentStep === 1 && <StepPitchPain1_Island key="s1" />}
                    {currentStep === 2 && <StepPitchPain2_Grammar key="s2" />}
                    {currentStep === 3 && <StepPitchPain3_Deaf key="s3" />}
                    {currentStep === 4 && <StepPitchPain4_Comfort key="s4" />}
                    {currentStep === 5 && <StepPitchPain5_Willpower key="s5" />}
                    {currentStep === 6 && <StepPitchPhilosophy_Pivot key="s6" />}
                    {currentStep === 7 && <StepPitchPhilosophy_Mute key="s7" />}
                    {currentStep === 8 && <StepPitchPhilosophy_Flow key="s8" />}
                    {currentStep === 9 && <StepPitchFeature_Topics key="s9" />}
                    {currentStep === 10 && <StepPitchFeature_Reading key="s10" />}
                    {currentStep === 11 && <StepPitchFeature_Syntax key="s11" />}
                    {currentStep === 12 && <StepPitchFeature_Vocab key="s12" />}
                    {currentStep === 13 && <StepPitchFeature_Cabin key="s13" />}
                    {currentStep === 14 && <StepPitchFeature_Voices key="s14" />}
                    {currentStep === 15 && <StepPitchFeature_Elo key="s15" />}
                    {currentStep === 16 && <StepPitchFeature_CAT key="s16" />}
                    {currentStep === 17 && <StepPitchFeature_ZPD key="s17" />}
                    {currentStep === 18 && <StepPitchFeature_FSRS key="s18" />}
                    {currentStep === 19 && <StepPitchFeature_Scheduling key="s19" />}
                    {currentStep === 20 && <StepPitchFeature_Feedback key="s20" />}
                    {currentStep === 21 && <StepPitchProof key="s21" />}
                    {currentStep === 22 && <StepPaywall key="s22" onStartTrial={onStartTrial} />}
                </AnimatePresence>
            </div>

            <AnimatePresence>
                {currentStep < TOTAL_STEPS - 1 && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ delay: 0.5, duration: 0.8, ease: LUXURY_MOTION.ease }}
                        className="absolute bottom-10 inset-x-0 z-20 flex w-full flex-col items-center px-6 pointer-events-none"
                    >
                        <button
                            onClick={handleNext}
                            className="pointer-events-auto group relative flex h-14 w-full max-w-[280px] items-center justify-center overflow-hidden rounded-full bg-white text-base font-semibold text-black shadow-[0_0_40px_rgba(255,255,255,0.15)] transition-transform hover:scale-[1.02] active:scale-95"
                        >
                            <span className="relative z-10">{currentStep === 0 ? "开始认知刷新" : "Continue"}</span>
                            <div className="absolute inset-0 -z-10 -translate-x-[150%] animate-[shimmer_3s_infinite] bg-[linear-gradient(90deg,transparent,rgba(0,0,0,0.05),transparent)]" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
