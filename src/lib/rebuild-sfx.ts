export type RebuildSfxType = "pick" | "remove" | "submit" | "success" | "celebrate" | "error";

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
