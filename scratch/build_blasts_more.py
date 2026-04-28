import os

file_path = "/Users/lijiahao/yasi/src/lib/feedback-engine.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. We replace the random logic with the shuffle bag definition.
shuffle_bag_code = """
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

export const shootDynamicWordBlast = (rect?: DOMRect, intensityScale?: number) => {
    const origin = getOriginFromRect(rect);
    const intensity = intensityScale ? Math.min(intensityScale, 50) : 0;
    const isHotCombo = intensity > 5;
    const particleCount = 20 + intensity * 5;
    const startVelocity = 15 + intensity * 2;
    const spread = 60 + intensity * 5;

    const ctx = getAudioContext();
    const effectIndex = getNextEffectIndex();

"""

# Finding the boundaries
start_marker = "export const shootDynamicWordBlast = (rect?: DOMRect, intensityScale?: number) => {"
# The end of the effect index initialisation
old_index_code = "const effectIndex = Math.floor(Math.random() * 28);"

# We will inject the SHUFFLE BAG before the function definition.

themes = [
    # 28: Blood Pact (Downward red slime, deep heartbeat pulse)
    """// 28. Blood Pact
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
        });""",
        
    # 29: Static Field (Electric fast tiny cyan particles, buzzing white noise via square pitch)
    """// 29. Static Field
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
        });""",

    # 30: Bricks Pop (Blocky colors, chiptune ping)
    """// 30. Lego Bricks Collapse
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
        });""",

    # 31: Tidal Wave (Flat blue wave sweep)
    """// 31. Tidal Wave
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
        });""",

    # 32: Chainsaw (Aggressive sparks)
    """// 32. Chainsaw
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
        });""",

    # 33: Phantom Butterflies (Pink/green slow floating)
    """// 33. Phantom Butterflies
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
        });""",

    # 34: Nuclear Fallout (Toxic long trails)
    """// 34. Nuclear Fallout
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
        });""",

    # 35: Time Rewind (Starts fast, slow drag inverse env)
    """// 35. Time Rewind
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
            disableForReducedMotion: true, gravity: 0, startVelocity: startVelocity * 1.2, scalar: 0.8, dragFriction: 0.2, ticks: 60, zIndex: 1000
        });""",

    # 36: Disco Fever (Strobe colors, bass slap)
    """// 36. Disco Fever
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
        });""",

    # 37: Holy Smite (White blinding cross)
    """// 37. Holy Smite
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
        });""",

    # 38: Bubble Wrap (Pop!)
    """// 38. Bubble Wrap Pop
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
        });""",

    # 39: Venom Strike (Acid green splat)
    """// 39. Venom Strike
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
        });""",
        
    # 40: Laser Guided (Straight horizontal lines)
    """// 40. Laser Guided
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
        });""",

    # 41: Golden Ratio (Swirling gold)
    """// 41. Golden Swirl
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
        });""",

    # 42: Midnight Velvet (Dark purple luxury)
    """// 42. Midnight Velvet
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
        });""",

    # 43: Ghostly Wail (Spooky cyan float)
    """// 43. Ghostly Wail
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
        });""",

    # 44: Volcanic Eruption (Massive upward red/orange)
    """// 44. Volcanic Ash
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
        });""",

    # 45: Alien Sludge (Gooey lime)
    """// 45. Alien Sludge
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
        });""",

    # 46: Celestial Chime (High pitched bell)
    """// 46. Celestial Chime
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
        });""",

    # 47: Magnetic Pull (Fast suck in)
    """// 47. Magnetic Pull
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
        });""",

    # 48: Subzero Freeze (Ice shatter)
    """// 48. Subzero Freeze
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
        });""",

    # 49: Quantum Foams (Tiny bubbles popping)
    """// 49. Quantum Foam
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
        });""",

    # 50: Copper Wires (Thin orange strings)
    """// 50. Copper Wires
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
        });""",

    # 51: Dream Sequence (Slow blur)
    """// 51. Dream Sequence
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
        });""",

    # 52: Toxic Spores (Dark green)
    """// 52. Toxic Spores
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
        });""",

    # 53: Raindrops (Falling blue)
    """// 53. Raindrops
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
        });""",

    # 54: Synthwave Grid (Neon pink/cyan flat)
    """// 54. Synthwave Grid
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
        });""",

    # 55: Sandstorm (Brown tiny particles rightward)
    """// 55. Sandstorm
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
        });""",

    # 56: Fireflies (Yellow blinking)
    """// 56. Fireflies
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
        });""",

    # 57: Final Ultimate Flare
    """// 57. Ultimate Flare
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
        });"""
]

themes_code = "} else if (effectIndex === ".join([f"{i+28}) {{\n{theme}\n    " for i, theme in enumerate(themes)])

# Locate where to inject the logic
end_search_str = "    } else if (effectIndex === 8) {"

# Wait, we need to completely replace `export const shootDynamicWordBlast = (rect?: DOMRect, intensityScale?: number) => { ... effectIndex logic ...`
# Let's cleanly inject SHUFFLE_BAG before export. 

parts = content.split("export const shootDynamicWordBlast")

pre_content = parts[0]
post_content = "export const shootDynamicWordBlast" + parts[1]

# In post content, replace "const effectIndex = Math.floor(Math.random() * 28);"
post_content = post_content.replace(
    "const effectIndex = Math.floor(Math.random() * 28);",
    "const effectIndex = getNextEffectIndex();"
)

# And now inject the 30 new themes right before the end of the `else if` chain of shootDynamicWordBlast
# Let's find the end of the 27th block. 
end_block_marker = "        });\\n    }"
# We'll just split on `export const shootBlockSuccess` and insert at the very end of shootDynamicWordBlast
func_parts = post_content.split("export const shootBlockSuccess")

shoot_func = func_parts[0]
block_success = "export const shootBlockSuccess" + func_parts[1]

# We need to find the `    }\n};\n\n` at the end of shoot_func and insert our new themes.
last_bracket_idx = shoot_func.rfind("    }\\n};")
if last_bracket_idx == -1:
    last_bracket_idx = shoot_func.rfind("};")

new_shoot_func = shoot_func[:last_bracket_idx] + "\\n    } else if (effectIndex === " + themes_code + "}\\n};\n\n"

final_content = pre_content + "\\n// --- SHUFFLE BAG ALGORITHM (58 Effects) ---\\nlet SHUFFLE_BAG: number[] = [];\\nconst getNextEffectIndex = (): number => {\\n    if (SHUFFLE_BAG.length === 0) {\\n        for (let i = 0; i < 58; i++) {\\n            SHUFFLE_BAG.push(i);\\n        }\\n        for (let i = SHUFFLE_BAG.length - 1; i > 0; i--) {\\n            const j = Math.floor(Math.random() * (i + 1));\\n            const temp = SHUFFLE_BAG[i];\\n            SHUFFLE_BAG[i] = SHUFFLE_BAG[j];\\n            SHUFFLE_BAG[j] = temp;\\n        }\\n    }\\n    return SHUFFLE_BAG.pop()!;\\n};\\n\\n" + new_shoot_func + block_success

with open(file_path, "w", encoding="utf-8") as f:
    f.write(final_content)

print("Injected 30 themes and shuffle bag successfully!")
