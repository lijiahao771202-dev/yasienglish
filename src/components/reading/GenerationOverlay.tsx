import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, DatabaseZap, Network, Cpu, Compass, UploadCloud } from "lucide-react";

export type GenerationProgressStep = 'idle' | 'topic_established' | 'rag_searching' | 'rag_found' | 'payload_compiling' | 'ai_generating' | 'finishing';

export interface GenerationProgressState {
    step: GenerationProgressStep;
    topic: string;
    retrievedWords: {
        core: string[];
        lower: string[];
        stretch: string[];
    };
    logs: string[];
}

interface GenerationOverlayProps {
    progress: GenerationProgressState;
}

export const CanvasBreathingParticles = ({ colors, isExiting }: { colors?: string[], isExiting?: boolean }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const exitTimeRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId = 0;
        let width = window.innerWidth;
        let height = window.innerHeight;
        let dpr = window.devicePixelRatio || 1;
        
        const setCanvasSize = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
        };
        setCanvasSize();
        window.addEventListener('resize', setCanvasSize);

        const themeColors = colors || ['#fbbf24', '#f59e0b', '#38bdf8', '#0ea5e9', '#e0f2fe', '#ffffff'];
        
        // 4-7-8 Breathing Cycle
        const INHALE = 4000;
        const HOLD = 7000;
        const EXHALE = 8000;
        const CYCLE_TOTAL = INHALE + HOLD + EXHALE; // 19 seconds
        const ENTRANCE_DURATION = 1500; // 1.5s expand-contract

        const particleCount = 1800;
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const angleIncrement = Math.PI * 2 * goldenRatio;

        interface Particle {
            theta: number;
            phi: number;
            baseSize: number;
            color: string;
            wThetaOffset: number;
            wPhiOffset: number;
            wSpeed: number;
            initX: number;
            initY: number;
            initZ: number;
        }

        const particles: Particle[] = [];
        const baseCloudRadius = Math.max(width, height) * 1.5;
        
        for (let i = 0; i < particleCount; i++) {
            const t = i / particleCount;
            const phi = Math.acos(1 - 2 * t);
            const theta = angleIncrement * i;
            // Random scattered points for entrance
            const dist = baseCloudRadius * (0.6 + Math.random() * 0.8);
            const randomPhi = Math.acos(1 - 2 * Math.random());
            const randomTheta = Math.random() * Math.PI * 2;
            particles.push({
                theta,
                phi,
                baseSize: Math.max(3.0, Math.random() * 7.0), // increased size
                color: themeColors[Math.floor(Math.random() * themeColors.length)],
                wThetaOffset: Math.random() * Math.PI * 2,
                wPhiOffset: Math.random() * Math.PI * 2,
                wSpeed: 0.0005 + Math.random() * 0.0008,
                initX: dist * Math.sin(randomPhi) * Math.cos(randomTheta),
                initY: dist * Math.cos(randomPhi),
                initZ: dist * Math.sin(randomPhi) * Math.sin(randomTheta),
            });
        }

        let startTime = Date.now();
        
        const render = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'lighter'; 
            
            const minRadius = Math.min(width, height) * 0.35;
            const maxRadius = Math.min(width, height) * 0.8; 
            
            let breathFactor = 0; 
            let entranceAlphaMod = 1;
            let currentRadius = minRadius;
            let collapseFactor = 1;
            let isExitSequence = false;
            let exitFactor = 0;

            if (isExiting) {
                if (exitTimeRef.current === null) exitTimeRef.current = now;
                const exitElapsed = now - exitTimeRef.current;
                isExitSequence = true;
                // Exit collapse over 0.5s
                exitFactor = Math.min(1, exitElapsed / 500);
                // Ease In for violent collapse
                exitFactor = exitFactor * exitFactor * exitFactor;
            } else if (exitTimeRef.current !== null) {
                exitTimeRef.current = null;
            }

            if (elapsed < ENTRANCE_DURATION) {
                const t = elapsed / ENTRANCE_DURATION;
                
                // Smooth fade in
                entranceAlphaMod = t * t * (3 - 2 * t);
                
                // Elegant collapse from scattered points to sphere
                const easeOutCubic = 1 - Math.pow(1 - t, 3);
                collapseFactor = easeOutCubic;
            } else {
                collapseFactor = 1;
                
                // 4-7-8 Breathing Phase
                const cycleTime = (elapsed - ENTRANCE_DURATION) % CYCLE_TOTAL;
                
                if (cycleTime < INHALE) {
                    const p = cycleTime / INHALE;
                    breathFactor = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                } else if (cycleTime < INHALE + HOLD) {
                    breathFactor = 1;
                } else {
                    const p = (cycleTime - INHALE - HOLD) / EXHALE;
                    breathFactor = 1 - (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
                }
                currentRadius = minRadius + (maxRadius - minRadius) * breathFactor;
            }

            // Deep Rotation Logic
            const rotX = elapsed * 0.0001;
            const rotY = elapsed * 0.00025 + breathFactor * 0.5;
            
            const fov = 1500;
            const renderList = [];

            // Compute 3D transforms
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                const wTheta = p.theta + Math.sin(elapsed * p.wSpeed + p.wThetaOffset) * 0.03;
                const wPhi = p.phi + Math.cos(elapsed * p.wSpeed + p.wPhiOffset) * 0.03;

                const tX = currentRadius * Math.sin(wPhi) * Math.cos(wTheta);
                const tY = currentRadius * Math.cos(wPhi);
                const tZ = currentRadius * Math.sin(wPhi) * Math.sin(wTheta);

                let x3d = p.initX * (1 - collapseFactor) + tX * collapseFactor;
                let y3d = p.initY * (1 - collapseFactor) + tY * collapseFactor;
                let z3d = p.initZ * (1 - collapseFactor) + tZ * collapseFactor;

                if (isExitSequence) {
                    x3d = x3d * (1 - exitFactor);
                    y3d = y3d * (1 - exitFactor);
                    z3d = z3d * (1 - exitFactor);
                    entranceAlphaMod *= (1 - exitFactor);
                }

                const x1 = x3d;
                const y1 = y3d * Math.cos(rotX) - z3d * Math.sin(rotX);
                const z1 = y3d * Math.sin(rotX) + z3d * Math.cos(rotX);
                
                const x2 = x1 * Math.cos(rotY) + z1 * Math.sin(rotY);
                const y2 = y1;
                const z2 = -x1 * Math.sin(rotY) + z1 * Math.cos(rotY);
                
                if (fov + z2 <= 20) continue; 

                const scale = fov / (fov + z2);
                const currentX = width / 2 + x2 * scale;
                const currentY = height / 2 + y2 * scale;

                renderList.push({
                    x: currentX, y: currentY, z: z2, p, scale
                });
            }

            renderList.sort((a, b) => b.z - a.z);

            // Render
            for (let i = 0; i < renderList.length; i++) {
                const { x, y, z, p, scale } = renderList[i];
                
                const depthAlpha = Math.max(0.05, 1 - (z + currentRadius) / (2 * currentRadius));
                const breathGlow = 0.5 + 0.5 * breathFactor;

                ctx.beginPath();
                ctx.arc(x, y, p.baseSize * scale * breathGlow, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = depthAlpha * breathGlow * 0.9 * entranceAlphaMod;
                ctx.fill();
            }

            const coreOpacity = (0.05 + 0.1 * breathFactor) * entranceAlphaMod;
            if (coreOpacity > 0.01) {
                const coreGlow = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, currentRadius * 0.8);
                coreGlow.addColorStop(0, `rgba(139, 92, 246, ${coreOpacity})`);
                coreGlow.addColorStop(0.5, `rgba(56, 189, 248, ${coreOpacity * 0.4})`);
                coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalCompositeOperation = 'source-over';
                ctx.beginPath();
                ctx.arc(width/2, height/2, currentRadius * 0.8, 0, Math.PI * 2);
                ctx.fillStyle = coreGlow;
                ctx.fill();
            }

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => {
            window.removeEventListener('resize', setCanvasSize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [isExiting]);

    // Astonishing Exit Animation via Framer Motion combining with the structural collapse
    return (
        <motion.canvas 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 2.0, filter: "blur(20px)", transition: { duration: 0.6, ease: [0.32, 0, 0.67, 0] as const } }}
            ref={canvasRef} 
            className="fixed inset-0 z-0 pointer-events-none" 
        />
    );
};

