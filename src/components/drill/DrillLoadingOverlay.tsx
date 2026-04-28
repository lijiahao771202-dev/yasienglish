"use client";

import { memo, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

type DrillLoadingVariant = "translation" | "listening" | "dictation" | "rebuild";

// --- SHUFFLE BAG ALGORITHM FOR LOADING THEMES (5 Themes) ---
let LOADING_SHUFFLE_BAG: number[] = [];
const getNextLoadingTheme = (): number => {
    if (LOADING_SHUFFLE_BAG.length === 0) {
        for (let i = 0; i < 5; i++) {
            LOADING_SHUFFLE_BAG.push(i);
        }
        for (let i = LOADING_SHUFFLE_BAG.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = LOADING_SHUFFLE_BAG[i];
            LOADING_SHUFFLE_BAG[i] = LOADING_SHUFFLE_BAG[j];
            LOADING_SHUFFLE_BAG[j] = temp;
        }
    }
    return LOADING_SHUFFLE_BAG.pop()!;
};

const CanvasPremiumBreathingParticles = memo(({ prefersReducedMotion }: { prefersReducedMotion?: boolean }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Choose the visual theme once on mount
        const themeIndex = getNextLoadingTheme();

        let animationFrameId: number;
        const dpr = window.devicePixelRatio || 1;

        let width = window.innerWidth;
        let height = window.innerHeight;

        const resize = () => {
            width = canvas.parentElement?.clientWidth || window.innerWidth;
            height = canvas.parentElement?.clientHeight || window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);
        };
        resize();
        window.addEventListener("resize", resize);

        const startTime = Date.now();
        let particlesData: any = null;

        // ----------------------------------------------------
        // INITIALIZATION FOR EACH THEME
        // ----------------------------------------------------
        if (themeIndex === 0) {
            // THEME 0: Dream Bubbles (Original)
            const colors = ["#f472b6", "#38bdf8", "#fbbf24", "#a78bfa"];
            const p = [];
            for (let index = 0; index < 250; index += 1) {
                p.push({
                    baseAngle: Math.random() * Math.PI * 2,
                    distanceRatio: Math.random(),
                    size: Math.random() * 8 + 3,
                    color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0],
                    speed: (Math.random() > 0.5 ? 1 : -1) * (0.0002 + Math.random() * 0.0004),
                    phase: Math.random() * Math.PI * 2,
                });
            }
            particlesData = { p };
        } else if (themeIndex === 1) {
            // THEME 1: Neural Network
            const p: any[] = [];
            for (let index = 0; index < 100; index += 1) {
                p.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 1.5,
                    vy: (Math.random() - 0.5) * 1.5,
                    size: Math.random() * 2 + 1,
                });
            }
            particlesData = { p };
            ctx.lineCap = "round";
        } else if (themeIndex === 2) {
            // THEME 2: Radial Pulse
            const rings: any[] = [];
            for (let index = 0; index < 6; index += 1) {
                rings.push({
                    progress: index / 6,
                    speed: 0.0003 + Math.random() * 0.0001,
                    thickness: Math.random() * 2 + 1,
                });
            }
            particlesData = { rings };
        } else if (themeIndex === 3) {
            // THEME 3: Aurora Waves (Sine/Cosine Bands)
            const bands: any[] = [];
            for (let index = 0; index < 5; index += 1) {
                bands.push({
                    yOffset: (Math.random() - 0.5) * 200,
                    amplitude: Math.random() * 100 + 50,
                    frequency: Math.random() * 0.002 + 0.001,
                    speed: Math.random() * 0.001 + 0.0005,
                    color: `hsla(${200 + index * 30}, 100%, 70%, 0.3)`,
                    thickness: Math.random() * 30 + 10,
                });
            }
            particlesData = { bands };
        } else if (themeIndex === 4) {
            // THEME 4: Space Vortex (spiraling inwards)
            const p: any[] = [];
            for (let index = 0; index < 400; index += 1) {
                p.push({
                    angle: Math.random() * Math.PI * 2,
                    radius: Math.random() * Math.max(width, height),
                    size: Math.random() * 2 + 0.5,
                    speed: Math.random() * 0.002 + 0.001,
                    inwardSpeed: Math.random() * 1.5 + 0.5,
                    color: Math.random() > 0.8 ? '#fcd34d' : '#93c5fd',
                });
            }
            particlesData = { p };
        }

        // ----------------------------------------------------
        // RENDER LOOP
        // ----------------------------------------------------
        const render = () => {
            // Only clear rect, use a trailing effect for some themes
            if (themeIndex === 1 || themeIndex === 4) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
                ctx.fillRect(0, 0, width, height);
            } else {
                ctx.clearRect(0, 0, width, height);
            }

            const now = Date.now();
            const rawTime = now - startTime;
            const time = prefersReducedMotion ? rawTime * 0.3 : rawTime;

            const cycleDuration = 19000;
            const phase = time % cycleDuration;
            
            // Fading logic for outer container (used in Theme 0, and generally applicable as a master alpha)
            let rawProgress = 0;
            if (phase < 4000) {
                rawProgress = phase / 4000;
            } else if (phase < 11000) {
                rawProgress = 1;
            } else {
                rawProgress = 1 - (phase - 11000) / 8000;
            }
            const masterAlpha = rawProgress * rawProgress * (3 - 2 * rawProgress);
            const centerX = width / 2;
            const centerY = height / 2;
            ctx.globalCompositeOperation = "source-over";

            if (themeIndex === 0) {
                // RENDER THEME 0 (Dream Bubbles)
                const maxRadius = Math.max(width, height) * 0.7;
                for (const particle of particlesData.p) {
                    const currentAngle = particle.baseAngle + time * particle.speed;
                    const targetRadius = particle.distanceRatio * maxRadius;
                    const radius = targetRadius * (0.05 + 0.95 * masterAlpha);
                    const wobble = Math.sin(time * 0.001 + particle.phase) * (particle.size * 2);
                    const finalX = centerX + Math.cos(currentAngle) * (radius + wobble);
                    const finalY = centerY + Math.sin(currentAngle) * (radius + wobble);

                    ctx.beginPath();
                    ctx.arc(finalX, finalY, particle.size, 0, Math.PI * 2);
                    ctx.fillStyle = particle.color;
                    ctx.globalAlpha = 0.5 + 0.5 * masterAlpha;
                    ctx.fill();
                }
            } else if (themeIndex === 1) {
                // RENDER THEME 1 (Neural Network)
                for (const particle of particlesData.p) {
                    particle.x += particle.vx * (prefersReducedMotion ? 0.3 : 1);
                    particle.y += particle.vy * (prefersReducedMotion ? 0.3 : 1);
                    
                    if (particle.x < 0 || particle.x > width) particle.vx *= -1;
                    if (particle.y < 0 || particle.y > height) particle.vy *= -1;

                    ctx.beginPath();
                    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                    ctx.fillStyle = "#94a3b8"; // Slate color point
                    ctx.globalAlpha = masterAlpha * 0.8;
                    ctx.fill();
                }
                // Connect close particles
                ctx.lineWidth = 1;
                for (let i = 0; i < particlesData.p.length; i++) {
                    for (let j = i + 1; j < particlesData.p.length; j++) {
                        const dx = particlesData.p[i].x - particlesData.p[j].x;
                        const dy = particlesData.p[i].y - particlesData.p[j].y;
                        const distSq = dx * dx + dy * dy;
                        if (distSq < 15000) {
                            ctx.beginPath();
                            ctx.moveTo(particlesData.p[i].x, particlesData.p[i].y);
                            ctx.lineTo(particlesData.p[j].x, particlesData.p[j].y);
                            const alpha = (1 - distSq / 15000) * masterAlpha * 0.4;
                            ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
                            ctx.stroke();
                        }
                    }
                }
            } else if (themeIndex === 2) {
                // RENDER THEME 2 (Radial Pulse)
                const maxRadius = Math.max(width, height) * 0.8;
                for (const ring of particlesData.rings) {
                    ring.progress += ring.speed * (prefersReducedMotion ? 0.3 : 1) * 30; // Delta time roughly
                    if (ring.progress > 1) ring.progress -= 1;
                    
                    const currentRadius = ring.progress * maxRadius;
                    const alpha = Math.max(0, (1 - ring.progress) * masterAlpha);
                    
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(167, 139, 250, ${alpha})`; // Purple pulse
                    ctx.lineWidth = ring.thickness;
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, currentRadius * 0.8, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(244, 114, 182, ${alpha * 0.6})`; // Pink inner
                    ctx.lineWidth = ring.thickness * 0.5;
                    ctx.stroke();
                }
            } else if (themeIndex === 3) {
                // RENDER THEME 3 (Aurora Waves)
                for (const band of particlesData.bands) {
                    const phaseOffset = time * band.speed;
                    ctx.beginPath();
                    for (let x = 0; x <= width; x += 20) {
                        const y = centerY + band.yOffset + Math.sin(x * band.frequency + phaseOffset) * band.amplitude;
                        if (x === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.strokeStyle = band.color;
                    ctx.lineWidth = band.thickness;
                    ctx.lineJoin = "round";
                    ctx.globalAlpha = masterAlpha;
                    ctx.stroke();
                }
            } else if (themeIndex === 4) {
                // RENDER THEME 4 (Space Vortex)
                ctx.globalAlpha = masterAlpha;
                for (const particle of particlesData.p) {
                    particle.angle += particle.speed * (prefersReducedMotion ? 0.3 : 1) * 16;
                    particle.radius -= particle.inwardSpeed * (prefersReducedMotion ? 0.3 : 1) * 2;
                    
                    if (particle.radius < 5) {
                        particle.radius = Math.max(width, height);
                        particle.angle = Math.random() * Math.PI * 2;
                    }
                    
                    const x = centerX + Math.cos(particle.angle) * particle.radius;
                    const y = centerY + Math.sin(particle.angle) * particle.radius;
                    
                    ctx.beginPath();
                    ctx.arc(x, y, particle.size, 0, Math.PI * 2);
                    ctx.fillStyle = particle.color;
                    ctx.fill();
                }
            }

            if (!prefersReducedMotion) {
                animationFrameId = requestAnimationFrame(render);
            } else {
                animationFrameId = window.setTimeout(() => requestAnimationFrame(render), 60) as unknown as number;
            }
        };

        render();

        return () => {
            window.removeEventListener("resize", resize);
            if (prefersReducedMotion) {
                clearTimeout(animationFrameId);
            } else {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [prefersReducedMotion]);

    return (
        <canvas
            ref={canvasRef}
            className={cn(
                "absolute inset-0 z-0 mix-blend-multiply",
                "transition-all duration-[1200ms] ease-out max-w-full overflow-hidden",
                "opacity-60 scale-100 blur-[3px]",
            )}
        />
    );
});

