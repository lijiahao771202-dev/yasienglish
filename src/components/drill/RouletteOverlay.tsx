"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skull, RotateCw } from 'lucide-react';

interface RouletteOverlayProps {
    onComplete: (result: 'safe' | 'dead', bulletCount: number) => void;
    onCancel: () => void;
}

type RouletteStage = 'intro' | 'loading' | 'ready' | 'spinning' | 'coasting' | 'stopped' | 'fired';

const GREED_TABLE = [
    { bullets: 0, surviveBonus: 0, jackpotMultiplier: 0 },
    { bullets: 1, surviveBonus: 10, jackpotMultiplier: 2 },
    { bullets: 2, surviveBonus: 25, jackpotMultiplier: 3 },
    { bullets: 3, surviveBonus: 50, jackpotMultiplier: 5 },
    { bullets: 4, surviveBonus: 100, jackpotMultiplier: 8 },
    { bullets: 5, surviveBonus: 200, jackpotMultiplier: 15 },
    { bullets: 6, surviveBonus: 0, jackpotMultiplier: 50 },
];

// ========================================
// REAPER WHISPERS - Death God temptations
// ========================================
const REAPER_WHISPERS = [
    "", // 0 bullets - silent
    "Yes... one is never enough...",
    "The odds favor you... for now...",
    "I can taste your fear... delicious...",
    "You're either brave or foolish... probably both...",
    "So close to the edge... one more step...",
    "All in? How... beautiful..." // 6 bullets
];

const REAPER_LOADING_TAUNTS = [
    "Come closer, mortal...",
    "Don't be shy... load another...",
    "Your hands tremble... I like that...",
    "Each bullet brings you closer to me...",
    "Fortune favors the bold... or the dead...",
];

// GLITCH TEXTS for sanity effects
const CURSED_WORDS = ["DIE", "RUN", "LIES", "VOID", "END", "PAIN", "NO", "😈"];

const GLITCH_STYLE = `
@keyframes glitch-anim-1 {
  0% { clip-path: inset(20% 0 80% 0); transform: translate(-2px, 1px); }
  20% { clip-path: inset(60% 0 10% 0); transform: translate(2px, -1px); }
  40% { clip-path: inset(40% 0 50% 0); transform: translate(-2px, 2px); }
  60% { clip-path: inset(80% 0 5% 0); transform: translate(2px, -2px); }
  80% { clip-path: inset(10% 0 70% 0); transform: translate(-1px, 1px); }
  100% { clip-path: inset(30% 0 50% 0); transform: translate(1px, -1px); }
}
@keyframes glitch-anim-2 {
  0% { clip-path: inset(10% 0 60% 0); transform: translate(2px, -1px); }
  20% { clip-path: inset(80% 0 5% 0); transform: translate(-2px, 2px); }
  40% { clip-path: inset(30% 0 20% 0); transform: translate(2px, 1px); }
  60% { clip-path: inset(15% 0 80% 0); transform: translate(-1px, -2px); }
  80% { clip-path: inset(55% 0 10% 0); transform: translate(1px, 2px); }
  100% { clip-path: inset(40% 0 30% 0); transform: translate(-2px, 1px); }
}
.glitch-text {
  position: relative;
}
.glitch-text::before,
.glitch-text::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
}
.glitch-text::before {
  left: 2px;
  text-shadow: -1px 0 #ff00c1;
  clip-path: inset(44% 0 61% 0);
  animation: glitch-anim-1 0.4s infinite linear alternate-reverse;
}
.glitch-text::after {
  left: -2px;
  text-shadow: -1px 0 #00fff9;
  clip-path: inset(44% 0 61% 0);
  animation: glitch-anim-2 0.4s infinite linear alternate-reverse;
}
`;

// ========================================
// WEB AUDIO SYNTHESIZER
// ========================================
class AudioSynthesizer {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;

