export type RebuildSfxType = "pick" | "autocomplete" | "remove" | "submit" | "success" | "celebrate" | "perfect" | "error" | "type";

let audioContext: AudioContext | null = null;
let resumePromise: Promise<void> | null = null;

function getAudioContext() {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioContext) {
        audioContext = new Ctx();
    }
    return audioContext;
}

function ensureAudioContextRunning(context: AudioContext) {
    if (context.state === "running") {
        return Promise.resolve();
    }

    if (!resumePromise) {
        resumePromise = context.resume()
            .catch(() => undefined)
            .then(() => undefined)
            .finally(() => {
                resumePromise = null;
            });
    }

    return resumePromise;
}

function scheduleTone(
    context: AudioContext,
    {
        frequency,
        startTime,
        duration,
        gain,
        type = "sine",
    }: {
        frequency: number;
        startTime: number;
        duration: number;
        gain: number;
        type?: OscillatorType;
    },
) {
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(gain, startTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
}

function playWithContext(context: AudioContext, type: RebuildSfxType) {
    const startTime = context.currentTime + 0.01;

    switch (type) {
        case "autocomplete": {
            // Soft, warm "wooden knock" — satisfying tactile tap
            // Layer 1: Quick warm body tap
            const osc1 = context.createOscillator();
            const g1 = context.createGain();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(880, startTime);
            osc1.frequency.exponentialRampToValueAtTime(440, startTime + 0.04);
            g1.gain.setValueAtTime(0, startTime);
            g1.gain.linearRampToValueAtTime(0.06, startTime + 0.003);
            g1.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);
            osc1.connect(g1);
            g1.connect(context.destination);
            osc1.start(startTime);
            osc1.stop(startTime + 0.08);

            // Layer 2: Gentle high overtone shimmer
            const osc2 = context.createOscillator();
            const g2 = context.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(1760, startTime);
            g2.gain.setValueAtTime(0, startTime);
            g2.gain.linearRampToValueAtTime(0.02, startTime + 0.002);
            g2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.035);
            osc2.connect(g2);
            g2.connect(context.destination);
            osc2.start(startTime);
            osc2.stop(startTime + 0.05);
            return;
        }
        case "type": {
            // Beautiful, Warm Marimba (F5)
            // Layer 1: Woody Fundamental
            const osc1 = context.createOscillator();
            const g1 = context.createGain();
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(698.46, startTime); // F5
            g1.gain.setValueAtTime(0, startTime);
            g1.gain.linearRampToValueAtTime(0.15, startTime + 0.002);
            g1.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);
            osc1.connect(g1);
            g1.connect(context.destination);
            osc1.start(startTime);
            osc1.stop(startTime + 0.3);

            // Layer 2: Mellow overtone (wooden mallet strike)
            const osc2 = context.createOscillator();
            const g2 = context.createGain();
            osc2.type = "sine"; // Using sine instead of triangle to prevent harsh buzzing
            osc2.frequency.setValueAtTime(2793.83, startTime); // F7
            g2.gain.setValueAtTime(0, startTime);
            g2.gain.linearRampToValueAtTime(0.06, startTime + 0.001);
            g2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);
            osc2.connect(g2);
            g2.connect(context.destination);
            osc2.start(startTime);
            osc2.stop(startTime + 0.08);

            return;
        }
        case "pick": {
            // Elegant, elastic "bubble pop" sound for picking a word
            const osc = context.createOscillator();
            const gainNode = context.createGain();
            osc.connect(gainNode);
            gainNode.connect(context.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(400, startTime);
            osc.frequency.exponentialRampToValueAtTime(1200, startTime + 0.04);
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.08, startTime + 0.005);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);
            osc.start(startTime);
            osc.stop(startTime + 0.1);
            return;
        }
        case "remove": {
            // Soft hollow "thwack" dropping sound for removing a word
            const osc = context.createOscillator();
            const gainNode = context.createGain();
            osc.connect(gainNode);
            gainNode.connect(context.destination);
            osc.type = "triangle";
            osc.frequency.setValueAtTime(700, startTime);
            osc.frequency.exponentialRampToValueAtTime(150, startTime + 0.05);
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.06, startTime + 0.005);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.07);
            osc.start(startTime);
            osc.stop(startTime + 0.08);
            return;
        }
        case "submit":
            scheduleTone(context, { frequency: 540, startTime, duration: 0.05, gain: 0.027, type: "square" });
            scheduleTone(context, { frequency: 820, startTime: startTime + 0.05, duration: 0.09, gain: 0.02, type: "triangle" });
            return;
        case "success":
            scheduleTone(context, { frequency: 660, startTime, duration: 0.08, gain: 0.04, type: "triangle" });
            scheduleTone(context, { frequency: 880, startTime: startTime + 0.07, duration: 0.1, gain: 0.03, type: "triangle" });
            scheduleTone(context, { frequency: 1180, startTime: startTime + 0.15, duration: 0.14, gain: 0.024, type: "sine" });
            return;
        case "celebrate":
            scheduleTone(context, { frequency: 523, startTime, duration: 0.11, gain: 0.048, type: "triangle" });
            scheduleTone(context, { frequency: 659, startTime: startTime + 0.08, duration: 0.12, gain: 0.045, type: "triangle" });
            scheduleTone(context, { frequency: 784, startTime: startTime + 0.15, duration: 0.14, gain: 0.042, type: "sine" });
            scheduleTone(context, { frequency: 1046, startTime: startTime + 0.24, duration: 0.16, gain: 0.03, type: "sine" });
            return;
        case "perfect": {
            // "Bling-bling-BLING" chord
            const times = [0, 0.08, 0.16];
            const freqs = [659.25, 830.61, 1318.51]; // E5, G#5, E6
            times.forEach((t, i) => {
                const osc = context.createOscillator();
                const gain = context.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freqs[i], startTime + t);
                gain.gain.setValueAtTime(0, startTime + t);
                gain.gain.linearRampToValueAtTime(0.12, startTime + t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + t + 0.4);
                osc.connect(gain);
                gain.connect(context.destination);
                osc.start(startTime + t);
                osc.stop(startTime + t + 0.5);
            });
            
            // Heavy Sub bass drop
            const osc = context.createOscillator();
            const gain = context.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(200, startTime + 0.16);
            osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.6);
            gain.gain.setValueAtTime(0, startTime + 0.16);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.18);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
            osc.connect(gain);
            gain.connect(context.destination);
            osc.start(startTime + 0.16);
            osc.stop(startTime + 0.8);

            // Explosive Firework Noise Crackle
            const bufferSize = context.sampleRate * 0.5;
            const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = context.createBufferSource();
            noise.buffer = buffer;
            const filter = context.createBiquadFilter();
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(2000, startTime + 0.16);
            filter.frequency.exponentialRampToValueAtTime(200, startTime + 0.6);
            const noiseGain = context.createGain();
            noiseGain.gain.setValueAtTime(0, startTime + 0.16);
            noiseGain.gain.linearRampToValueAtTime(0.1, startTime + 0.18);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.7);
            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(context.destination);
            noise.start(startTime + 0.16);
            noise.stop(startTime + 0.8);

            return;
        }
        case "error":
            scheduleTone(context, { frequency: 280, startTime, duration: 0.08, gain: 0.02, type: "sawtooth" });
            scheduleTone(context, { frequency: 220, startTime: startTime + 0.06, duration: 0.1, gain: 0.015, type: "triangle" });
            return;
    }
}

export function playRebuildSfx(type: RebuildSfxType) {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === "running") {
        playWithContext(context, type);
        return;
    }

    void ensureAudioContextRunning(context).then(() => {
        if (context.state !== "running") return;
        playWithContext(context, type);
    });
}
