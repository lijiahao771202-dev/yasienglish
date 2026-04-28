const fs = require('fs');

const palettes = {
    cyber: "['#06b6d4', '#8b5cf6', '#d946ef', '#f472b6']",
    forest: "['#22c55e', '#16a34a', '#86efac', '#4ade80']",
    fire: "['#ef4444', '#f97316', '#f59e0b', '#fbbf24']",
    ocean: "['#0ea5e9', '#38bdf8', '#7dd3fc', '#0284c7']",
    gold: "['#facc15', '#fef08a', '#eab308', '#ffffff']",
    monochrome: "['#94a3b8', '#cbd5e1', '#e2e8f0', '#ffffff']",
    berry: "['#be123c', '#e11d48', '#fda4af', '#fecdd3']",
    magic: "['#a855f7', '#c084fc', '#e879f9', '#fdf4ff']",
    sunset: "['#fb923c', '#f43f5e', '#9333ea', '#db2777']",
    neon: "['#10b981', '#fbbf24', '#f43f5e', '#3b82f6']"
};

const emojisList = [
    "['⭐', '✨']", "['💎', '🔮']", "['🌸', '🍃']", "['🔥', '💥']", 
    "['💧', '🌊']", "['🎵', '🎶']", "['🍒', '🍓']", "['👾', '👽']",
    "['💀', '☠️']", "['❤️', '💖']", "['⚡️', '🌩️']", "['🧊', '❄️']",
    "['💰', '🪙']", "['👑', '🏆']", "['🍄', '✨']", "['🎈', '🎉']",
    "['🍉', '🥝']", "['🍕', '🍔']", "['🐱', '🐾']", "['🚀', '🛸']"
];

const shapesList = [
    "['circle']", "['square']", "['star']", "['circle', 'square']", "['square', 'star']"
];

// Combine into physical behaviors:
const commonVisuals = [
    { type: 'burst', v: 45, count: 50, grav: 1.2, decay: 0.9, title: 'Crisp Burst' },
    { type: 'bubbles', v: 30, count: 40, grav: -0.1, decay: 0.95, title: 'Rising Bubbles' },
    { type: 'heavy-drop', v: 20, count: 60, grav: 2.0, decay: 0.9, title: 'Heavy Drop' },
    { type: 'sideways-wind', v: 60, count: 50, grav: 1, decay: 0.9, title: 'Wind Blow', x: 0.1 },
    { type: 'laser-spear', v: 90, count: 30, grav: 0.5, decay: 0.8, title: 'Lasers' },
    { type: 'jelly-bounce', v: 40, count: 40, grav: 1.5, decay: 0.95, scalar: 1.5, title: 'Squishy Jelly' },
    { type: 'micro-dust', v: 50, count: 120, grav: 0.5, decay: 0.9, scalar: 0.4, title: 'Fairy Dust' },
    { type: 'implode', v: -20, count: 50, grav: 0.1, decay: 0.99, title: 'Reverse Suck' }
];

const commonAudio = [
    { type: 'pluck', baseFreq: 600, wave: 'sine', decay: 0.2, title: 'Soft Pluck' },
    { type: 'pluck', baseFreq: 400, wave: 'triangle', decay: 0.1, title: 'Dull Wood' },
    { type: 'fm', m: 800, c: 400, idx: 200, dur: 0.2, title: 'Glass Ting' },
    { type: 'arp', freqs: [400, 600, 800], wave: 'sine', speed: 0.03, dur: 0.1, title: 'Fast Sweep' },
    { type: 'jelly', title: 'Jelly Wobble' },
    { type: 'kick', title: 'Thumpy Kick' },
    { type: 'noise', filter: 'highpass', start: 2000, title: 'Sand Swish' },
    { type: 'fm', m: 200, c: 100, idx: 500, dur: 0.3, title: 'Metallic Clank' }
];

let items = [];
let id = 1;