CanvasPremiumBreathingParticles.displayName = "CanvasPremiumBreathingParticles";

export interface DrillLoadingOverlayProps {
    loaderTick: number;
    prefersReducedMotion?: boolean;
    rebuildRagState?: {
        hitCount: number;
        status: "idle" | "querying" | "hit" | "empty" | "unavailable";
    };
    variant: DrillLoadingVariant;
}

export function DrillLoadingOverlay({
    loaderTick,
    prefersReducedMotion,
    rebuildRagState,
    variant,
}: DrillLoadingOverlayProps) {
    const variantUi = variant === "listening" || variant === "dictation"
        ? {
            stages: variant === "dictation" ? ["语义取样", "音频校准", "听写就绪"] : ["声纹预热", "降噪校准", "播放就绪"],
        }
        : variant === "translation"
            ? {
                stages: ["语义草拟", "语法校准", "句式润色"],
            }
            : {
                stages: ["语义构稿", "词块切分", "短文就绪"],
            };

    const stageIndex = Math.min(variantUi.stages.length - 1, Math.floor(loaderTick / 4));
    const rebuildRagMessage = variant !== "rebuild" || !rebuildRagState || rebuildRagState.status === "idle"
        ? null
        : rebuildRagState.status === "querying"
            ? "正在查询本地词库"
            : rebuildRagState.status === "hit"
                ? `已查询本地词库 · 命中 ${rebuildRagState.hitCount} 个候选词`
                : rebuildRagState.status === "empty"
                    ? "已查询本地词库 · 当前主题未命中词书"
                    : "本地词库未就绪 · 已回退常规出题";

    return (
        <motion.div
            key="drill-loading-system"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.4, filter: "blur(15px)" }}
            transition={{ duration: 0.65, ease: "easeOut" }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-50 overflow-hidden pointer-events-none"
        >
            <div className="absolute inset-0 z-0">
                <CanvasPremiumBreathingParticles prefersReducedMotion={prefersReducedMotion} />
            </div>

            <div className="absolute inset-x-0 bottom-24 z-10 w-full text-center flex flex-col items-center opacity-90 drop-shadow-sm">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={variantUi.stages[stageIndex]}
                        initial={{ opacity: 0, y: 12, filter: "blur(12px)", scale: 0.94, letterSpacing: "0.1em" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1, letterSpacing: "0.45em" }}
                        exit={{ opacity: 0, filter: "blur(12px)", scale: 1.05, letterSpacing: "0.8em" }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] as const }}
                        className="font-sans text-[12px] md:text-[14px] font-bold text-indigo-500 uppercase pl-[0.45em]"
                    >
                        {variantUi.stages[stageIndex]}
                    </motion.div>
                </AnimatePresence>
                {rebuildRagMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 0.82, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="mt-3 rounded-full border border-sky-200/80 bg-white/70 px-4 py-2 text-[11px] font-semibold tracking-[0.08em] text-slate-600 shadow-[0_10px_30px_rgba(148,163,184,0.14)] backdrop-blur-md"
                    >
                        {rebuildRagMessage}
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}
