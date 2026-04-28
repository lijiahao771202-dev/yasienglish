"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TourStep {
    targetId: string;
    title: string;
    content: string;
    placement?: "top" | "bottom" | "left" | "right" | "center";
    customModal?: React.ReactNode;
    onEnter?: () => void;
    nextDisabled?: boolean;
}

interface SpotlightTourProps {
    steps: TourStep[];
    isOpen: boolean;
    onClose: () => void;
    onComplete?: () => void;
}

export function SpotlightTour({ steps, isOpen, onClose, onComplete }: SpotlightTourProps) {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

    const currentStep = steps[currentStepIndex];

    useEffect(() => {
        if (!isOpen) {
            setCurrentStepIndex(0);
            setTargetRect(null);
            return;
        }

        const updateRect = () => {
            if (!currentStep) return;
            const element = document.querySelector(`[data-tour-target="${currentStep.targetId}"]`);
            if (element) {
                setTargetRect(element.getBoundingClientRect());
            } else {
                setTargetRect(null);
            }
            setWindowSize({ width: window.innerWidth, height: window.innerHeight });
        };

        // Trigger onEnter lifecycle if defined
        if (currentStep && currentStep.onEnter) {
            currentStep.onEnter();
        }

        // Initial update and listeners
        updateRect();
        
        // Setup polling for the first second to catch elements that are animating in
        let attempts = 0;
        const intervalId = setInterval(() => {
            updateRect();
            attempts++;
            if (attempts >= 15) clearInterval(intervalId); // Poll 15 times over 750ms
        }, 50);
        
        window.addEventListener("resize", updateRect);
        window.addEventListener("scroll", updateRect, { passive: true, capture: true });

        return () => {
            clearInterval(intervalId);
            window.removeEventListener("resize", updateRect);
            window.removeEventListener("scroll", updateRect, { capture: true } as any);
        };
    }, [currentStep, isOpen]);

    // Handle Smooth Scrolling only when step changes
    useEffect(() => {
        if (!isOpen || !currentStep) return;
        const element = document.querySelector(`[data-tour-target="${currentStep.targetId}"]`);
        if (element) {
            const rect = element.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            // Add a small delay to allow react/framer to setup first, making scroll smoother
            if (rect.top < 80 || rect.bottom > viewportHeight - 80) {
                setTimeout(() => {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 50);
            }
        }
    }, [currentStep, isOpen]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (currentStep?.nextDisabled) return;
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex((prev) => prev + 1);
        } else {
            onComplete?.();
            onClose();
        }
    };

    const handlePrev = () => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex((prev) => prev - 1);
        }
    };

    // Calculate tooltip position based on rect and placement
    const padding = 16;
    const rx = 32; // Corner radius of the spotlight
    
    let tooltipX = "50%";
    let tooltipY = "50%";
    let xOffset = "-50%";
    let yOffset = "-50%";
    
    // Extract step placement intent
    const placement = currentStep.placement || "bottom";

    if (targetRect) {
        // Smart Positioning with robust Viewport Boundary Clamping
        const gap = 24;
        const tooltipW = windowSize.width < 640 ? 320 : 360;
        const tooltipH = 260; // Estimated max height safe zone

        let px = 0;
        let py = 0;

        if (placement === "bottom") {
            px = targetRect.x + targetRect.width / 2 - tooltipW / 2;
            py = targetRect.bottom + padding + gap;
            if (py + tooltipH > windowSize.height) py = targetRect.top - padding - gap - tooltipH; // Flip
        } else if (placement === "top") {
            px = targetRect.x + targetRect.width / 2 - tooltipW / 2;
            py = targetRect.top - padding - gap - tooltipH;
            if (py < 16) py = targetRect.bottom + padding + gap; // Flip
        } else if (placement === "left") {
            px = targetRect.x - padding - gap - tooltipW;
            py = targetRect.y + targetRect.height / 2 - tooltipH / 2;
            if (px < 16) px = targetRect.right + padding + gap; // Flip
        } else if (placement === "right") {
            px = targetRect.right + padding + gap;
            py = targetRect.y + targetRect.height / 2 - tooltipH / 2;
            if (px + tooltipW > windowSize.width - 16) px = targetRect.x - padding - gap - tooltipW; // Flip
        }

        // Final Clamping to ensure it never bleeds off canvas
        px = Math.max(16, Math.min(px, windowSize.width - tooltipW - 16));
        py = Math.max(16, Math.min(py, windowSize.height - tooltipH - 16));

        tooltipX = `${px}px`;
        tooltipY = `${py}px`;
        xOffset = "0%";
        yOffset = "0%";
    } else {
        tooltipX = "50%";
        xOffset = "-50%";
        
        if (placement === "top") {
            tooltipY = "24px";
            yOffset = "0%";
        } else if (placement === "center") {
            tooltipY = "50%";
            yOffset = "-50%";
        } else {
            // Default bottom
            tooltipY = `${Math.max(16, windowSize.height - 24)}px`;
            yOffset = "-100%";
        }
    }

    // Use a critically damped, Apple-like premium spring for flawless rigid tracking without lag
    const motionConfig = { type: "spring" as const, stiffness: 260, damping: 26, mass: 1 };

    return (
        <div className="fixed inset-0 z-[99999] overflow-hidden pointer-events-auto select-none font-welcome-ui">
            {/* SVG Mask Overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                    <mask id="spotlight-mask">
                        <rect x="0" y="0" width="100%" height="100%" fill="white" />
                        {targetRect ? (
                            <motion.rect
                                initial={false}
                                animate={{
                                    x: targetRect.x - padding,
                                    y: targetRect.y - padding,
                                    width: targetRect.width + padding * 2,
                                    height: targetRect.height + padding * 2,
                                }}
                                transition={motionConfig}
                                rx={rx}
                                fill="black"
                            />
                        ) : (
                            // Fallback if target not found: a tiny dot in center
                            <motion.rect
                                initial={false}
                                animate={{
                                    x: windowSize.width / 2 - 1,
                                    y: windowSize.height / 2 - 1,
                                    width: 2,
                                    height: 2,
                                }}
                                transition={motionConfig}
                                rx={1}
                                fill="black"
                            />
                        )}
                    </mask>
                </defs>
                <rect 
                    x="0" 
                    y="0" 
                    width="100%" 
                    height="100%" 
                    fill="rgba(2, 6, 23, 0.75)" 
                    mask="url(#spotlight-mask)" 
                />
                
                {/* Glowing border stroke matching the hole */}
                {targetRect && (
                    <motion.rect
                        initial={false}
                        animate={{
                            x: targetRect.x - padding,
                            y: targetRect.y - padding,
                            width: targetRect.width + padding * 2,
                            height: targetRect.height + padding * 2,
                        }}
                        transition={{ ...motionConfig, delay: 0.05 }} // Slight delay creates a cool trailing glow effect
                        rx={rx}
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth="3"
                        strokeOpacity="0.8"
                        className="pointer-events-none"
                    />
                )}
            </svg>

            {/* Custom Modal rendering - simplified to ensure immediate mounting */}
            {currentStep?.customModal && (
                <div 
                    className="pointer-events-none"
                    style={{
                        position: "absolute",
                        top: (!targetRect && currentStep.placement === "top") ? "240px" : "60px",
                        left: "50%",
                        transform: "translateX(-50%)",
                        width: "100%",
                        maxWidth: "60rem",
                        padding: "0 16px",
                        zIndex: 99999
                    }}
                >
                    <div className="w-full pointer-events-auto rounded-[2.5rem] shadow-[0_0_80px_rgba(30,27,75,0.4)] bg-theme-base-bg border-4 border-theme-border/50 overflow-hidden">
                        {currentStep.customModal}
                    </div>
                </div>
            )}

            {/* Tooltip Card */}
            <AnimatePresence mode="wait">
                {(targetRect !== undefined) && currentStep && (
                    <motion.div
                        key={currentStep.targetId}
                        initial={{ opacity: 0, scale: 0.9, x: xOffset, y: `calc(${yOffset} + 15px)` }}
                        animate={{ opacity: 1, scale: 1, x: xOffset, y: yOffset }}
                        exit={{ opacity: 0, scale: 0.95, x: xOffset, y: `calc(${yOffset} - 10px)` }}
                        transition={{ type: "spring" as const, stiffness: 350, damping: 25, delay: 0.15 }}
                        style={{
                            position: "absolute",
                            left: tooltipX,
                            top: tooltipY,
                        }}
                        // Ensure it doesn't overflow screen limits regardless of placement
                        className="w-[320px] sm:w-[360px] flex flex-col gap-3 rounded-[2rem] border-[4px] border-[#1e1b4b] bg-indigo-50 p-6 shadow-[0_12px_0_0_#1e1b4b] z-[100000]"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="font-welcome-display text-2xl font-black text-[#1e1b4b] leading-none tracking-tight">
                                {currentStep.title}
                            </h3>
                            <button
                                onClick={onClose}
                                className="flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-[#1e1b4b] bg-white text-[#1e1b4b] hover:bg-rose-100 hover:text-rose-600 transition-colors shadow-[0_3px_0_0_#1e1b4b] active:translate-y-0.5 active:shadow-[0_1px_0_0_#1e1b4b]"
                            >
                                <X className="h-4 w-4 stroke-[3]" />
                            </button>
                        </div>
                        
                        <p className="text-[15px] font-bold text-indigo-900 leading-relaxed mb-2">
                            {currentStep.content}
                        </p>

                        <div className="flex items-center justify-between mt-1">
                            {/* Dots Progress */}
                            <div className="flex gap-1.5">
                                {steps.map((s, i) => (
                                    <div
                                        key={s.targetId}
                                        className={cn(
                                            "h-2.5 rounded-full border-2 border-[#1e1b4b] transition-all duration-300",
                                            i === currentStepIndex ? "w-6 bg-indigo-500" : "w-2.5 bg-indigo-200"
                                        )}
                                    />
                                ))}
                            </div>

                            {/* Nav Buttons */}
                            <div className="flex gap-2">
                                {currentStepIndex > 0 && (
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={handlePrev}
                                        className="flex h-10 w-10 items-center justify-center rounded-xl border-[3px] border-[#1e1b4b] bg-white text-[#1e1b4b] shadow-[0_4px_0_0_#1e1b4b] active:translate-y-1 active:shadow-[0_1px_0_0_#1e1b4b]"
                                    >
                                        <ArrowLeft className="h-5 w-5 stroke-[3]" />
                                    </motion.button>
                                )}
                                <motion.button
                                    whileHover={!currentStep?.nextDisabled ? { scale: 1.05 } : undefined}
                                    whileTap={!currentStep?.nextDisabled ? { scale: 0.9 } : undefined}
                                    onClick={handleNext}
                                    disabled={currentStep?.nextDisabled}
                                    className={cn(
                                        "flex h-10 px-4 items-center gap-2 rounded-xl border-[3px] border-[#1e1b4b] font-black shadow-[0_4px_0_0_#1e1b4b]",
                                        currentStep?.nextDisabled 
                                            ? "bg-gray-200 text-gray-400 cursor-not-allowed border-gray-400 shadow-none -translate-y-0"
                                            : "text-[#1e1b4b] active:translate-y-1 active:shadow-[0_1px_0_0_#1e1b4b] " + (currentStepIndex === steps.length - 1 ? "bg-[#facc15]" : "bg-indigo-300")
                                    )}
                                >
                                    {currentStepIndex === steps.length - 1 ? (
                                        <>探索启航 <Check className="h-4 w-4 stroke-[3]" /></>
                                    ) : (
                                        <>下一步 <ArrowRight className="h-4 w-4 stroke-[3]" /></>
                                    )}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