// ==== 1. COMMON (1-50) ====
// Mix everything randomly but deterministically
function seedRand(str) {
    let h = 0;
    for(let i=0; i<str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    return function() { h = Math.imul(741103597, h); return (h >>> 0) / 4294967296; };
}
let rnd = seedRand('common_seed_3');

for (let i=0; i<50; i++) {
    let v = commonVisuals[Math.floor(rnd() * commonVisuals.length)];
    let a = commonAudio[Math.floor(rnd() * commonAudio.length)];
    let palName = Object.keys(palettes)[Math.floor(rnd() * Object.keys(palettes).length)];
    let pal = palettes[palName];
    
    // 30% chance for emojis
    let usesEmoji = rnd() > 0.7;
    let emojiStr = usesEmoji ? emojisList[Math.floor(rnd() * emojisList.length)] : 'null';
    let shapesStr = usesEmoji ? 'null' : shapesList[Math.floor(rnd() * shapesList.length)];

    items.push({
        id: id++, rarity: 'Common', name: `${palName} ${v.title} & ${a.title}`,
        v: `buildCommonVisual('${v.type}', ${v.count}, ${v.v}, ${v.grav}, ${v.decay}, ${v.scalar || 1}, ${pal}, ${emojiStr}, ${shapesStr}, ${v.x || 0.5})`,
        a: `buildCommonAudio('${a.type}', ${JSON.stringify(a)})`
    });
}

// ==== 2. RARE (51-80) ====
// Bigger effects: fountains, cross-screen, showers
const rareVisuals = [
    { type: 'fountain', count: 120, title: 'Geyser Fountain' },
    { type: 'shower', count: 60, title: 'Rain Shower' },
    { type: 'crossfire', count: 100, title: 'Crossfire' },
    { type: 'spiral', count: 80, title: 'Spiral' },
    { type: 'fireworks', count: 150, title: 'Fireworks Array' }
];
const rareAudio = [
    { type: 'chord', freqs: [440, 554, 659], wave: 'triangle', dur: 1.0, title: 'Major Triad' },
    { type: 'delay-pluck', baseFreq: 800, wave: 'sine', title: 'Echo Pluck' },
    { type: 'fm-swell', dur: 1.5, title: 'Sci-fi Swell' },
    { type: 'chime', dur: 1.2, title: 'Magic Chimes' }
];
for(let i=0; i<30; i++) {
    let v = rareVisuals[Math.floor(rnd() * rareVisuals.length)];
    let a = rareAudio[Math.floor(rnd() * rareAudio.length)];
    let palName = Object.keys(palettes)[Math.floor(rnd() * Object.keys(palettes).length)];
    
    let usesEmoji = rnd() > 0.5;
    let emojiStr = usesEmoji ? emojisList[Math.floor(rnd() * emojisList.length)] : 'null';
    let shapesStr = usesEmoji ? 'null' : "['star', 'circle']";

    items.push({
        id: id++, rarity: 'Rare', name: `Rare ${palName} ${v.title}`,
        v: `buildRareVisual('${v.type}', ${v.count}, ${palettes[palName]}, ${emojiStr}, ${shapesStr})`,
        a: `buildRareAudio('${a.type}', ${JSON.stringify(a)})`
    });
}

// ==== 3. EPIC (81-95) ====
// Majestic, long screen-covering
for(let i=0; i<15; i++) {
    items.push({
        id: id++, rarity: 'Epic', name: `Epic Genesis ${i+1}`,
        v: `buildEpicVisual(${i})`,
        a: `buildEpicAudio(${i})`
    });
}

// ==== 4. LEGENDARY (96-100) ====
// We can inject the literal string code for these 5
let legendary = [
    { name: 'The Void', v: 'legendaryV_Void', a: 'legendaryA_Void' },
    { name: 'Golden Nuke', v: 'legendaryV_Nuke', a: 'legendaryA_Nuke' },
    { name: 'Glitch Reality', v: 'legendaryV_Glitch', a: 'legendaryA_Glitch' },
    { name: 'Time Stop', v: 'legendaryV_Time', a: 'legendaryA_Time' },
    { name: 'Hypernova', v: 'legendaryV_Nova', a: 'legendaryA_Nova' }
];

legendary.forEach(l => {
    items.push({ id: id++, rarity: 'Legendary', name: l.name, v: l.v, a: l.a });
});

// BUILD FILE
let themeEntries = items.map(t => `  { id: ${t.id}, name: "${t.name}", rarity: "${t.rarity}", visualFn: ${t.v}, audioFn: ${t.a} }`).join(',\n');

let fileOut = `import confetti from 'canvas-confetti';

// --- Cleanup State ---
let activeTimeouts: Set<number> = new Set();
let activeIntervals: Set<number> = new Set();
let activeOscillators: Set<OscillatorNode | AudioBufferSourceNode> = new Set();
let activeAudioContext: AudioContext | null = null;
let activeIntervalObjs: any[] = []; // for clearing frame intervals manually

const safeSetTimeout = (cb: () => void, ms: number) => {
    const id = window.setTimeout(() => { activeTimeouts.delete(id); cb(); }, ms);
    activeTimeouts.add(id); return id;
};

export const clearAllCelebrations = () => {
    activeTimeouts.forEach(window.clearTimeout); activeTimeouts.clear();
    activeIntervals.forEach(window.clearInterval); activeIntervals.clear();
    activeIntervalObjs.forEach(o => o.cleared = true); activeIntervalObjs = [];
    activeOscillators.forEach(osc => {
        try {
            osc.onended = null;
            if ('stop' in osc) osc.stop();
            osc.disconnect();
        } catch (e) { }
    });
    activeOscillators.clear();
};

const getAudioContext = () => {
    if (!activeAudioContext) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        activeAudioContext = new Ctx();
    }
    if (activeAudioContext.state === 'suspended') {
        activeAudioContext.resume();
    }
    return activeAudioContext;
};

const registerOsc = (osc: OscillatorNode | AudioBufferSourceNode) => {
    activeOscillators.add(osc);
    osc.onended = () => { activeOscillators.delete(osc); };
};

// ============================================
// Helper builders
// ============================================
const getShapes = (emojis: string[] | null, shapes: string[] | null): any => {
    if (emojis && confetti.shapeFromText) {
        return emojis.map(e => confetti.shapeFromText({ text: e, scalar: 2 }));
    }
    return shapes || ['circle', 'square'];
};

const buildCommonVisual = (type: string, count: number, v: number, grav: number, decay: number, scalar: number, colors: string[], emojis: string[]|null, shapes: string[]|null, originX: number) => {
    return (origin: {x:number, y:number}, rm: boolean) => {
        const c = rm ? count * 0.3 : count;
        const sh = getShapes(emojis, shapes);
        const ox = originX !== 0.5 ? originX : origin.x; // allow override

        if (type === 'burst') {
            confetti({ particleCount: c, spread: 80, origin: {x: ox, y: origin.y}, startVelocity: v, colors, shapes: sh, gravity: grav, decay, scalar });
            safeSetTimeout(() => confetti({ particleCount: c*0.5, spread: 100, origin: {x: ox, y: origin.y}, startVelocity: v*0.8, colors, shapes: sh, gravity: grav*1.2, decay, scalar }), 50);
        } else if (type === 'bubbles') {
            confetti({ particleCount: c, spread: 180, origin, startVelocity: v, colors, shapes: sh, gravity: grav, decay, scalar: scalar*1.5 });
        } else if (type === 'heavy-drop') {
            confetti({ particleCount: c, spread: 50, origin, startVelocity: v, colors, shapes: sh, gravity: grav, decay, scalar: scalar*1.2 });
        } else if (type === 'sideways-wind') {
            confetti({ particleCount: c, angle: 0, spread: 30, origin: {x: 0, y: origin.y}, startVelocity: v, colors, shapes: sh, gravity: grav, decay, scalar });
        } else if (type === 'laser-spear') {
            confetti({ particleCount: c, spread: 10, origin, startVelocity: v, colors, shapes: sh, gravity: grav, decay, scalar: 0.3 });
        } else if (type === 'jelly-bounce') {
            confetti({ particleCount: c, spread: 45, angle: 90, origin, startVelocity: v, colors, shapes: sh, gravity: 0.5, decay: 0.9, scalar: scalar*1.5 });
            safeSetTimeout(() => confetti({ particleCount: c, spread: 90, angle: 270, origin, startVelocity: v*0.5, colors, shapes: sh, gravity: 2, decay: 0.95, scalar }), 80);
        } else if (type === 'micro-dust') {
            confetti({ particleCount: c, spread: 360, origin, startVelocity: v, colors, shapes: sh, gravity: grav, decay, scalar: 0.4 });
        } else if (type === 'implode') {
            confetti({ particleCount: c, spread: 360, origin, startVelocity: v, colors, shapes: sh, gravity: grav, decay, scalar });
        }
    }
};

const playJelly = (ctx: AudioContext) => {
    // FM synthesis for a squishy sound (Jelly)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const start = ctx.currentTime;
    osc.frequency.setValueAtTime(300, start);
    osc.frequency.exponentialRampToValueAtTime(800, start + 0.1);
    osc.frequency.exponentialRampToValueAtTime(100, start + 0.3);
    
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.5, start + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, start + 0.3);
    
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start+0.3); registerOsc(osc);
};

const buildCommonAudio = (type: string, cfg: any) => {
    return (ctx: AudioContext) => {
        if (type === 'jelly') {
            playJelly(ctx); return;
        }
        if (type === 'kick') {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.frequency.setValueAtTime(150, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime+0.3); registerOsc(osc);
            return;
        }

        const start = ctx.currentTime;
        if (type === 'pluck') {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.type = cfg.wave; osc.frequency.value = cfg.baseFreq;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(0.3, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.01, start + cfg.decay);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(start); osc.stop(start+cfg.decay); registerOsc(osc);
        } else if (type === 'arp') {
            cfg.freqs.forEach((f: number, i: number) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = cfg.wave; osc.frequency.value = f;
                const t = start + i*cfg.speed;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(0.2, t + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.01, t + cfg.dur);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t+cfg.dur); registerOsc(osc);
            });
        } else if (type === 'fm') {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            const fm = ctx.createOscillator(); const fmGain = ctx.createGain();
            osc.type = 'sine'; fm.type = 'sine'; osc.frequency.value = cfg.c; fm.frequency.value = cfg.m; fmGain.gain.value = cfg.idx;
            fm.connect(fmGain); fmGain.connect(osc.frequency);
            gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.4, start+0.01); gain.gain.exponentialRampToValueAtTime(0.01, start+cfg.dur);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); fm.start(); osc.stop(start+cfg.dur); fm.stop(start+cfg.dur); registerOsc(osc); registerOsc(fm);
        } else if (type === 'noise') {
            const bufferSize = ctx.sampleRate * 0.5;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = ctx.createBufferSource(); noise.buffer = buffer;
            const filter = ctx.createBiquadFilter(); filter.type = cfg.filter; filter.frequency.setValueAtTime(cfg.start, start); filter.frequency.exponentialRampToValueAtTime(100, start+0.3);
            const gain = ctx.createGain(); gain.gain.setValueAtTime(0.5, start); gain.gain.exponentialRampToValueAtTime(0.01, start+0.3);
            noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
            noise.start(start); noise.stop(start+0.3); registerOsc(noise);
        }
    };
};

const buildRareVisual = (type: string, count: number, colors: string[], emojis: string[]|null, shapes: string[]|null) => {
    return (origin: {x:number, y:number}, rm: boolean) => {
        let c = rm ? count*0.3 : count;
        let sh = getShapes(emojis, shapes);
        if (type === 'fountain') {
            confetti({ particleCount: c*0.5, angle: 60, spread: 55, origin: { x: 0.2, y: 1 }, colors, startVelocity: 60, shapes: sh });
            confetti({ particleCount: c*0.5, angle: 120, spread: 55, origin: { x: 0.8, y: 1 }, colors, startVelocity: 60, shapes: sh });
        } else if (type === 'shower') {
            let end = Date.now() + 1000;
            let interval = { cleared: false }; activeIntervalObjs.push(interval);
            (function frame() {
                if (interval.cleared) return;
                confetti({ particleCount: rm ? 2 : 5, spread: 360, origin: {x: Math.random(), y: -0.2}, startVelocity: 20, gravity: 0.5, colors, shapes: sh });
                if (Date.now() < end) safeSetTimeout(frame, 50);
            })();
        } else if (type === 'crossfire') {
            confetti({ particleCount: c, angle: 45, spread: 30, origin: { x: 0, y: 1 }, startVelocity: 80, gravity: 0.8, colors, shapes: sh });
            confetti({ particleCount: c, angle: 135, spread: 30, origin: { x: 1, y: 1 }, startVelocity: 80, gravity: 0.8, colors, shapes: sh });
        } else if (type === 'spiral') {
            let angle = 0; let end = Date.now() + 500;
            let interval = { cleared: false }; activeIntervalObjs.push(interval);
            (function frame() {
                if (interval.cleared) return;
                confetti({ particleCount: rm ? 5 : 15, angle, spread: 10, origin: {x: 0.5, y:0.5}, startVelocity: 50, colors, shapes: sh });
                angle += 45;
                if (Date.now() < end) safeSetTimeout(frame, 40);
            })();
        } else if (type === 'fireworks') {
            confetti({ particleCount: c, spread: 360, origin: { x: 0.2, y: 0.4 }, startVelocity: 40, colors, shapes: sh });
            safeSetTimeout(() => confetti({ particleCount: c, spread: 360, origin: { x: 0.5, y: 0.2 }, startVelocity: 40, colors, shapes: sh }), 200);
            safeSetTimeout(() => confetti({ particleCount: c, spread: 360, origin: { x: 0.8, y: 0.4 }, startVelocity: 40, colors, shapes: sh }), 400);
        }
    };
};

const buildRareAudio = (type: string, cfg: any) => {
    return (ctx: AudioContext) => {
        const start = ctx.currentTime;
        if (type === 'chord') {
            cfg.freqs.forEach((f: number) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = cfg.wave; osc.frequency.value = f;
                gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.15, start+0.1); gain.gain.exponentialRampToValueAtTime(0.01, start+cfg.dur);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(start); osc.stop(start+cfg.dur); registerOsc(osc);
            });
        } else if (type === 'delay-pluck') {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.type = 'sine'; osc.frequency.value = cfg.baseFreq;
            gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.3, start+0.05); gain.gain.exponentialRampToValueAtTime(0.01, start+0.5);
            const delay = ctx.createDelay(); delay.delayTime.value = 0.2;
            const delayGain = ctx.createGain(); delayGain.gain.value = 0.4;
            osc.connect(gain); gain.connect(ctx.destination);
            gain.connect(delay); delay.connect(delayGain); delayGain.connect(ctx.destination);
            osc.start(); osc.stop(start+0.5); registerOsc(osc);
        } else if (type === 'fm-swell') {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            const fm = ctx.createOscillator(); const fmGain = ctx.createGain();
            osc.type = 'triangle'; fm.type = 'sine'; osc.frequency.value = 300; fm.frequency.value = 100;
            fm.connect(fmGain); fmGain.connect(osc.frequency);
            fmGain.gain.setValueAtTime(10, start); fmGain.gain.linearRampToValueAtTime(600, start+cfg.dur*0.5);
            gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.3, start+cfg.dur*0.5); gain.gain.exponentialRampToValueAtTime(0.01, start+cfg.dur);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(); fm.start(); osc.stop(start+cfg.dur); fm.stop(start+cfg.dur); registerOsc(osc); registerOsc(fm);
        } else if (type === 'chime') {
            [800, 1200, 1600, 2400].forEach((f, i) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.value = f;
                const t = start + i*0.05;
                gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.1, t+0.01); gain.gain.exponentialRampToValueAtTime(0.01, t+cfg.dur);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t+cfg.dur); registerOsc(osc);
            });
        }
    };
};

const buildEpicVisual = (idx: number) => {
    return (origin: {x:number,y:number}, rm: boolean) => {
        const pal = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#facc15', '#ffffff'];
        const sh = getShapes(['🌟','🔥','💥','⚡️'], null);
        const count = rm ? 50 : 250;
        
        let interval = { cleared: false }; activeIntervalObjs.push(interval);
        if (idx % 3 === 0) {
            // Galaxy spin
            let a = 0; let end = Date.now() + 1500;
            (function frame() {
                if (interval.cleared) return;
                confetti({ particleCount: rm ? 8 : 25, spread: 20, angle: a, origin: { x: 0.5, y: 0.5 }, startVelocity: 60, colors: pal, shapes: sh, gravity: 0.1, scalar: 1.2 });
                confetti({ particleCount: rm ? 8 : 25, spread: 20, angle: a+180, origin: { x: 0.5, y: 0.5 }, startVelocity: 60, colors: pal, shapes: sh, gravity: 0.1, scalar: 1.2 });
                a += 25;
                if (Date.now() < end) safeSetTimeout(frame, 30);
            })();
        } else if (idx % 3 === 1) {
            // Mega Fountain array
            [0.1, 0.3, 0.5, 0.7, 0.9].forEach((x, i) => {
                safeSetTimeout(() => {
                    confetti({ particleCount: count*0.3, angle: 90, spread: 45, origin: { x, y: 1 }, colors: pal, startVelocity: 80, gravity: 1 });
                }, i * 150);
            });
        } else {
            // Screen Flash Burst
            confetti({ particleCount: count*0.8, spread: 360, origin: { x: 0.5, y: 0.5 }, startVelocity: 100, colors: pal, gravity: 0.5 });
            safeSetTimeout(() => confetti({ particleCount: count*0.8, spread: 360, origin: { x: 0.5, y: 0.5 }, startVelocity: 60, colors: ['#ffffff'], gravity: 0.5 }), 300);
        }
    };
};

const buildEpicAudio = (idx: number) => {
    return (ctx: AudioContext) => {
        const start = ctx.currentTime;
        const root = 150 + (idx*20);
        const chords = [root, root*1.25, root*1.5, root*2];
        const gain = ctx.createGain(); 
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.3, start+0.2); gain.gain.exponentialRampToValueAtTime(0.01, start+2.0);
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(5000, start); filter.frequency.exponentialRampToValueAtTime(200, start+2.0);
        
        chords.forEach((f, i) => {
            const osc = ctx.createOscillator(); osc.type = idx % 2 === 0 ? 'sawtooth' : 'square';
            osc.frequency.value = f;
            osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
            osc.start(); osc.stop(start+2.0); registerOsc(osc);
            
            // Appending arps
            const arpOsc = ctx.createOscillator(); arpOsc.type = 'triangle'; arpOsc.frequency.value = f*2;
            const aGain = ctx.createGain(); 
            const t = start + i*0.2;
            aGain.gain.setValueAtTime(0, t); aGain.gain.linearRampToValueAtTime(0.1, t+0.05); aGain.gain.exponentialRampToValueAtTime(0.01, t+0.3);
            arpOsc.connect(aGain); aGain.connect(ctx.destination);
            arpOsc.start(t); arpOsc.stop(t+0.3); registerOsc(arpOsc);
        });
    };
};

// ============================================
// Legendary Hand-crafted
// ============================================
const legendaryV_Void = (origin: any, rm: boolean) => {
    confetti({ particleCount: rm ? 200 : 800, spread: 360, startVelocity: 2, origin: { x: 0.5, y: 0.5 }, colors: ['#000000', '#171717', '#2e1065', '#ffffff'], scalar: 2.5, decay: 0.99, gravity: 0.01, ticks: 600, zIndex: 99999 });
};
const legendaryA_Void = (ctx: AudioContext) => {
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    const fm = ctx.createOscillator(); const fmGain = ctx.createGain();
    fm.type = 'sine'; fm.frequency.value = 10; fmGain.gain.value = 50;
    osc.type = 'sawtooth'; const start = ctx.currentTime;
    osc.frequency.setValueAtTime(100, start); osc.frequency.exponentialRampToValueAtTime(30, start + 1.5);
    fm.connect(fmGain); fmGain.connect(osc.frequency);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(1000, start); filter.frequency.exponentialRampToValueAtTime(50, start + 3.0);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.8, start + 0.5); gain.gain.exponentialRampToValueAtTime(0.01, start + 4.0);
    osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    fm.start(); fm.stop(start + 4.0); osc.start(); osc.stop(start + 4.0);
    registerOsc(osc); registerOsc(fm);
};

const legendaryV_Nuke = (o: any, rm: boolean) => {
    let end = Date.now() + (rm ? 2000 : 5000);
    let interval = { cleared: false }; activeIntervalObjs.push(interval);
    (function frame() {
        if (interval.cleared) return;
        const v = 35;
        confetti({ particleCount: rm ? 2 : 5, angle: 45, spread: 45, origin: { x: 0, y: 1 }, colors: ['#facc15', '#ffffff'], startVelocity: v });
        confetti({ particleCount: rm ? 2 : 5, angle: 135, spread: 45, origin: { x: 1, y: 1 }, colors: ['#facc15', '#ffffff'], startVelocity: v });
        confetti({ particleCount: rm ? 2 : 5, angle: 315, spread: 45, origin: { x: 0, y: 0 }, colors: ['#facc15', '#ffffff'], startVelocity: v });
        confetti({ particleCount: rm ? 2 : 5, angle: 225, spread: 45, origin: { x: 1, y: 0 }, colors: ['#facc15', '#ffffff'], startVelocity: v });
        if (Date.now() < end) safeSetTimeout(frame, 30);
    }());
};
const legendaryA_Nuke = (ctx: AudioContext) => {
    const start = ctx.currentTime;
    const chords = [{ freqs: [261.63, 329.63, 392.00, 523.25], t: 0, dur: 1.0 }, { freqs: [349.23, 440.00, 523.25, 698.46], t: 1.0, dur: 1.0 }, { freqs: [392.00, 493.88, 587.33, 783.99], t: 2.0, dur: 1.0 }, { freqs: [523.25, 659.25, 783.99, 1046.50], t: 3.0, dur: 2.0 }];
    chords.forEach(chord => {
        chord.freqs.forEach(f => {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.type = 'sawtooth'; osc.frequency.value = f;
            const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(2000, start + chord.t); filter.frequency.exponentialRampToValueAtTime(400, start + chord.t + chord.dur);
            gain.gain.setValueAtTime(0, start + chord.t); gain.gain.linearRampToValueAtTime(0.15, start + chord.t + 0.1); gain.gain.exponentialRampToValueAtTime(0.01, start + chord.t + chord.dur);
            osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
            osc.start(start + chord.t); osc.stop(start + chord.t + chord.dur); registerOsc(osc);
        });
    });
};

const legendaryV_Glitch = (o: any, rm: boolean) => {
    let end = Date.now() + 2000;
    let interval = { cleared: false }; activeIntervalObjs.push(interval);
    (function frame() {
        if (interval.cleared) return;
        confetti({ particleCount: rm ? 20 : 80, spread: 360, startVelocity: 0, gravity: 0, decay: 0, origin: { x: Math.random(), y: Math.random() }, colors: ['#ff0000', '#00ffff', '#ffffff'], shapes: ['square'], scalar: 1.5, ticks: 10 });
        if (Date.now() < end) safeSetTimeout(frame, 150 + Math.random() * 200);
    }());
};
const legendaryA_Glitch = (ctx: AudioContext) => {
    const start = ctx.currentTime;
    for(let i=0; i<30; i++) {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = Math.random() > 0.5 ? 'square' : 'sawtooth'; osc.frequency.value = 100 + Math.random() * 3000;
        const t = start + Math.random() * 2.0; const dur = 0.02 + Math.random() * 0.05;
        gain.gain.setValueAtTime(0.3, t); gain.gain.setValueAtTime(0, t + dur);
        osc.connect(gain); gain.connect(ctx.destination); osc.start(t); osc.stop(t + dur); registerOsc(osc);
    }
};

const legendaryV_Time = (o: any, rm: boolean) => {
    confetti({ particleCount: 200, spread: 360, origin: {x:0.5, y:0.5}, startVelocity: 100, colors: ['#ffffff'], decay: 0.9, gravity: 0, scalar: 3, zIndex: 99999 });
    safeSetTimeout(() => { confetti({ particleCount: 300, spread: 360, origin: {x:0.5, y:0.5}, startVelocity: 80, colors: ['#000000', '#222222'], decay: 0.98, gravity: -0.5, scalar: 2, zIndex: 99999 }); }, 600);
};
const legendaryA_Time = (ctx: AudioContext) => {
    const start = ctx.currentTime;
    for(let i=0; i<6; i++) {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'triangle'; osc.frequency.value = 3000; const t = start + i*0.1;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.2, t+0.01); g.gain.exponentialRampToValueAtTime(0.01, t+0.05);
        osc.connect(g); g.connect(ctx.destination); osc.start(t); osc.stop(t+0.05); registerOsc(osc);
    }
    const bufferSize = 2 * ctx.sampleRate; const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate); const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer; const g = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 100; const t = start + 0.6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.0, t+0.05); g.gain.exponentialRampToValueAtTime(0.01, t+2.0);
    n.connect(f); f.connect(g); g.connect(ctx.destination); n.start(t); n.stop(t+2.0); registerOsc(n);
};

const legendaryV_Nova = (o: any, rm: boolean) => {
    const count = rm ? 100 : 500;
    confetti({ particleCount: count, spread: 360, startVelocity: 120, origin: {x:0.5, y:0.5}, colors: ['#f43f5e', '#a855f7', '#3b82f6', '#ffffff'], scalar: 1.5, decay: 0.97, gravity: 0 });
    safeSetTimeout(() => { confetti({ particleCount: count*0.8, spread: 360, startVelocity: 50, origin: {x:0.5, y:0.5}, colors: ['#ffffff'], scalar: 2.0, decay: 0.99, gravity: 0.2 }); }, 200);
};
const legendaryA_Nova = (ctx: AudioContext) => {
    const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'sawtooth'; const start = ctx.currentTime;
    osc.frequency.setValueAtTime(100, start); osc.frequency.exponentialRampToValueAtTime(2000, start + 0.6); osc.frequency.exponentialRampToValueAtTime(20, start + 2.5);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.8, start + 0.1); gain.gain.exponentialRampToValueAtTime(0.01, start + 3.0);
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.setValueAtTime(200, start); filter.frequency.exponentialRampToValueAtTime(5000, start+0.6); filter.frequency.exponentialRampToValueAtTime(200, start+2.5);
    osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(start + 3.0); registerOsc(osc);
};

// ============================================
// THE EXPORTED ARRAY
// ============================================
export const THEMES: { id: number, name: string, rarity: 'Common'|'Rare'|'Epic'|'Legendary', visualFn: Function, audioFn: Function }[] = [
${themeEntries}
];

export const getRandomCelebrationTheme = (): any => {
    const bucketRoll = Math.random() * 100;
    let targetBucket: 'Common'|'Rare'|'Epic'|'Legendary' = 'Common';
    if (bucketRoll < 50) targetBucket = 'Common';
    else if (bucketRoll < 80) targetBucket = 'Rare';
    else if (bucketRoll < 95) targetBucket = 'Epic';
    else targetBucket = 'Legendary';
    
    const bucketThemes = THEMES.filter(t => t.rarity === targetBucket);
    return bucketThemes[Math.floor(Math.random() * bucketThemes.length)];
};

export const launchCelebration = (isReducedMotion: boolean, buttonRect?: DOMRect | null, forceId?: number) => {
    const origin = buttonRect ? {
        x: (buttonRect.left + buttonRect.width / 2) / window.innerWidth,
        y: (buttonRect.top + buttonRect.height / 2) / window.innerHeight
    } : { x: 0.5, y: 0.5 };

    let theme = getRandomCelebrationTheme();
    if (forceId !== undefined && forceId >= 1 && forceId <= 100) {
        const forced = THEMES.find(t => t.id === forceId);
        if (forced) theme = forced;
    }
    
    console.log(\`[Celebration Engine V3.0] Rolled Theme #\${theme.id}: \${theme.name} (Rarity: \${theme.rarity})\`);
    
    try {
        theme.visualFn(origin, isReducedMotion);
    } catch (e) {
        console.error("Celebration visual error:", e);
    }
    
    try {
        const ctx = getAudioContext();
        theme.audioFn(ctx);
    } catch (e) {
        console.error("Celebration audio error:", e);
    }
};
\`

fs.writeFileSync('/Users/lijiahao/yasi/src/lib/celebration-engine.ts', fileOut, 'utf8');
console.log('Done writing engine.');