export function GenerationOverlay({ progress }: GenerationOverlayProps) {
    const { step, retrievedWords, logs, topic } = progress;
    const isOpen = step !== 'idle';
    const isGenerating = step === 'ai_generating' || step === 'finishing';
    
    // Auto-scroll logs
    const scrollRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, step]);

    // Gather all valid words for particle display
    const allWords = [...retrievedWords.core, ...retrievedWords.lower, ...retrievedWords.stretch];

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4">
                    {/* Dark frosted glass background full overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
                        className="absolute inset-0 bg-theme-base-bg/95 backdrop-blur-[40px] pointer-events-none"
                    />

                    {/* GLOBAL FULL SCREEN SPIRAL GALAXY ANIMATION */}
                    <AnimatePresence>
                        {isGenerating && <CanvasBreathingParticles key="breathing-sphere" isExiting={step === 'finishing'} />}
                    </AnimatePresence>

                    <div className="relative w-full max-w-5xl h-[500px] flex items-center justify-center pointer-events-auto">
                        <AnimatePresence mode="wait">
                            {step === 'topic_established' && (
                                <motion.div
                                    key="topic"
                                    initial={{ filter: "blur(20px)", opacity: 0, scale: 0.8 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
                                    exit={{ filter: "blur(20px)", opacity: 0, scale: 1.1 }}
                                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                                    className="flex flex-col items-center text-center space-y-8"
                                >
                                    <div className="relative z-10">
                                        <div className="absolute inset-0 bg-cyan-500/20 blur-[60px] rounded-full" />
                                        <Compass className="h-24 w-24 text-cyan-400 stroke-[1px] relative animate-pulse" />
                                    </div>
                                    <div className="space-y-4 relative z-10">
                                        <h4 className="text-sm font-black uppercase tracking-[0.4em] text-cyan-400/80">主题目标已锁定</h4>
                                        <h1 className="text-5xl md:text-6xl font-black text-theme-text font-welcome-display tracking-tight leading-tight max-w-4xl px-4">
                                            "{topic}"
                                        </h1>
                                    </div>
                                </motion.div>
                            )}

                            {step === 'rag_searching' && (
                                <motion.div
                                    key="search"
                                    initial={{ filter: "blur(20px)", opacity: 0, scale: 0.8 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
                                    exit={{ filter: "blur(20px)", opacity: 0, scale: 1.1 }}
                                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                                    className="flex flex-col items-center text-center space-y-8"
                                >
                                    <div className="relative z-10">
                                        <div className="absolute inset-0 bg-indigo-500/20 blur-[60px] rounded-full" />
                                        <DatabaseZap className="h-24 w-24 text-indigo-400 stroke-[1px] relative animate-spin-slow" />
                                    </div>
                                    <div className="space-y-4 relative z-10">
                                        <h4 className="text-sm font-black uppercase tracking-[0.4em] text-indigo-400/80">神经矩阵同步中</h4>
                                        <h1 className="text-4xl md:text-5xl font-black text-theme-text font-welcome-display tracking-tight max-w-3xl">
                                            正在搜索本地语境网络...
                                        </h1>
                                    </div>
                                </motion.div>
                            )}

                            {step === 'rag_found' && (
                                <motion.div
                                    key="found"
                                    initial={{ filter: "blur(20px)", opacity: 0, scale: 0.8 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
                                    exit={{ filter: "blur(20px)", opacity: 0, scale: 1.1 }}
                                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                                    className="flex flex-col items-center w-full relative z-10"
                                >
                                    <div className="flex flex-col items-center mb-8">
                                        <h4 className="text-sm font-black uppercase tracking-[0.4em] text-emerald-400/80 mb-3 text-center">
                                            已加载 {allWords.length} 个 RAG 语义实体
                                        </h4>
                                        <div className="flex items-center gap-4 text-xs font-bold font-mono tracking-widest">
                                            <span className="text-amber-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400"></span>核心词轨</span>
                                            <span className="text-rose-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-400"></span>拔高词轨</span>
                                            <span className="text-emerald-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>复习词轨</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap justify-center gap-4 w-full max-w-4xl px-4">
                                        {allWords.slice(0, 50).map((word, idx) => (
                                            <motion.div
                                                key={`${word}-${idx}`}
                                                initial={{ opacity: 0, y: 30, scale: 0.6 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                transition={{ delay: idx * 0.02, type: "spring" as const, damping: 12, stiffness: 200 }}
                                                className={`rounded-2xl border-[2px] px-5 py-3 font-mono text-xl font-black shadow-[0_0_30px_rgba(0,0,0,0.15)] bg-theme-base-bg/50 backdrop-blur-md
                                                    ${retrievedWords.core.includes(word) ? 'border-amber-400 text-amber-500 dark:text-amber-300' : ''}
                                                    ${retrievedWords.stretch.includes(word) ? 'border-rose-400 text-rose-500 dark:text-rose-300' : ''}
                                                    ${retrievedWords.lower.includes(word) ? 'border-emerald-400 text-emerald-600 dark:text-emerald-300' : ''}
                                                    ${!retrievedWords.core.includes(word) && !retrievedWords.stretch.includes(word) && !retrievedWords.lower.includes(word) ? 'border-indigo-400 text-indigo-500 dark:text-indigo-300' : ''}
                                                `}
                                            >
                                                {word}
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}

                            {step === 'payload_compiling' && (
                                <motion.div
                                    key="compile"
                                    initial={{ filter: "blur(20px)", opacity: 0, scale: 0.8 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
                                    exit={{ filter: "blur(20px)", opacity: 0, scale: 1.1 }}
                                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                                    className="flex flex-col items-center text-center space-y-8"
                                >
                                    <div className="relative z-10">
                                        <div className="absolute inset-0 bg-rose-500/20 blur-[60px] rounded-full" />
                                        <UploadCloud className="h-24 w-24 text-rose-400 stroke-[1px] relative animate-bounce" />
                                    </div>
                                    <div className="space-y-4 relative z-10">
                                        <h4 className="text-sm font-black uppercase tracking-[0.4em] text-rose-400/80">生成载荷组装</h4>
                                        <h1 className="text-4xl md:text-5xl font-black text-theme-text font-welcome-display tracking-tight max-w-3xl">
                                            正在压缩语义数据流...
                                        </h1>
                                    </div>
                                </motion.div>
                            )}

                            {(step === 'ai_generating' || step === 'finishing') && (
                                <motion.div
                                    key="generate"
                                    initial={{ filter: "blur(20px)", opacity: 0, scale: 0.8 }}
                                    animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
                                    exit={{ filter: "blur(20px)", opacity: 0, scale: 1.1 }}
                                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as const }}
                                    className="flex flex-col items-center justify-center text-center space-y-10 w-full h-full pointer-events-none"
                                >
                                    <div className="space-y-4 relative z-30">
                                        <motion.h4 
                                            animate={{ opacity: [0.4, 0.9, 0.4] }}
                                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                            className="text-sm font-black uppercase tracking-[0.4em] text-fuchsia-400/90 drop-shadow-md"
                                        >
                                            {step === 'finishing' ? '即将完成' : '深呼吸一次'}
                                        </motion.h4>
                                        <motion.h1 
                                            animate={{ opacity: [0.6, 1, 0.6], filter: ["blur(1px)", "blur(0px)", "blur(1px)"] }}
                                            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                            className="text-4xl md:text-5xl font-black text-theme-text font-welcome-display tracking-tight max-w-3xl"
                                        >
                                            {step === 'finishing' ? '正在解包最终数据序列...' : '正在为您编织专属文章...'}
                                        </motion.h1>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
}
