export const playPersonaWakeup = (persona: string) => {
    if (typeof window === 'undefined') return;

    // We use a shared AudioContext or create one
    // Some browsers require user interaction, but this is triggered from a keyboard event
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    switch (persona) {
        case 'minimal':
            // Hacker: Quick dual tone (digital beep)
            osc.type = 'square';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.setValueAtTime(1760, now + 0.05);
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'socratic':
            // Socratic: Singing bowl (long, pure, vibrating sine)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now); // A4
            // Slight vibrato using another oscillator
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 4; // 4Hz vibrato
            const lfoGain = ctx.createGain();
            lfoGain.gain.value = 5; // Pitch variation
            lfo.connect(lfoGain);
            lfoGain.connect(osc.frequency);
            lfo.start(now);
            lfo.stop(now + 2);

            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 2);
            osc.start(now);
            osc.stop(now + 2);
            break;

        case 'strict':
            // Strict: Heavy gavel/whip thud (triangle wave with pitch drop)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            gainNode.gain.setValueAtTime(0.5, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'encouraging':
            // Encouraging: Magic chime (two arpeggiated bells)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(783.99, now + 0.1); // G5
            osc.frequency.setValueAtTime(1046.50, now + 0.2); // C6

            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
            
            // Re-trigger envelope
            gainNode.gain.setValueAtTime(0.1, now + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
            
            gainNode.gain.setValueAtTime(0.15, now + 0.2);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
            
            osc.start(now);
            osc.stop(now + 0.8);
            break;

        case 'ancient':
            // Ancient: Bamboo block strike
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

            // Give it a wooden resonance using a bandpass filter
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 600;
            filter.Q.value = 5;

            osc.disconnect();
            osc.connect(filter);
            filter.connect(gainNode);

            gainNode.gain.setValueAtTime(0.6, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;

        case 'tsundere':
            // Tsundere: Sharp squeaky "Hmph!" abstract sound
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

            const filterT = ctx.createBiquadFilter();
            filterT.type = 'lowpass';
            filterT.frequency.value = 2000;
            
            osc.disconnect();
            osc.connect(filterT);
            filterT.connect(gainNode);

            gainNode.gain.setValueAtTime(0.0, now);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'roleplay':
            // Roleplay: Shimmering curtain / dramatic flair
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(600, now + 0.4);
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.2);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;

        case 'chinglish':
            // Chinglish: Snappy pop
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            gainNode.gain.setValueAtTime(0.4, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
            break;

        default:
            // Standard: Modern gentle notification swoosh
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            break;
    }

    // Auto cleanup
    setTimeout(() => {
        if (ctx.state !== 'closed') {
            ctx.close();
        }
    }, 2500);
};