        this.ctx = new AudioContextClass();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        this.masterGain.gain.value = 1.0;
    }

    resume() {
        if (this.ctx?.state === 'suspended') {
            this.ctx.resume().catch(() => { });
        }
    }

    // Soft click for UI interactions
    playClick(volume = 0.3, pitch = 1.0) {
        if (!this.ctx || !this.masterGain) return;
        this.resume();

        // Soft sine-based click
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.value = 600 * pitch;

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);

        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.04);
    }

    // Clean mechanical lock sound - satisfying "clunk"
    playLock(volume = 0.5) {
        if (!this.ctx || !this.masterGain) return;
        this.resume();

        // Low thud
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'sine';
        thud.frequency.setValueAtTime(120, this.ctx.currentTime);
        thud.frequency.exponentialRampToValueAtTime(60, this.ctx.currentTime + 0.1);
        thudGain.gain.setValueAtTime(volume * 0.7, this.ctx.currentTime);
        thudGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        thud.connect(thudGain);
        thudGain.connect(this.masterGain);
        thud.start();
        thud.stop(this.ctx.currentTime + 0.12);

        // Click overlay
        const click = this.ctx.createOscillator();
        const clickGain = this.ctx.createGain();
        click.type = 'triangle';
        click.frequency.value = 400;
        clickGain.gain.setValueAtTime(0, this.ctx.currentTime);
        clickGain.gain.linearRampToValueAtTime(volume * 0.4, this.ctx.currentTime + 0.003);
        clickGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);
        click.connect(clickGain);
        clickGain.connect(this.masterGain);
        click.start();
        click.stop(this.ctx.currentTime + 0.03);
    }

    // REAL GUNSHOT AUDIO FILE
    playBang(volume = 1.0) {
        if (!this.masterGain) return;
        this.resume();

        // Use HTML5 Audio for the real gunshot file
        const audio = new Audio('/sfx/gunshot.mp3');
        audio.volume = Math.min(1.0, volume);
        audio.play().catch(() => {
            // Fallback to synthesized if file fails
            this.playBangFallback(volume);
        });
    }

    // Fallback synthesized gunshot
    private playBangFallback(volume = 1.0) {
        if (!this.ctx || !this.masterGain) return;

        const bufferSize = this.ctx.sampleRate * 0.3;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.05));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(volume * 0.8, this.ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        noise.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start();
        noise.stop(this.ctx.currentTime + 0.3);
    }

    // Dry empty chamber click
    playEmpty(volume = 0.5) {
        if (!this.ctx || !this.masterGain) return;
        this.resume();

        // Sharp mechanical click
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.08);

        // Low thud
        const thud = this.ctx.createOscillator();
        const thudGain = this.ctx.createGain();
        thud.type = 'sine';
        thud.frequency.value = 100;
        thudGain.gain.setValueAtTime(volume * 0.3, this.ctx.currentTime);
        thudGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.06);
        thud.connect(thudGain);
        thudGain.connect(this.masterGain);
        thud.start();
        thud.stop(this.ctx.currentTime + 0.06);
    }

    // REALISTIC BULLET LOAD - Soft brass insertion + chamber seat
    playBulletLoad(volume = 0.5) {
        if (!this.ctx || !this.masterGain) return;
        this.resume();

        // Soft brass sliding sound (filtered noise)
        const slideLen = this.ctx.sampleRate * 0.08;
        const slideBuffer = this.ctx.createBuffer(1, slideLen, this.ctx.sampleRate);
        const slideData = slideBuffer.getChannelData(0);
        for (let i = 0; i < slideLen; i++) {
            slideData[i] = (Math.random() * 2 - 1) * 0.3 * (1 - i / slideLen);
        }
        const slide = this.ctx.createBufferSource();
        slide.buffer = slideBuffer;
        const slideFilter = this.ctx.createBiquadFilter();
        slideFilter.type = 'bandpass';
        slideFilter.frequency.value = 2000;
        slideFilter.Q.value = 2;
        const slideGain = this.ctx.createGain();
        slideGain.gain.value = volume * 0.4;
        slide.connect(slideFilter);
        slideFilter.connect(slideGain);
        slideGain.connect(this.masterGain);
        slide.start();
        slide.stop(this.ctx.currentTime + 0.08);

        // Chamber seat "thunk" (delayed)
        const t = this.ctx.currentTime + 0.06;
        const seat = this.ctx.createOscillator();
        const seatGain = this.ctx.createGain();
        seat.type = 'sine';
        seat.frequency.setValueAtTime(180, t);
        seat.frequency.exponentialRampToValueAtTime(80, t + 0.05);
        seatGain.gain.setValueAtTime(0, t);
        seatGain.gain.linearRampToValueAtTime(volume * 0.6, t + 0.005);
        seatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        seat.connect(seatGain);
        seatGain.connect(this.masterGain);
        seat.start(t);
        seat.stop(t + 0.08);

        // Metallic ring (high frequency resonance)
        const ring = this.ctx.createOscillator();
        const ringGain = this.ctx.createGain();
        ring.type = 'sine';
        ring.frequency.value = 1200;
        ringGain.gain.setValueAtTime(0, t);
        ringGain.gain.linearRampToValueAtTime(volume * 0.15, t + 0.003);
        ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        ring.connect(ringGain);
        ringGain.connect(this.masterGain);
        ring.start(t);
        ring.stop(t + 0.15);
    }


    // Store current heartbeat config for dynamic updates
    private heartbeatVolume = 0.4;
    private heartbeatBpm = 80;

    startHeartbeat(bpm = 80, volume = 0.4) {
        if (!this.ctx || !this.masterGain) return;
        this.resume();
        this.stopHeartbeat();

        this.heartbeatVolume = volume;
        this.heartbeatBpm = bpm;

        const beat = () => {
            if (!this.ctx || !this.masterGain) return;

            const playBeat = (delay: number, freq: number, vol: number) => {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();

                osc.type = 'sine';
                osc.frequency.value = freq;

                const t = this.ctx!.currentTime + delay;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(vol * this.heartbeatVolume, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

                osc.connect(gain);
                gain.connect(this.masterGain!);

                osc.start(t);
                osc.stop(t + 0.15);
            };

            playBeat(0, 60, 1.0);
            playBeat(0.12, 50, 0.7);
        };

        beat();
        this.heartbeatInterval = setInterval(beat, (60 / this.heartbeatBpm) * 1000);
    }

    // Update heartbeat intensity dynamically
    setHeartbeatIntensity(volume: number, bpm?: number) {
        this.heartbeatVolume = Math.min(1.0, volume);
        if (bpm) {
            this.heartbeatBpm = bpm;
            // Restart with new BPM
            if (this.heartbeatInterval) {
                this.stopHeartbeat();
                this.startHeartbeat(this.heartbeatBpm, this.heartbeatVolume);
            }
        }
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    setMasterVolume(vol: number) {
        if (this.masterGain && this.ctx) {
            this.masterGain.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + 0.1);
        }
    }

    dispose() {
        this.stopHeartbeat();
        this.ctx?.close();
        this.ctx = null;
    }
}

