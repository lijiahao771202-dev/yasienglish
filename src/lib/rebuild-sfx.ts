export type RebuildSfxType = "pick" | "remove" | "submit" | "success" | "error";

let audioContext: AudioContext | null = null;

function getAudioContext() {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioContext) {
        audioContext = new Ctx();
    }
    return audioContext;
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

export function playRebuildSfx(type: RebuildSfxType) {
    const context = getAudioContext();
    if (!context) return;
    void context.resume().catch(() => undefined);

    const startTime = context.currentTime + 0.005;

    switch (type) {
        case "pick":
            scheduleTone(context, { frequency: 720, startTime, duration: 0.06, gain: 0.028, type: "triangle" });
            scheduleTone(context, { frequency: 960, startTime: startTime + 0.045, duration: 0.08, gain: 0.018, type: "sine" });
            return;
        case "remove":
            scheduleTone(context, { frequency: 430, startTime, duration: 0.055, gain: 0.022, type: "triangle" });
            scheduleTone(context, { frequency: 310, startTime: startTime + 0.04, duration: 0.06, gain: 0.015, type: "sine" });
            return;
        case "submit":
            scheduleTone(context, { frequency: 540, startTime, duration: 0.05, gain: 0.025, type: "square" });
            scheduleTone(context, { frequency: 820, startTime: startTime + 0.05, duration: 0.09, gain: 0.018, type: "triangle" });
            return;
        case "success":
            scheduleTone(context, { frequency: 660, startTime, duration: 0.08, gain: 0.03, type: "triangle" });
            scheduleTone(context, { frequency: 880, startTime: startTime + 0.07, duration: 0.1, gain: 0.024, type: "triangle" });
            scheduleTone(context, { frequency: 1180, startTime: startTime + 0.15, duration: 0.14, gain: 0.02, type: "sine" });
            return;
        case "error":
            scheduleTone(context, { frequency: 280, startTime, duration: 0.08, gain: 0.018, type: "sawtooth" });
            scheduleTone(context, { frequency: 220, startTime: startTime + 0.06, duration: 0.1, gain: 0.013, type: "triangle" });
            return;
    }
}
