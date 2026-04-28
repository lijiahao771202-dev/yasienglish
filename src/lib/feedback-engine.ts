import confetti from 'canvas-confetti';

// --- Web Audio API Synthesizer ---
let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
};

export const TYPING_SOUND_THEMES = [
    { id: 'classic', name: '经典机械轴' },
    { id: 'topre', name: '静电容绵软' },
    { id: 'bubble', name: '清脆水滴泡泡' },
    { id: 'woodblock', name: '温暖木鱼/马林巴' },
    { id: 'glass', name: '清脆玻璃敲击' },
    { id: 'laser', name: '科幻脉冲光束' },
    { id: '8bit', name: '复古红白机 8-Bit' },
    { id: 'typewriter', name: '老式机械打字机' },
    { id: 'synthpluck', name: '电子拨弹合成器' },
    { id: 'snap', name: '沉稳厚重脆响' },
    { id: 'jelly', name: 'Q弹果冻' }
];

export const playPopSound = (combo: number = 0) => {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Get theme, fallback to 'classic'
    const theme = window.localStorage.getItem('yasi_typing_sound_theme') || 'classic';
    const isCombo = combo > 0;
    
    // Switch between 11 synth formulas
    switch (theme) {
        case 'classic': {
            // 1. The percussive mechanical "click/thwack"
            const clickOsc = ctx.createOscillator();
            const clickGain = ctx.createGain();
            clickOsc.type = 'triangle'; 
            clickOsc.frequency.setValueAtTime(800, ctx.currentTime);
            clickOsc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.03); 
            clickGain.gain.setValueAtTime(0, ctx.currentTime);
            clickGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.005); 
            clickGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
            clickOsc.connect(clickGain);
            clickGain.connect(ctx.destination);
            clickOsc.start(ctx.currentTime);
            clickOsc.stop(ctx.currentTime + 0.05);

            // Classic keeps the pitch-up combo effect as the user requested
            if (isCombo) {
                const pitchMultiplier = Math.pow(1.059463, combo * 1.5);
                const toneOsc = ctx.createOscillator();
                const toneGain = ctx.createGain();
                toneOsc.type = 'sine'; 
                toneOsc.frequency.setValueAtTime(440 * pitchMultiplier, ctx.currentTime);
                toneGain.gain.setValueAtTime(0, ctx.currentTime);
                toneGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
                toneGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                toneOsc.connect(toneGain);
                toneGain.connect(ctx.destination);
                toneOsc.start(ctx.currentTime);
                toneOsc.stop(ctx.currentTime + 0.25);
            }
            break;
        }

        case 'topre': {
            // 2. Topre Soft (muffled bassy thock)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            // Combo effect: The filter gradually opens up, making the sound "crisper" rather than higher pitched
            filter.frequency.value = 600 + (Math.min(combo, 15) * 60);

            osc.type = 'sine';
            // Fixed base frequency
            const baseFreq = 220;
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.05);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            // Combo effect: slightly punchier attack
            const punch = Math.min(1.0, 0.6 + (combo * 0.02));
            gain.gain.linearRampToValueAtTime(punch, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
            break;
        }

        case 'bubble': {
            // 3. Bubble Drop
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            
            // Combo effect: Bubble gets "bigger" (higher end frequency target)
            const startFreq = 300;
            const endFreq = 800 + (Math.min(combo, 20) * 40);
            
            osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.08);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
            break;
        }

        case 'woodblock': {
            // 4. Woodblock / Marimba
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine'; 
            
            // Combo effect: Alternate slightly between left and right hand strikes for realism
            const baseFreq = 500 + (combo % 2 === 0 ? 15 : -15);
            
            osc.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(baseFreq, ctx.currentTime + 0.01);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.06);
            break;
        }

        case 'glass': {
            // 5. Glass Tap (multiple high frequency sine waves)
            // Combo effect: Wind-chime randomization. The pitches shift chaotically but harmonically
            const baseNotes = [1200, 1350, 1500, 1800, 2025, 2400];
            const startNote = baseNotes[combo % baseNotes.length];
            
            [startNote, startNote * 1.5, startNote * 2.1].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                // Add a little detune for glassy texture
                osc.frequency.setValueAtTime(freq + (Math.random() * 20 - 10), ctx.currentTime);
                
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.15 - (idx * 0.05), ctx.currentTime + 0.001);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); 
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
            });
            break;
        }

        case 'laser': {
            // 6. Sci-Fi Laser
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            
            // Combo effect: Laser frequency starts more chaotic as you shoot faster
            const startFreq = 2000 + (Math.random() * combo * 20);
            const endFreq = 200;
            
            osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.06);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.08);
            break;
        }

        case '8bit': {
            // 7. 8-Bit Retro 
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            
            // Combo effect: Arpeggiator climbing instead of sliding pitch (Mario coin style)
            const arpeggio = [440, 523.25, 659.25, 880]; // A4, C5, E5, A5
            const baseFreq = arpeggio[combo % arpeggio.length];
            
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.setValueAtTime(baseFreq * 1.2, ctx.currentTime + 0.02);
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime + 0.04);

            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime + 0.06);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.06);
            break;
        }

        case 'typewriter': {
            // 8. Typewriter clack
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            
            // Combo effect: Slight randomization to simulate mechanical parts
            const mechanicallyVary = Math.random() * 200 - 100;
            osc.frequency.setValueAtTime(1500 + mechanicallyVary, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.02);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.04);

            // Combo effect: Ring the typewriter bell on every 10th successful hit
            if (isCombo && combo > 0 && combo % 10 === 0) {
                const dingOsc = ctx.createOscillator();
                const dingGain = ctx.createGain();
                dingOsc.type = 'sine';
                dingOsc.frequency.setValueAtTime(1200, ctx.currentTime);
                dingGain.gain.setValueAtTime(0, ctx.currentTime);
                dingGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.005);
                dingGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                dingOsc.connect(dingGain);
                dingGain.connect(ctx.destination);
                dingOsc.start(ctx.currentTime);
                dingOsc.stop(ctx.currentTime + 0.6);
            }
            break;
        }

        case 'synthpluck': {
            // 9. Synth Pluck 
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(330, ctx.currentTime); // Fixed pitch
            
            filter.type = 'lowpass';
            // Combo effect: The pluck's filter snaps harder and higher as combo grows
            const filterSnap = Math.min(5000, 2000 + (combo * 150));
            filter.frequency.setValueAtTime(filterSnap, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
            break;
        }

        case 'snap': {
            // 10. Acoustic Snap 
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            
            // Combo effect: Ramp down faster to make the snap tighter
            const sweepTime = Math.max(0.02, 0.04 - (combo * 0.001));
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + sweepTime);

            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.07);
            break;
        }

        case 'jelly': {
            // 11. Jelly / Boing
            // Refined to match the satisfying fast "bubble pop" of the token click
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            
            // Base pitch starts around 400, combo adds a little ascending tension
            const baseFreq = 400 + (combo % 5) * 20;
            const peakFreq = 1200 + (combo % 5) * 50;
            
            osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(peakFreq, ctx.currentTime + 0.04);
            
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.005); // slightly louder than pick for typing
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
            break;
        }
    }
};