export function RouletteOverlay({ onComplete, onCancel }: RouletteOverlayProps) {
    const [stage, setStage] = useState<RouletteStage>('intro');

    const rotation = useMotionValue(0);
    const velocityRef = useRef(0);
    const [isHolding, setIsHolding] = useState(false);
    const animationFrameRef = useRef<number>(0);
    const stopAnimationRef = useRef<(() => void) | null>(null);

    const zoomLevel = useMotionValue(1);
    const grayLevel = useMotionValue(0);
    const shakeIntensity = useMotionValue(0);

    const [chambers, setChambers] = useState<boolean[]>([false, false, false, false, false, false]);
    const [result, setResult] = useState<'safe' | 'dead' | null>(null);
    const [nearDeath, setNearDeath] = useState(false);
    const [reaperWhisper, setReaperWhisper] = useState<string>("");

    const synthRef = useRef<AudioSynthesizer | null>(null);

    useEffect(() => {
        synthRef.current = new AudioSynthesizer();
        synthRef.current.init();

        return () => {
            synthRef.current?.dispose();
            cancelAnimationFrame(animationFrameRef.current);
            stopAnimationRef.current?.();
        };
    }, []);

    const lastTickRef = useRef(0);

    useEffect(() => {
        const updatePhysics = () => {
            if (stage === 'spinning' && isHolding) {
                velocityRef.current = Math.min(velocityRef.current + 2, 80);
                rotation.set(rotation.get() + velocityRef.current);
            }

            const currentRot = rotation.get();
            if (Math.floor(currentRot / 60) !== Math.floor(lastTickRef.current / 60)) {
                if (velocityRef.current > 0) {
                    const pitch = 0.8 + (Math.abs(velocityRef.current) / 80) * 0.6;
                    const vol = Math.min(0.6, Math.abs(velocityRef.current) / 60);
                    synthRef.current?.playClick(vol, pitch);
                }
                lastTickRef.current = currentRot;
            }

            if (stage === 'coasting') {
                const vel = Math.abs(velocityRef.current);
                if (vel < 20) {
                    const t = 1 - (vel / 20);
                    zoomLevel.set(1 + t * 0.3);
                    grayLevel.set(t * 100);
                }
            }

            if (stage === 'spinning') {
                animationFrameRef.current = requestAnimationFrame(updatePhysics);
            }
        };

        if (stage === 'spinning') {
            animationFrameRef.current = requestAnimationFrame(updatePhysics);
        }

        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [stage, isHolding, rotation, zoomLevel, grayLevel]);

    const startLoading = () => {
        setStage('loading');
        synthRef.current?.resume();
        synthRef.current?.startHeartbeat(70, 0.3);
    };

    const finishLoading = () => {
        if (chambers.some(b => b)) {
            setStage('ready');
            animate(rotation, 0, { duration: 0.5 });
            synthRef.current?.playLock(0.8);
        }
    };

    const toggleBullet = (index: number) => {
        if (stage !== 'loading') return;

        setChambers(prev => {
            const next = [...prev];
            next[index] = !next[index];

            const newCount = next.filter(Boolean).length;

            // AUDIO: Different sounds for add vs remove
            if (next[index]) {
                // Bullet added - heavy metallic sound
                synthRef.current?.playBulletLoad(0.6 + newCount * 0.1);
                setReaperWhisper(REAPER_WHISPERS[newCount] || REAPER_LOADING_TAUNTS[Math.floor(Math.random() * REAPER_LOADING_TAUNTS.length)]);
            } else {
                // Bullet removed - light click
                synthRef.current?.playClick(0.3, 1.5);
                setReaperWhisper(newCount > 0 ? "Running away? How... disappointing..." : "");
            }

            // DYNAMIC HEARTBEAT: Louder and faster with more bullets
            const heartbeatVolume = 0.2 + newCount * 0.15; // 0.2 -> 1.1
            const heartbeatBpm = 60 + newCount * 15; // 60 -> 150 BPM
            synthRef.current?.setHeartbeatIntensity(heartbeatVolume, heartbeatBpm);

            return next;
        });
    };

    const handlePointerDown = () => {
        if (stage !== 'ready') return;
        synthRef.current?.resume();
        setStage('spinning');
        setIsHolding(true);
        velocityRef.current = 5;
    };

    const handlePointerUp = () => {
        if (stage !== 'spinning') return;
        setIsHolding(false);
        setStage('coasting');

        const currentRot = rotation.get();
        const currentVel = velocityRef.current;

        const inertiaPower = currentVel * 20;
        const targetRaw = currentRot + inertiaPower;
        const snapTarget = Math.round(targetRaw / 60) * 60;

        // Calculate how many chambers we'll pass
        const chambersToPass = Math.abs(snapTarget - currentRot) / 60;

        // DRAMATIC SLOWDOWN: Very low stiffness, high damping for agonizing crawl
        stopAnimationRef.current = animate(rotation, snapTarget, {
            type: "spring" as const,
            damping: 35,        // Higher = slower deceleration
            stiffness: 15,      // Lower = much slower movement
            restDelta: 0.01,
            onUpdate: (v) => {
                const remaining = Math.abs(snapTarget - v);
                const progress = 1 - (remaining / (chambersToPass * 60));

                // DRAMATIC ZOOM: 1.0 -> 1.5 as we approach final position
                const zoomProgress = Math.pow(progress, 2); // Exponential curve
                zoomLevel.set(1 + zoomProgress * 0.5);

                // GRAYSCALE intensifies
                grayLevel.set(zoomProgress * 100);

                // Tick sounds get slower and louder near the end
                if (Math.floor(v / 60) !== Math.floor(lastTickRef.current / 60)) {
                    const loudness = 0.3 + progress * 0.5;
                    const pitch = 0.9 - progress * 0.3; // Lower pitch = more tension
                    synthRef.current?.playClick(loudness, pitch);
                    lastTickRef.current = v;
                }
            },
            onComplete: () => {
                velocityRef.current = 0;
                handleStopAndAutoFire();
            }
        }).stop;
    };

    const handleStopAndAutoFire = () => {
        setStage('stopped');

        synthRef.current?.stopHeartbeat();
        synthRef.current?.setMasterVolume(0);
        synthRef.current?.playLock(1.0);

        setTimeout(() => {
            synthRef.current?.setMasterVolume(1.0);
            executeFire();
        }, 1500);
    };

    const executeFire = () => {
        const finalDeg = rotation.get();
        let normalizedDeg = finalDeg % 360;
        if (normalizedDeg < 0) normalizedDeg += 360;

        const steps = Math.round(normalizedDeg / 60);
        const activeIndex = (6 - (steps % 6)) % 6;

        const isDead = chambers[activeIndex];

        // Near Death Check
        const nextIndex = (activeIndex + 1) % 6;
        if (!isDead && chambers[nextIndex]) {
            setNearDeath(true);
        }

        setResult(isDead ? 'dead' : 'safe');
        setStage('fired');

        if (isDead) {
            synthRef.current?.playBang(1.0);
            // Camera Shake
            shakeIntensity.set(20);
            animate(shakeIntensity, 0, { duration: 0.5 });
        } else {
            synthRef.current?.playEmpty(0.8);
        }

        setTimeout(() => {
            onComplete(isDead ? 'dead' : 'safe', bulletCount);
        }, isDead ? 2000 : 1500);
    };

    const bulletCount = chambers.filter(Boolean).length;
    const riskLevel = bulletCount / 6;

    // Shake Animation
    const shakeX = useTransform(shakeIntensity, (v) => (Math.random() - 0.5) * v);
    const shakeY = useTransform(shakeIntensity, (v) => (Math.random() - 0.5) * v);

    // ========================================
    // SANITY & GLITCH SYSTEM
    // ========================================
    const [glitchActive, setGlitchActive] = useState(false);
    const [uiDistortion, setUiDistortion] = useState({ x: 0, y: 0, skew: 0, scale: 1 });
    const [spinText, setSpinText] = useState("SPIN");
    const [cancelText, setCancelText] = useState("GIVE UP");

    useEffect(() => {
        if (riskLevel === 0) return;

        // Glitch loop
        const interval = setInterval(() => {
            const roll = Math.random();
            const threshold = riskLevel * 0.15; // Max 15% chance per tick

            if (roll < threshold) {
                // TRIGGER GLITCH
                setGlitchActive(true);
                setUiDistortion({
                    x: (Math.random() - 0.5) * 20,
                    y: (Math.random() - 0.5) * 20,
                    skew: (Math.random() - 0.5) * 10,
                    scale: 1 + (Math.random() - 0.5) * 0.1
                });

                // Corrupt text
                if (Math.random() > 0.5) {
                    setSpinText(CURSED_WORDS[Math.floor(Math.random() * CURSED_WORDS.length)]);
                }
                if (Math.random() > 0.7) {
                    setCancelText(Math.random() > 0.5 ? "NO ESCAPE" : "COWARD");
                }

                // Reset quickly
                setTimeout(() => {
                    setGlitchActive(false);
                    setUiDistortion({ x: 0, y: 0, skew: 0, scale: 1 });
                    setSpinText("SPIN");
                    setCancelText("GIVE UP");
                }, 100 + Math.random() * 200);
            }
        }, 1000); // Check every second

        return () => clearInterval(interval);
    }, [riskLevel]);

    // Dizzy/Drunk Effect based on risk
    const time = useMotionValue(0);

    // Animate time/wobble loop
    useEffect(() => {
        const animation = animate(time, 100, {
            duration: 10,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "linear"
        });
        return animation.stop;
    }, []);

    const dizzyRotate = useTransform(time, [0, 100], [-1 * riskLevel * 3, 1 * riskLevel * 3]);
    const dizzyScale = useTransform(time, [0, 50, 100], [1, 1 + riskLevel * 0.05, 1]);

    // Persistent blur based on risk (0px to 4px) + mild pulsing
    const blurAmount = useTransform(time, [0, 50, 100], [riskLevel * 2, riskLevel * 4, riskLevel * 2]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-xl font-sans select-none overflow-hidden"
            style={{
                x: shakeX,
                y: shakeY,
                rotate: dizzyRotate,
                scale: dizzyScale,
                filter: useTransform(blurAmount, v => `blur(${v}px)`), // Dynamic Blur
            }}
        >
            <style>{GLITCH_STYLE}</style>

            {/* Permanent Chromatic Aberration at high risk */}
            {riskLevel > 0.3 && (
                <motion.div
                    className="absolute inset-0 z-[150] pointer-events-none mix-blend-screen opacity-30"
                    animate={{
                        x: [2, -2, 2],
                        opacity: [0.2, 0.4 * riskLevel, 0.2]
                    }}
                    transition={{ duration: 2 / (riskLevel + 0.1), repeat: Infinity }}
                >
                    <div className="absolute inset-0 bg-red-500/10 translate-x-[3px]" />
                    <div className="absolute inset-0 bg-blue-500/10 translate-x-[-3px]" />
                </motion.div>
            )}

            {/* GLITCH OVERLAY - CHROMATIC ABERRATION (Transient) */}
            {glitchActive && (
                <div className="absolute inset-0 z-[200] pointer-events-none mix-blend-screen opacity-50">
                    <div className="absolute inset-0 bg-red-500/20 translate-x-[2px] translate-y-[-2px]" />
                    <div className="absolute inset-0 bg-blue-500/20 translate-x-[-2px] translate-y-[2px]" />
                </div>
            )}

            {/* TUNNEL VISION / VIGNETTE - Intensifies with risk */}
            <motion.div
                className="absolute inset-0 z-[180] pointer-events-none shadow-[inset_0_0_150px_rgba(0,0,0,1)]"
                animate={{
                    boxShadow: `inset 0 0 ${100 + riskLevel * 300}px ${50 + riskLevel * 100}px rgba(0,0,0,${0.5 + riskLevel * 0.5})`
                }}
                transition={{ duration: 1 }}
            />

            {/* GHOSTING / DOUBLE VISION - Only at high risk */}
            {riskLevel > 0.5 && (
                <motion.div
                    className="absolute inset-0 z-[170] pointer-events-none opacity-20"
                    animate={{
                        x: [0, 5 * riskLevel, -5 * riskLevel, 0],
                        y: [0, -3 * riskLevel, 3 * riskLevel, 0],
                        filter: `blur(${riskLevel * 10}px)`
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    style={{ scale: 1.05 }}
                >
                    {/* Cloning the main content for a ghostly afterimage would be expensive, 
                        so we use a radial gradient that feels like a 'blur' or 'glare' shift */}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
                </motion.div>
            )}

            <motion.div
                animate={{
                    x: uiDistortion.x,
                    y: uiDistortion.y,
                    skewX: uiDistortion.skew,
                    scale: uiDistortion.scale
                }}
                transition={{ duration: 0.1 }}
                className={cn("relative w-full h-full flex items-center justify-center", glitchActive && "filter contrast-150 saturate-150")}
            >
                <div
                    className="absolute inset-0 z-0 pointer-events-none"
                    style={{
                        filter: `grayscale(${grayLevel.get()}%) brightness(${100 - grayLevel.get() * 0.2}%)`
                    }}
                >
                    <motion.div
                        className="absolute inset-0 z-0 pointer-events-none"
                        style={{ filter: useTransform(grayLevel, v => `grayscale(${v}%) brightness(${100 - v * 0.2}%)`) }}
                    >
                        <motion.div
                            animate={{ opacity: 0.1 + riskLevel * 0.4 }}
                            className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(150,0,0,0.5)_100%)]"
                        />
                    </motion.div>
                </div>

                {/* BLOOD VEINS OVERLAY - EXTREME HORROR VERSION */}
                <motion.div
                    className="absolute inset-0 z-[1] pointer-events-none"
                    animate={{ opacity: 0.3 + riskLevel * 0.7 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* SVG Blood Veins - All 4 corners */}
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {/* Top-left veins */}
                        <motion.path
                            d="M0,0 Q10,15 5,30 Q2,40 8,50"
                            stroke="rgba(180,0,0,0.9)"
                            strokeWidth={0.3 + riskLevel * 0.5}
                            fill="none"
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                        />
                        <motion.path
                            d="M0,0 Q15,10 25,8 Q35,5 45,12"
                            stroke="rgba(150,0,0,0.8)"
                            strokeWidth={0.2 + riskLevel * 0.4}
                            fill="none"
                            animate={{ opacity: [0.5, 0.9, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                        />
                        <motion.path
                            d="M0,5 Q8,12 12,25 Q15,35 10,45"
                            stroke="rgba(200,20,20,0.7)"
                            strokeWidth={0.15 + riskLevel * 0.3}
                            fill="none"
                            animate={{ opacity: [0.4, 0.8, 0.4] }}
                            transition={{ duration: 1.8, repeat: Infinity, delay: 0.5 }}
                        />
                        {/* Branch veins */}
                        <path d="M5,15 Q10,18 15,15" stroke="rgba(120,0,0,0.6)" strokeWidth="0.1" fill="none" />
                        <path d="M8,25 Q12,30 18,28" stroke="rgba(120,0,0,0.5)" strokeWidth="0.08" fill="none" />

                        {/* Top-right veins */}
                        <motion.path
                            d="M100,0 Q90,15 95,30 Q98,40 92,50"
                            stroke="rgba(180,0,0,0.9)"
                            strokeWidth={0.3 + riskLevel * 0.5}
                            fill="none"
                            animate={{ opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 1.3, repeat: Infinity, delay: 0.2 }}
                        />
                        <motion.path
                            d="M100,0 Q85,10 75,8 Q65,5 55,12"
                            stroke="rgba(150,0,0,0.8)"
                            strokeWidth={0.2 + riskLevel * 0.4}
                            fill="none"
                            animate={{ opacity: [0.5, 0.9, 0.5] }}
                            transition={{ duration: 1.7, repeat: Infinity }}
                        />
                        <path d="M95,15 Q90,18 85,15" stroke="rgba(120,0,0,0.6)" strokeWidth="0.1" fill="none" />

                        {/* Bottom-left veins */}
                        <motion.path
                            d="M0,100 Q10,85 5,70 Q2,60 8,50"
                            stroke="rgba(180,0,0,0.9)"
                            strokeWidth={0.3 + riskLevel * 0.5}
                            fill="none"
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 1.6, repeat: Infinity, delay: 0.4 }}
                        />
                        <motion.path
                            d="M0,100 Q15,90 25,92 Q35,95 45,88"
                            stroke="rgba(150,0,0,0.8)"
                            strokeWidth={0.2 + riskLevel * 0.4}
                            fill="none"
                            animate={{ opacity: [0.5, 0.9, 0.5] }}
                            transition={{ duration: 1.9, repeat: Infinity, delay: 0.1 }}
                        />

                        {/* Bottom-right veins */}
                        <motion.path
                            d="M100,100 Q90,85 95,70 Q98,60 92,50"
                            stroke="rgba(180,0,0,0.9)"
                            strokeWidth={0.3 + riskLevel * 0.5}
                            fill="none"
                            animate={{ opacity: [0.7, 1, 0.7] }}
                            transition={{ duration: 1.4, repeat: Infinity, delay: 0.3 }}
                        />
                        <motion.path
                            d="M100,100 Q85,90 75,92 Q65,95 55,88"
                            stroke="rgba(150,0,0,0.8)"
                            strokeWidth={0.2 + riskLevel * 0.4}
                            fill="none"
                            animate={{ opacity: [0.5, 0.9, 0.5] }}
                            transition={{ duration: 2.1, repeat: Infinity }}
                        />
                    </svg>

                    {/* Edge blood glow */}
                    <div className="absolute inset-0">
                        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-red-900/60 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-red-900/60 to-transparent" />
                        <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-red-900/60 to-transparent" />
                        <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-red-900/60 to-transparent" />
                    </div>

                    {/* Pulsing blood vignette */}
                    <motion.div
                        animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.02, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_30%,rgba(100,0,0,0.7)_100%)]"
                    />

                    {/* Dripping blood effect at high risk */}
                    {bulletCount >= 4 && (
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: "30%" }}
                            transition={{ duration: 2 }}
                            className="absolute top-0 left-[20%] w-1 bg-gradient-to-b from-red-700 to-transparent rounded-b-full"
                        />
                    )}
                    {bulletCount >= 5 && (
                        <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: "25%" }}
                            transition={{ duration: 2.5, delay: 0.5 }}
                            className="absolute top-0 right-[30%] w-1 bg-gradient-to-b from-red-800 to-transparent rounded-b-full"
                        />
                    )}
                </motion.div>

                {/* REAPER WHISPER DISPLAY */}
                <AnimatePresence mode="wait">
                    {reaperWhisper && stage === 'loading' && (
                        <motion.div
                            key={reaperWhisper}
                            initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
                            transition={{ duration: 0.5 }}
                            className="absolute bottom-32 left-0 right-0 z-20 flex justify-center pointer-events-none"
                        >
                            <div className="relative px-8 py-4 max-w-md">
                                {/* Creepy text effect */}
                                <p className="text-red-400/90 text-lg italic font-serif text-center tracking-wide"
                                    style={{
                                        textShadow: "0 0 10px rgba(255,0,0,0.5), 0 0 20px rgba(150,0,0,0.3)",
                                        fontFamily: "Georgia, serif"
                                    }}
                                >
                                    "{reaperWhisper}"
                                </p>
                                {/* Decorative skull */}
                                <div className="absolute -left-4 top-1/2 -translate-y-1/2 opacity-30">
                                    <Skull className="w-6 h-6 text-red-600" />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>


                <AnimatePresence mode="wait">
                    {stage === 'intro' && (
                        <motion.div
                            key="intro"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
                            className="relative z-10 flex flex-col items-center gap-8"
                        >
                            <div className="flex flex-col items-center gap-4">
                                <Skull className="w-20 h-20 text-red-600 animate-pulse" />
                                <h1 className="text-5xl font-black text-white tracking-tighter uppercase leading-none">
                                    Russian <span className="text-red-600">Roulette</span>
                                </h1>
                                <p className="text-stone-400 font-mono text-sm tracking-widest">CINEMATIC MODE</p>
                            </div>

                            <div className="w-full bg-stone-900/50 border border-stone-800 rounded-xl p-4 text-left max-w-sm">
                                <div className="grid grid-cols-3 gap-2 text-xs font-mono mb-2 border-b border-stone-800 pb-2">
                                    <div className="text-stone-500">LOAD</div>
                                    <div className="text-emerald-500">SURVIVE</div>
                                    <div className="text-amber-500">JACKPOT</div>
                                </div>
                                {GREED_TABLE.slice(1, 6).map(row => (
                                    <div key={row.bullets} className="grid grid-cols-3 gap-2 text-xs font-mono text-stone-300">
                                        <div>{row.bullets} Bullet{row.bullets > 1 ? 's' : ''}</div>
                                        <div className="text-emerald-400">+{row.surviveBonus}</div>
                                        <div className="text-amber-400">x{row.jackpotMultiplier}</div>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={startLoading}
                                className="px-12 py-4 bg-red-700 hover:bg-red-600 text-white font-black tracking-widest uppercase rounded-full shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all active:scale-95"
                            >
                                ENTER
                            </button>
                        </motion.div>
                    )}

                    {stage !== 'intro' && (
                        <motion.div
                            key="game"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="relative z-10 flex flex-col items-center justify-center gap-12"
                            style={{ scale: zoomLevel }}
                        >
                            <div className="text-center h-16">
                                <h2 className={cn(
                                    "text-sm font-mono tracking-[0.3em] font-bold uppercase transition-colors duration-300",
                                    glitchActive ? "glitch-text text-red-500" : (
                                        stage === 'loading' ? "text-stone-400" :
                                            stage === 'spinning' ? "text-amber-500 animate-pulse" :
                                                stage === 'coasting' ? "text-amber-300" :
                                                    stage === 'stopped' ? "text-red-500 drop-shadow-[0_0_10px_red]" :
                                                        "text-stone-500"
                                    )
                                )}
                                    data-text={glitchActive ? spinText : undefined}
                                >
                                    {glitchActive ? spinText : (
                                        stage === 'loading' ? 'LOAD CHAMBERS' :
                                            stage === 'ready' ? 'HOLD TO SPIN' :
                                                stage === 'spinning' ? 'ACCELERATING...' :
                                                    stage === 'coasting' ? 'PRAYING...' :
                                                        stage === 'stopped' ? 'JUDGEMENT' :
                                                            stage === 'fired' && result === 'dead' ? 'FATAL' : 'SURVIVED'
                                    )}
                                </h2>
                                {stage === 'loading' && (
                                    <div className="text-2xl font-black text-white mt-2">
                                        Risk: <span className={riskLevel > 0.5 ? "text-red-500" : "text-emerald-500"}>{Math.round(riskLevel * 100)}%</span>
                                    </div>
                                )}
                            </div>

                            <div className="relative w-80 h-80">
                                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-8 h-12 z-30 flex justify-center items-end">
                                    <div className="w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[20px] border-t-red-600 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]" />
                                </div>

                                <motion.div
                                    className="w-full h-full rounded-full bg-[#151515] border-[12px] border-[#0a0a0a] shadow-2xl relative"
                                    style={{ rotate: rotation }}
                                >
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-[#222] border-4 border-[#080808] z-20 shadow-inner flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-black/50" />
                                    </div>

                                    {[0, 1, 2, 3, 4, 5].map((i) => (
                                        <div
                                            key={i}
                                            onClick={() => toggleBullet(i)}
                                            className={cn(
                                                "absolute w-20 h-20 -ml-10 -mt-10 top-1/2 left-1/2 rounded-full border-2 transition-all flex items-center justify-center",
                                                stage === 'loading' ? "cursor-pointer hover:border-stone-500 bg-black" : "bg-black border-stone-800",
                                                chambers[i] && stage === 'loading' ? "border-amber-600" : "border-stone-900"
                                            )}
                                            style={{ transform: `rotate(${i * 60}deg) translateY(-100px) rotate(-${i * 60}deg)` }}
                                        >
                                            {chambers[i] && (
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-red-900 shadow-inner relative"
                                                >
                                                    <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.4),transparent)]" />
                                                </motion.div>
                                            )}
                                        </div>
                                    ))}
                                </motion.div>
                            </div>

                            <div className="h-24 w-full flex justify-center items-center">
                                {stage === 'loading' ? (
                                    <button
                                        onClick={finishLoading}
                                        disabled={bulletCount === 0}
                                        className={cn(
                                            "px-8 py-3 bg-stone-800 text-stone-200 font-bold rounded-lg border border-stone-700 hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all",
                                            glitchActive && "glitch-text text-red-500 border-red-500 animate-bounce"
                                        )}
                                        data-text={glitchActive ? "D I E" : undefined}
                                    >
                                        {glitchActive ? "D I E" : (bulletCount === 0 ? "LOAD BULLET" : "LOCK & LOAD")}
                                    </button>
                                ) : (stage === 'ready' || stage === 'spinning' || stage === 'coasting') ? (
                                    <button
                                        onPointerDown={handlePointerDown}
                                        onPointerUp={handlePointerUp}
                                        onPointerLeave={handlePointerUp}
                                        disabled={stage === 'coasting'}
                                        className={cn(
                                            "w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all select-none touch-none",
                                            stage === 'spinning'
                                                ? "bg-red-600 border-red-400 scale-110 shadow-[0_0_50px_rgba(220,38,38,0.8)]"
                                                : stage === 'coasting'
                                                    ? "bg-stone-800 border-stone-700 opacity-50 cursor-not-allowed"
                                                    : "bg-stone-800 border-stone-600 hover:border-stone-400 active:scale-95"
                                        )}
                                    >
                                        <RotateCw className={cn("w-10 h-10 text-white", stage === 'spinning' && "animate-spin")} />
                                    </button>
                                ) : stage === 'stopped' ? (
                                    <div className="text-red-500 font-mono tracking-widest animate-pulse text-xl">...</div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="text-4xl font-black uppercase">
                                            {result === 'dead' ? <span className="text-red-600 drop-shadow-[0_0_20px_rgba(255,0,0,1)]">BANG</span> : <span className="text-emerald-500">*CLICK*</span>}
                                        </div>
                                        {nearDeath && result === 'safe' && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                className="text-amber-500 font-mono text-sm tracking-widest"
                                            >
                                                💀 NEAR DEATH
                                            </motion.div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="h-6 text-xs font-mono text-stone-600 uppercase tracking-widest">
                                {stage === 'ready' && "Hold Button to Spin • Release to Stop"}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Blood Mist on Death */}
                <AnimatePresence>
                    {stage === 'fired' && result === 'dead' && (
                        <>
                            <motion.div
                                initial={{ opacity: 1 }}
                                animate={{ opacity: 0 }}
                                transition={{ duration: 0.1 }}
                                className="absolute inset-0 bg-white z-[200] pointer-events-none"
                            />
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 0.8, 0.4] }}
                                transition={{ duration: 1.5 }}
                                className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(200,0,0,0.6)_0%,transparent_70%)] z-[199] pointer-events-none"
                            />
                        </>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}

export default RouletteOverlay;