/**
 * Plays a fast, magical glissando/harp arpeggio for block completion
 */
export const playSuccessSound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Magical rising sequence (C5, E5, G5, B5, C6)
    const freqs = [523.25, 659.25, 783.99, 987.77, 1046.50];
    
    freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.type = 'sine';
        
        const startTime = ctx.currentTime + (i * 0.035); // Super fast 35ms steps!
        
        osc.frequency.setValueAtTime(freq, startTime);
        // Delightful little pitch bend up
        osc.frequency.exponentialRampToValueAtTime(freq * 1.05, startTime + 0.3);

        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.5);
    });
};



/**
 * Plays a soft, deep low-frequency thump for errors
 */
export const playErrorSound = () => {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine'; 
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.15); // Deep slide

    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
};

// --- Confetti Visual System ---

/**
 * Normalizes client coordinates to confetti screen percentages
 */
const getOriginFromRect = (rect?: DOMRect) => {
    if (!rect) return { x: 0.5, y: 0.5 };
    return {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
    };
};

/**
 * Shoots a sharp, vibrant burst of particles that intensifies with high combos
 */
export const shootMiniConfetti = (rect?: DOMRect, combo: number = 0) => {
    const origin = getOriginFromRect(rect);
    const isHotCombo = combo >= 5;
    const particleCount = Math.min(10 + combo * 4, 50);

    const colors = isHotCombo 
        ? ['#ec4899', '#a855f7', '#3b82f6', '#10b981', '#f59e0b'] 
        : ['#6366f1', '#818cf8', '#c7d2fe'];

    confetti({
        particleCount,
        spread: 40 + combo * 3,
        origin: { x: origin.x, y: origin.y - 0.02 },
        colors,
        disableForReducedMotion: true,
        gravity: isHotCombo ? 1 : 0.8,
        startVelocity: 20 + combo * 1.5,
        scalar: isHotCombo ? 0.7 : 0.5,
        ticks: 80,
        zIndex: 1000
    });
};

/**
 * Randomly picks between 4 visual designs (Fiesta, Starburst, Electric, Coins).
 * Scales dynamically with intensity, and plays an adapted synth sound for each!
 */

// --- SHUFFLE BAG ALGORITHM (58 Effects) ---
let SHUFFLE_BAG: number[] = [];
const getNextEffectIndex = (): number => {
    if (SHUFFLE_BAG.length === 0) {
        for (let i = 0; i < 58; i++) {
            SHUFFLE_BAG.push(i);
        }
        for (let i = SHUFFLE_BAG.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = SHUFFLE_BAG[i];
            SHUFFLE_BAG[i] = SHUFFLE_BAG[j];
            SHUFFLE_BAG[j] = temp;
        }
    }
    return SHUFFLE_BAG.pop()!;
};

export const shootDynamicWordBlast = (rect?: DOMRect, intensity: number = 0) => {
    const ctx = getAudioContext();
    const origin = getOriginFromRect(rect);
    const isHotCombo = intensity >= 5;
    
    // Scale visual physics
    const particleCount = Math.min(10 + intensity * 4, 80);
    const spread = 40 + intensity * 3;
    const startVelocity = 20 + intensity * 1.5;

    // Pick random effect (0-27)
    const effectIndex = getNextEffectIndex();

    if (effectIndex === 0) {
        // 1. Classic Fiesta + Fast Harp Sound
        if (ctx) {
            const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5
            freqs.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq + intensity * 5, ctx.currentTime + i * 0.04);
                gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.04);
                gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.04 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.04 + 0.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.04);
                osc.stop(ctx.currentTime + i * 0.04 + 0.2);
            });
        }
        confetti({
            particleCount,
            spread,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square', 'circle'],
            colors: isHotCombo ? ['#ec4899', '#a855f7', '#3b82f6', '#10b981', '#f59e0b'] : ['#f472b6', '#a78bfa'],
            disableForReducedMotion: true,
            gravity: isHotCombo ? 1 : 0.8,
            startVelocity,
            scalar: isHotCombo ? 0.8 : 0.5,
            ticks: 80,
            zIndex: 1000
        });
    } else if (effectIndex === 1) {
        // 2. Starburst + Twinkle Sound
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1046.50 + intensity * 10, ctx.currentTime); // C6
            osc.frequency.exponentialRampToValueAtTime(1318.51 + intensity * 15, ctx.currentTime + 0.1); // E6
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        }
        confetti({
            particleCount: Math.max(Math.floor(particleCount * 0.5), 5),
            spread: spread * 1.2,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['star', 'circle'],
            colors: isHotCombo ? ['#fbbf24', '#f59e0b', '#d97706', '#fef3c7', '#ffffff'] : ['#fde68a'],
            disableForReducedMotion: true,
            gravity: 0.9,
            startVelocity,
            scalar: isHotCombo ? 1.0 : 0.6,
            ticks: 100,
            zIndex: 1000
        });
    } else if (effectIndex === 2) {
        // 3. Electric Sparks + Zap Sound
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(800 + intensity * 20, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100 + intensity * 5, ctx.currentTime + 0.1); // fast dive
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        }
        confetti({
            particleCount: Math.floor(particleCount * 1.5),
            spread: spread * 0.8,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#0ea5e9'],
            disableForReducedMotion: true,
            gravity: 1.2,
            startVelocity: startVelocity * 1.3,
            scalar: isHotCombo ? 0.4 : 0.3,
            ticks: 40,
            zIndex: 1000
        });
    } else if (effectIndex === 3) {
        // 4. Gold Coins + Mario Coin Sound
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(987.77 + intensity * 10, ctx.currentTime); // B5
            osc.frequency.setValueAtTime(1318.51 + intensity * 15, ctx.currentTime + 0.08); // E6
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.08); // hold
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.09); // slight pop on pitch jump
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        }
        confetti({
            particleCount: Math.max(Math.floor(particleCount * 0.4), 3), // Fewer big coins
            spread: spread * 0.6, // shoot more straight up
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#fbbf24', '#f59e0b', '#d97706'], // Gold / bronze
            disableForReducedMotion: true,
            gravity: 1.8, // Fall fast!
            startVelocity: startVelocity * 1.5, // Shoot up high
            scalar: isHotCombo ? 1.5 : 0.8, // Big coins when hot
            ticks: 120,
            zIndex: 1000
        });
    } else if (effectIndex === 4) {
        // 5. Cherry Blossom Flutter + Soft Breath Sound
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880 + intensity * 5, ctx.currentTime); // A5
            // Soft slow attack & release
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.6);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.8),
            spread: spread * 1.5, // wide drift
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#fbcfe8', '#fce7f3', '#fdf2f8', '#ffffff'], // Pink & White
            disableForReducedMotion: true,
            gravity: 0.3, // Floats extremely slowly
            startVelocity: startVelocity * 0.7,
            scalar: isHotCombo ? 1.0 : 0.6,
            ticks: 200, // Lingers for a long time
            zIndex: 1000
        });
    } else if (effectIndex === 5) {
        // 6. Soap Bubbles + Bloop/Pop Sound
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300 + intensity * 15, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1000 + intensity * 20, ctx.currentTime + 0.1); // Bloop up
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.6),
            spread: spread * 0.9,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#e0e7ff', '#c4b5fd', '#818cf8', '#a78bfa'], // Iridescent purples/blues
            disableForReducedMotion: true,
            gravity: 0.1, // Almost floats upwards!
            startVelocity: startVelocity * 0.6,
            scalar: isHotCombo ? 1.2 : 0.7,
            ticks: 150,
            zIndex: 1000
        });
    } else if (effectIndex === 6) {
        // 7. Dark Matter Void + Sub-Bass Collapse Sound
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150 + intensity * 2, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.2); // deep heavy dive
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        }
        confetti({
            particleCount: particleCount + 20, // denser
            spread: spread * 0.5, // tight column
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square'], // blocky sharp
            colors: ['#000000', '#111827', '#4c1d95', '#312e81'], // Black / Deep violet
            disableForReducedMotion: true,
            gravity: 2.0, // Extremely heavy collapse
            startVelocity: startVelocity * 1.8, // shoots very fast, then drops
            scalar: isHotCombo ? 0.6 : 0.3,
            ticks: 30, // Disappears unusually fast
            zIndex: 1000
        });
    } else if (effectIndex === 7) {
        // 8. Ruby Shards + Metallic Crunch / Metal Ping Sound
        if (ctx) {
            const freqs = [800, 950.5].map(f => f + intensity * 20); // dissonant minor 2nd clash for metallic ping
            freqs.forEach((freq) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                // sharp metallic drop
                osc.frequency.exponentialRampToValueAtTime(freq * 0.8, ctx.currentTime + 0.1); 
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            });
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.7),
            spread: spread,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square'],
            colors: ['#ef4444', '#991b1b', '#7f1d1d', '#fca5a5'], // Crimson & Ruby
            disableForReducedMotion: true,
            gravity: 1.5,
            startVelocity: startVelocity * 1.2,
            scalar: isHotCombo ? 0.9 : 0.5,
            ticks: 100,
            zIndex: 1000
        });
    } else if (effectIndex === 8) {
        // 8. Cyber Glitch
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300 + intensity * 20, ctx.currentTime);
            osc.frequency.setValueAtTime(800 + intensity * 50, ctx.currentTime + 0.05); // Glitch jump
            osc.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        }
        confetti({
            particleCount: particleCount,
            spread: spread * 1.5,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square'],
            colors: ['#06b6d4', '#d946ef', '#f472b6', '#000000'],
            disableForReducedMotion: true,
            gravity: 0.5,
            startVelocity: startVelocity * 1.1,
            scalar: isHotCombo ? 0.8 : 0.5,
            ticks: 50,
            zIndex: 1000
        });
} else if (effectIndex === 9) { 
        // 9. Paper Airplanes
        if (ctx) {
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(800 + intensity * 30, ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.2);
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount: Math.max(Math.floor(particleCount * 0.4), 3),
            spread: 120,
            angle: 0,
            origin: { x: 0, y: origin.y - 0.02 },
            shapes: ['circle', 'square'], // simulating planes
            colors: ['#ffffff', '#f1f5f9', '#e2e8f0'],
            disableForReducedMotion: true,
            gravity: 0.2,
            startVelocity: startVelocity * 2,
            scalar: isHotCombo ? 1.0 : 0.7,
            ticks: 120,
            zIndex: 1000
        });
        confetti({
            particleCount: Math.max(Math.floor(particleCount * 0.4), 3),
            spread: 120,
            angle: 180,
            origin: { x: 1, y: origin.y - 0.02 },
            shapes: ['circle', 'square'],
            colors: ['#ffffff', '#f1f5f9'],
            disableForReducedMotion: true,
            gravity: 0.2,
            startVelocity: startVelocity * 2,
            scalar: isHotCombo ? 1.0 : 0.7,
            ticks: 120,
            zIndex: 1000
        });
} else if (effectIndex === 10) { 
        // 10. Poison Cloud
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150 + intensity * 10, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15); // Bloop up slow
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.6),
            spread: spread * 1.2,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#22c55e', '#16a34a', '#86efac', '#4ade80'],
            disableForReducedMotion: true,
            gravity: -0.1, // Floats UP
            startVelocity: startVelocity * 0.4,
            scalar: isHotCombo ? 1.5 : 0.9,
            ticks: 150,
            zIndex: 1000
        });
} else if (effectIndex === 11) { 
        // 11. Frozen Shatter
        if (ctx) {
            const freqs = [1200 + intensity*20, 1600 + intensity*20, 2400 + intensity*20]; 
            freqs.forEach((freq) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.7, ctx.currentTime + 0.1); 
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.005);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            });
        }
        confetti({
            particleCount: particleCount,
            spread: spread * 0.8,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square'],
            colors: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#ffffff'],
            disableForReducedMotion: true,
            gravity: 1.8,
            startVelocity: startVelocity * 1.5,
            scalar: isHotCombo ? 0.7 : 0.4,
            ticks: 80,
            zIndex: 1000
        });
} else if (effectIndex === 12) { 
        // 12. Flame Pillars
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(80 + intensity * 5, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2); 
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount: particleCount + 20,
            spread: spread * 0.4,
            angle: 90,
            origin: { x: origin.x, y: origin.y },
            shapes: ['circle', 'square'],
            colors: ['#ef4444', '#f97316', '#f59e0b', '#fbbf24', '#000000'],
            disableForReducedMotion: true,
            gravity: -0.2, // Shoot UP
            startVelocity: startVelocity * 2,
            scalar: isHotCombo ? 1.0 : 0.6,
            ticks: 60,
            zIndex: 1000
        });
} else if (effectIndex === 13) { 
        // 13. Plasma Rings
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600 + intensity * 30, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + 0.08); 
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        }
        confetti({
            particleCount: particleCount,
            spread: 360,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#a855f7', '#d946ef', '#e879f9', '#fdf4ff'],
            disableForReducedMotion: true,
            gravity: 0,
            startVelocity: startVelocity * 1.5,
            scalar: isHotCombo ? 0.8 : 0.5,
            ticks: 40,
            zIndex: 1000
        });
} else if (effectIndex === 14) { 
        // 14. Midnight Stars
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const baseF = 1046.50 + intensity * 30; // C6
            osc.frequency.setValueAtTime(baseF, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.5),
            spread: spread * 1.5,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['star', 'circle'],
            colors: ['#fef08a', '#facc15', '#ffffff', '#1e3a8a'],
            disableForReducedMotion: true,
            gravity: 0.1,
            startVelocity: startVelocity * 0.8,
            scalar: isHotCombo ? 0.9 : 0.6,
            ticks: 150,
            zIndex: 1000
        });
} else if (effectIndex === 15) { 
        // 15. Candy Crush
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const base = 523.25 + intensity * 20; // C5
            osc.frequency.setValueAtTime(base, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(base * 1.5, ctx.currentTime + 0.1); 
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        }
        confetti({
            particleCount: Math.max(Math.floor(particleCount * 0.8), 5),
            spread: spread,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#fca5a5', '#fef08a', '#a7f3d0', '#bfdbfe', '#e9d5ff'],
            disableForReducedMotion: true,
            gravity: 1.2,
            startVelocity: startVelocity * 1.1,
            scalar: isHotCombo ? 1.5 : 1.0,
            ticks: 80,
            zIndex: 1000
        });
} else if (effectIndex === 16) { 
        // 16. Retro Arcade
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            const f = 659.25 + intensity * 20; // E5
            osc.frequency.setValueAtTime(f, ctx.currentTime);
            osc.frequency.setValueAtTime(f * 1.33, ctx.currentTime + 0.05); // Jump up a fourth
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.08); // hold
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.12);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.6),
            spread: spread,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square'],
            colors: ['#ef4444', '#3b82f6', '#22c55e', '#eab308'],
            disableForReducedMotion: true,
            gravity: 1.5,
            startVelocity: startVelocity * 1.2,
            scalar: isHotCombo ? 1.2 : 0.8,
            ticks: 60,
            zIndex: 1000
        });
} else if (effectIndex === 17) { 
        // 17. Autumn Leaves
        if (ctx) {
            const bufferSize = Math.floor(ctx.sampleRate * 0.2); 
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800 + intensity * 50;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            noise.start(ctx.currentTime);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.8),
            spread: spread * 1.5,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square', 'circle'],
            colors: ['#ea580c', '#c2410c', '#b45309', '#78350f', '#fcd34d'],
            disableForReducedMotion: true,
            gravity: 0.4,
            startVelocity: startVelocity * 0.6,
            scalar: isHotCombo ? 1.0 : 0.6,
            ticks: 150,
            zIndex: 1000
        });
} else if (effectIndex === 18) { 
        // 18. Laser Grid
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(2000 + intensity * 50, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.05); // Zap!
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.07);
        }
        // Shoot 4 straight directions
        [0, 90, 180, 270].forEach(angle => {
            confetti({
                particleCount: Math.max(Math.floor(particleCount * 0.2), 2),
                spread: 10,
                angle: angle,
                origin: { x: origin.x, y: origin.y - 0.02 },
                shapes: ['square'],
                colors: ['#4ade80', '#22c55e', '#ffffff'],
                disableForReducedMotion: true,
                gravity: 0,
                startVelocity: startVelocity * 2,
                scalar: isHotCombo ? 0.6 : 0.3,
                ticks: 40,
                zIndex: 1000
            });
        });
} else if (effectIndex === 19) { 
        // 19. Pearl Drop
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            const f = 800 + intensity * 20;
            osc.frequency.setValueAtTime(f, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(f * 1.2, ctx.currentTime + 0.05); 
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.7),
            spread: spread * 1.2,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#f8fafc', '#f1f5f9', '#e2e8f0', '#ffffff'],
            disableForReducedMotion: true,
            gravity: 1.0,
            startVelocity: startVelocity * 1.3,
            scalar: isHotCombo ? 1.0 : 0.7,
            ticks: 100,
            zIndex: 1000
        });
} else if (effectIndex === 20) { 
        // 20. Heavy Metal
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(60 + intensity * 2, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.2); 
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount: particleCount + 10,
            spread: spread * 0.5,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['square'],
            colors: ['#1e293b', '#334155', '#0f172a', '#000000', '#64748b'],
            disableForReducedMotion: true,
            gravity: 2.5, // Extremely heavy
            startVelocity: startVelocity * 1.8,
            scalar: isHotCombo ? 1.2 : 0.8,
            ticks: 50,
            zIndex: 1000
        });
} else if (effectIndex === 21) { 
        // 21. Radiant Sun
        if (ctx) {
            [440 + intensity*10, 554.37 + intensity*10, 659.25 + intensity*10].forEach(freq => { // A major chord
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.25);
            });
        }
        confetti({
            particleCount: particleCount * 2, // Massive burst
            spread: 360,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle', 'star'],
            colors: ['#fef08a', '#fde047', '#facc15', '#eab308', '#ffffff'],
            disableForReducedMotion: true,
            gravity: 0.6,
            startVelocity: startVelocity * 1.5,
            scalar: isHotCombo ? 1.0 : 0.6,
            ticks: 120,
            zIndex: 1000
        });
} else if (effectIndex === 22) { 
        // 22. Neon Rain
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(1500 + intensity * 30, ctx.currentTime);
            osc.frequency.setValueAtTime(2000, ctx.currentTime + 0.02);
            osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.04);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.setValueAtTime(0.05, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        }
        confetti({
            particleCount: particleCount + 20,
            spread: 180,
            angle: 270, // Straight down
            origin: { x: origin.x, y: origin.y - 0.1 },
            shapes: ['square'],
            colors: ['#22d3ee', '#06b6d4', '#0891b2', '#67e8f9'],
            disableForReducedMotion: true,
            gravity: 1.0,
            startVelocity: startVelocity * 1.5,
            scalar: isHotCombo ? 0.5 : 0.3,
            ticks: 70,
            zIndex: 1000
        });
} else if (effectIndex === 23) { 
        // 23. Magic Runes
        if (ctx) {
            const freqs = [880 + intensity * 20, 1760 + intensity * 20]; 
            freqs.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);
                gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.05);
                gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + idx * 0.05 + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.05 + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.05);
                osc.stop(ctx.currentTime + idx * 0.05 + 0.3);
            });
        }
        let shapes: any[] = ['circle'];
        if ((confetti as any).shapeFromText) {
            shapes = ['✨', '🔮', '💫'].map(e => (confetti as any).shapeFromText({ text: e, scalar: 2 }));
        }
        confetti({
            particleCount: Math.max(Math.floor(particleCount * 0.5), 3),
            spread: spread * 1.5,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: shapes,
            colors: ['#c084fc', '#d8b4fe', '#e879f9', '#f0abfc'],
            disableForReducedMotion: true,
            gravity: 0.1, // Float
            startVelocity: startVelocity * 0.8,
            scalar: isHotCombo ? 1.5 : 1.0,
            ticks: 150,
            zIndex: 1000
        });
} else if (effectIndex === 24) { 
        // 24. Clockwork Gears
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(300 + intensity * 10, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.02); // very fast tick
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.002);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.03);
        }
        confetti({
            particleCount: particleCount,
            spread: spread,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle', 'square'],
            colors: ['#78716c', '#a8a29e', '#d6d3d1', '#fbbf24', '#b45309'],
            disableForReducedMotion: true,
            gravity: 1.5,
            startVelocity: startVelocity * 1.2,
            scalar: isHotCombo ? 1.0 : 0.6,
            ticks: 60,
            zIndex: 1000
        });
} else if (effectIndex === 25) { 
        // 25. Cosmic Dust
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(100 + intensity * 5, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        }
        confetti({
            particleCount: particleCount * 2,
            spread: 360,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#ffffff', '#e0e7ff', '#c7d2fe', '#818cf8', '#4f46e5'],
            disableForReducedMotion: true,
            gravity: 0,
            startVelocity: startVelocity * 0.3,
            scalar: isHotCombo ? 0.4 : 0.2, // Tiny tiny particles
            ticks: 200,
            zIndex: 1000
        });
} else if (effectIndex === 26) { 
        // 26. Sonic Boom
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120 + intensity * 2, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.3); // sub drop
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
        }
        confetti({
            particleCount: particleCount,
            spread: 360,
            origin: { x: origin.x, y: origin.y - 0.02 },
            shapes: ['circle'],
            colors: ['#cbd5e1', '#94a3b8', '#64748b', '#ffffff'],
            disableForReducedMotion: true,
            gravity: 0, // expand outward like ring
            startVelocity: startVelocity * 3, // extremely fast edge
            scalar: isHotCombo ? 1.5 : 0.8,
            ticks: 30, // dies very fast
            zIndex: 1000
        });
} else if (effectIndex === 27) { 
        // 27. Blossom Gust
        if (ctx) {
            const freqs = [659.25, 783.99, 987.77].map(f => f + intensity * 15); // E5, G5, B5
            freqs.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.03);
                gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.03);
                gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + idx * 0.03 + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.03 + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + idx * 0.03);
                osc.stop(ctx.currentTime + idx * 0.03 + 0.3);
            });
        }
        confetti({
            particleCount: particleCount + 30,
            angle: 45, // wind blowing
            spread: 120,
            origin: { x: 0.1, y: origin.y + 0.1 }, // start from bottom left
            shapes: ['circle', 'square'],
            colors: ['#fbcfe8', '#fce7f3', '#fdf2f8', '#ffffff', '#fda4af'],
            disableForReducedMotion: true,
            gravity: 0.4, 
            startVelocity: startVelocity * 1.5,
            scalar: isHotCombo ? 0.8 : 0.5,
            ticks: 200, 
            zIndex: 1000
        });
        /* If origin was right side, flip it */
        if (origin.x > 0.5) {
            confetti({
                particleCount: particleCount + 30,
                angle: 135, // wind blowing left
                spread: 120,
                origin: { x: 0.9, y: origin.y + 0.1 }, 
                shapes: ['circle', 'square'],
                colors: ['#fbcfe8', '#fce7f3', '#fdf2f8', '#ffffff', '#fda4af'],
                disableForReducedMotion: true,
                gravity: 0.4, 
                startVelocity: startVelocity * 1.5,
                scalar: isHotCombo ? 0.8 : 0.5,
                ticks: 200, 
                zIndex: 1000
            });
        }

    } else if (effectIndex === 28) {
// 28. Blood Pact
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(80, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        }
        confetti({
            particleCount: particleCount * 0.8, spread: spread * 0.6, origin: { x: origin.x, y: origin.y + 0.05 },
            shapes: ['circle'], colors: ['#7f1d1d', '#991b1b', '#dc2626', '#450a0a'],
            disableForReducedMotion: true, gravity: 2.0, startVelocity: startVelocity * 1.5, scalar: 1.2, ticks: 120, zIndex: 1000
        });
    } else if (effectIndex === 29) {
// 29. Static Field
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(2000, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
        }
        confetti({
            particleCount: particleCount * 2, spread: 360, origin,
            shapes: ['square'], colors: ['#67e8f9', '#a5f3fc', '#cffafe', '#ffffff'],
            disableForReducedMotion: true, gravity: 0.1, startVelocity: startVelocity * 2, scalar: 0.3, ticks: 50, zIndex: 1000
        });
    } else if (effectIndex === 30) {
// 30. Lego Bricks Collapse
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(880 + intensity * 10, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
        }
        confetti({
            particleCount, spread: spread * 1.2, origin: { x: origin.x, y: origin.y - 0.05 },
            shapes: ['square'], colors: ['#ef4444', '#3b82f6', '#f59e0b', '#10b981'],
            disableForReducedMotion: true, gravity: 1.5, startVelocity: startVelocity, scalar: 1.5, ticks: 100, zIndex: 1000
        });
    } else if (effectIndex === 31) {
// 31. Tidal Wave
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        }
        confetti({
            particleCount: particleCount * 1.5, spread: 180, origin,
            shapes: ['circle'], colors: ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc'],
            disableForReducedMotion: true, gravity: 0.3, startVelocity: startVelocity, scalar: 0.9, ticks: 150, zIndex: 1000
        });
    } else if (effectIndex === 32) {
// 32. Chainsaw
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120 + intensity * 5, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount, spread: 30, origin,
            shapes: ['square'], colors: ['#fbbf24', '#f59e0b', '#d97706', '#b45309'],
            disableForReducedMotion: true, gravity: 0.8, startVelocity: startVelocity * 1.8, scalar: 0.5, ticks: 80, zIndex: 1000
        });
    } else if (effectIndex === 33) {
// 33. Phantom Butterflies
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1500, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(2500, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.5), spread: 90, origin,
            shapes: ['circle'], colors: ['#d946ef', '#c026d3', '#10b981', '#34d399'],
            disableForReducedMotion: true, gravity: 0.05, startVelocity: startVelocity * 0.4, scalar: 1.1, ticks: 400, zIndex: 1000
        });
    } else if (effectIndex === 34) {
// 34. Nuclear Fallout
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(60, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.8);
        }
        confetti({
            particleCount: particleCount * 0.7, spread: 45, origin,
            shapes: ['circle'], colors: ['#65a30d', '#84cc16', '#a3e635', '#d9f99d'],
            disableForReducedMotion: true, gravity: -0.2, startVelocity: startVelocity * 1.5, scalar: 0.8, ticks: 300, zIndex: 1000
        });
    } else if (effectIndex === 35) {
// 35. Time Rewind
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.2); // Pitch goes UP 
            gain.gain.setValueAtTime(0.001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.15); // Volume goes UP
            gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount, spread, origin,
            shapes: ['square'], colors: ['#94a3b8', '#cbd5e1', '#f1f5f9', '#ffffff'],
            disableForReducedMotion: true, gravity: 0, startVelocity: startVelocity * 1.2, scalar: 0.8, ticks: 60, zIndex: 1000
        });
    } else if (effectIndex === 36) {
// 36. Disco Fever
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
        }
        confetti({
            particleCount: particleCount * 2, spread: 360, origin,
            shapes: ['circle', 'square'], colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'],
            disableForReducedMotion: true, gravity: 0.8, startVelocity: startVelocity * 1.3, scalar: 0.8, ticks: 120, zIndex: 1000
        });
    } else if (effectIndex === 37) {
// 37. Holy Smite
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(3000, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        }
        confetti({
            particleCount: particleCount * 3, spread: 90, origin: { x: origin.x, y: 0 },
            shapes: ['circle'], colors: ['#ffffff', '#fdf4ff', '#fffbeb'],
            disableForReducedMotion: true, gravity: 2.5, startVelocity: startVelocity * 2, scalar: 1.0, ticks: 150, zIndex: 1000
        });
    } else if (effectIndex === 38) {
// 38. Bubble Wrap Pop
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800 + intensity * 20, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1400 + intensity * 20, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.4), spread: 360, origin,
            shapes: ['circle'], colors: ['#ffffff', '#e2e8f0', '#cbd5e1'],
            disableForReducedMotion: true, gravity: 0.2, startVelocity: startVelocity * 0.7, scalar: 1.5, ticks: 60, zIndex: 1000
        });
    } else if (effectIndex === 39) {
// 39. Venom Strike
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(50, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount, spread: 180, origin,
            shapes: ['circle'], colors: ['#14b8a6', '#0d9488', '#0f766e'],
            disableForReducedMotion: true, gravity: 1.2, startVelocity: startVelocity * 1.5, scalar: 1.3, ticks: 100, zIndex: 1000
        });
    } else if (effectIndex === 40) {
// 40. Laser Guided
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(2000, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(2000, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
        }
        confetti({
            particleCount: 20, spread: 360, origin,
            shapes: ['square'], colors: ['#f43f5e', '#e11d48', '#be123c'],
            disableForReducedMotion: true, gravity: 0, startVelocity: startVelocity * 2.5, scalar: 0.6, ticks: 40, zIndex: 1000
        });
    } else if (effectIndex === 41) {
// 41. Golden Swirl
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        }
        confetti({
            particleCount: particleCount * 1.2, spread: 360, origin,
            shapes: ['circle'], colors: ['#fcd34d', '#fbbf24', '#f59e0b'],
            disableForReducedMotion: true, gravity: 0.5, startVelocity: startVelocity, scalar: 0.8, ticks: 200, zIndex: 1000
        });
    } else if (effectIndex === 42) {
// 42. Midnight Velvet
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        }
        confetti({
            particleCount, spread: 100, origin,
            shapes: ['circle'], colors: ['#4c1d95', '#581c87', '#3b0764', '#1e1b4b'],
            disableForReducedMotion: true, gravity: 0.4, startVelocity: startVelocity * 0.8, scalar: 1.4, ticks: 180, zIndex: 1000
        });
    } else if (effectIndex === 43) {
// 43. Ghostly Wail
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(750, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.2);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
        }
        confetti({
            particleCount: particleCount * 0.6, spread: 360, origin,
            shapes: ['circle'], colors: ['#ccfbf1', '#99f6e4', '#5eead4'],
            disableForReducedMotion: true, gravity: -0.1, startVelocity: startVelocity * 0.5, scalar: 1.2, ticks: 300, zIndex: 1000
        });
    } else if (effectIndex === 44) {
// 44. Volcanic Ash
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6);
        }
        confetti({
            particleCount: particleCount * 2, spread: 60, origin,
            shapes: ['square'], colors: ['#7f1d1d', '#991b1b', '#b45309', '#1c1917'],
            disableForReducedMotion: true, gravity: 1.5, startVelocity: startVelocity * 2, scalar: 1.1, ticks: 180, zIndex: 1000
        });
    } else if (effectIndex === 45) {
// 45. Alien Sludge
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(250, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        }
        confetti({
            particleCount, spread: 360, origin,
            shapes: ['circle'], colors: ['#bef264', '#a3e635', '#84cc16', '#4d7c0f'],
            disableForReducedMotion: true, gravity: 0.9, startVelocity: startVelocity * 0.9, scalar: 1.6, ticks: 120, zIndex: 1000
        });
    } else if (effectIndex === 46) {
// 46. Celestial Chime
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2000 + intensity * 50, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        }
        confetti({
            particleCount: particleCount * 0.8, spread: 360, origin,
            shapes: ['circle'], colors: ['#fdf4ff', '#fae8ff', '#f0abfc'],
            disableForReducedMotion: true, gravity: 0.3, startVelocity: startVelocity * 1.2, scalar: 0.5, ticks: 150, zIndex: 1000
        });
    } else if (effectIndex === 47) {
// 47. Magnetic Pull
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.2); // pitch up fast
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.15);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount, spread: 360, origin,
            shapes: ['square'], colors: ['#cbd5e1', '#94a3b8', '#64748b'],
            disableForReducedMotion: true, gravity: -0.5, startVelocity: startVelocity * 0.5, scalar: 0.7, ticks: 80, zIndex: 1000
        });
    } else if (effectIndex === 48) {
// 48. Subzero Freeze
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.05);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
        }
        confetti({
            particleCount: particleCount * 1.5, spread: 180, origin,
            shapes: ['square'], colors: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8'],
            disableForReducedMotion: true, gravity: 2.0, startVelocity: startVelocity * 2, scalar: 0.6, ticks: 90, zIndex: 1000
        });
    } else if (effectIndex === 49) {
// 49. Quantum Foam
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount: particleCount * 3, spread: 360, origin,
            shapes: ['circle'], colors: ['#f1f5f9', '#f8fafc', '#ffffff'],
            disableForReducedMotion: true, gravity: 0.1, startVelocity: startVelocity * 0.8, scalar: 0.2, ticks: 100, zIndex: 1000
        });
    } else if (effectIndex === 50) {
// 50. Copper Wires
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(900, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount, spread: 20, origin,
            shapes: ['square'], colors: ['#d97706', '#b45309', '#92400e', '#78350f'],
            disableForReducedMotion: true, gravity: 0.2, startVelocity: startVelocity * 2, scalar: 0.4, ticks: 120, zIndex: 1000
        });
    } else if (effectIndex === 51) {
// 51. Dream Sequence
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(450, ctx.currentTime + 0.5);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.2);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.7);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.7);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.5), spread: 360, origin,
            shapes: ['circle'], colors: ['#fce7f3', '#fbcfe8', '#f9a8d4'],
            disableForReducedMotion: true, gravity: 0.05, startVelocity: startVelocity * 0.3, scalar: 1.8, ticks: 400, zIndex: 1000
        });
    } else if (effectIndex === 52) {
// 52. Toxic Spores
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        }
        confetti({
            particleCount: particleCount * 0.8, spread: 360, origin,
            shapes: ['circle'], colors: ['#166534', '#14532d', '#052e16'],
            disableForReducedMotion: true, gravity: 0.4, startVelocity: startVelocity * 0.8, scalar: 0.9, ticks: 200, zIndex: 1000
        });
    } else if (effectIndex === 53) {
// 53. Raindrops
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2000, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.15);
        }
        confetti({
            particleCount, spread: 90, origin: { x: origin.x, y: 0 },
            shapes: ['circle', 'square'], colors: ['#bfdbfe', '#93c5fd', '#60a5fa'],
            disableForReducedMotion: true, gravity: 2.0, startVelocity: startVelocity * 1.5, scalar: 0.4, ticks: 100, zIndex: 1000
        });
    } else if (effectIndex === 54) {
// 54. Synthwave Grid
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.05); // Octave jump
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
        }
        confetti({
            particleCount: particleCount * 1.5, spread: 360, origin,
            shapes: ['square'], colors: ['#f472b6', '#2dd4bf'],
            disableForReducedMotion: true, gravity: 0.1, startVelocity: startVelocity * 1.5, scalar: 1.0, ticks: 120, zIndex: 1000
        });
    } else if (effectIndex === 55) {
// 55. Sandstorm
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        }
        confetti({
            particleCount: particleCount * 3, spread: 10, origin: { x: origin.x - 0.1, y: origin.y },
            shapes: ['square'], colors: ['#fef3c7', '#fde68a', '#fcd34d'],
            disableForReducedMotion: true, gravity: 0.2, startVelocity: startVelocity * 2, scalar: 0.2, ticks: 200, zIndex: 1000
        });
    } else if (effectIndex === 56) {
// 56. Fireflies
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1800, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(1750, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.15);
            gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
        }
        confetti({
            particleCount: Math.floor(particleCount * 0.6), spread: 360, origin,
            shapes: ['circle'], colors: ['#fef08a', '#fde047'],
            disableForReducedMotion: true, gravity: -0.1, startVelocity: startVelocity * 0.6, scalar: 0.6, ticks: 300, zIndex: 1000
        });
    } else if (effectIndex === 57) {
// 57. Ultimate Flare
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.2); // Massive sweep
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        }
        confetti({
            particleCount: particleCount * 3, spread: 360, origin,
            shapes: ['circle', 'square'], colors: ['#ffffff', '#fca5a5', '#fef08a'],
            disableForReducedMotion: true, gravity: 0, startVelocity: startVelocity * 3, scalar: 1.5, ticks: 150, zIndex: 1000
        });
    }
};
export const shootBlockSuccess = (rect?: DOMRect) => {
    const origin = getOriginFromRect(rect);
    const ctx = getAudioContext();

    const effectIndex = Math.floor(Math.random() * 4);

    if (effectIndex === 0) {
        // 1. Emerald & Gold Cascade + Deep Orchestral Impact
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.4);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.6);
        }
        confetti({
            particleCount: 120,
            spread: 120,
            origin: { x: origin.x, y: origin.y - 0.05 },
            colors: ['#059669', '#10b981', '#34d399', '#f59e0b', '#fbbf24', '#fef3c7'], 
            disableForReducedMotion: true,
            gravity: 0.9,
            startVelocity: 35,
            scalar: 0.9,
            ticks: 200,
            zIndex: 1000
        });
    } else if (effectIndex === 1) {
        // 2. Cosmic Supernova + Sci-Fi Laser Riser
        if (ctx) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        }
        confetti({
            particleCount: 150, // Massive explosion
            spread: 160,
            origin: { x: origin.x, y: origin.y - 0.05 },
            shapes: ['star', 'circle'],
            colors: ['#c026d3', '#e879f9', '#2dd4bf', '#5eead4', '#ffffff'], // Magenta and Cyan
            disableForReducedMotion: true,
            gravity: 0.7, // Floats a bit longer
            startVelocity: 45, // Extremely violent burst
            scalar: 1.0,
            ticks: 150,
            zIndex: 1000
        });
    } else if (effectIndex === 2) {
        // 3. Royal Amethyst Shards + Glass Shatter Ping
        if (ctx) {
            const freqs = [1046.5, 1174.66, 1318.51, 1567.98]; // C6, D6, E6, G6 heavy chord
            freqs.forEach((freq) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.9, ctx.currentTime + 0.2);
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.3);
            });
        }
        confetti({
            particleCount: 100,
            spread: 90,
            origin: { x: origin.x, y: origin.y - 0.05 },
            shapes: ['square'],
            colors: ['#4c1d95', '#7c3aed', '#a78bfa', '#f3e8ff'], // Deep purple to white
            disableForReducedMotion: true,
            gravity: 1.5, // Heavy shards falling
            startVelocity: 40,
            scalar: 1.2, // Large pieces
            ticks: 180,
            zIndex: 1000
        });
    } else {
        // 4. Molten Gold Jackpot + Cascade of Coin Rings
        if (ctx) {
            // Simulate a slot machine spitting coins
            for (let i = 0; i < 5; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(987.77, ctx.currentTime + i * 0.06); // B5
                osc.frequency.setValueAtTime(1318.51, ctx.currentTime + i * 0.06 + 0.03); // E6
                gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.06);
                gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.06 + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.15);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.06);
                osc.stop(ctx.currentTime + i * 0.06 + 0.15);
            }
        }
        confetti({
            particleCount: 140, // Absurd amount of coins
            spread: 110,
            origin: { x: origin.x, y: origin.y - 0.05 },
            shapes: ['circle'],
            colors: ['#fbbf24', '#f59e0b', '#d97706', '#fef3c7', '#ffffff'], // Blinding gold and white
            disableForReducedMotion: true,
            gravity: 1.3,
            startVelocity: 38,
            scalar: 1.4, // Hugh coins
            ticks: 200,
            zIndex: 1000
        });
    }
};
