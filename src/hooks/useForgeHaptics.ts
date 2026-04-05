import { useCallback, useRef } from 'react';

/**
 * useForgeHaptics - 高质感交互反馈系统
 * 用于提供令人上瘾的点击音效和触感反馈
 */
export const useForgeHaptics = () => {
  const audioContextRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  /**
   * 触发“锻造”音效 (厚重、清脆、金属感)
   */
  const playForgeSound = useCallback((isMastered: boolean) => {
    initAudio();
    const ctx = audioContextRef.current!;
    const now = ctx.currentTime;
    
    // 创建振荡器
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    // 根据状态调整频率：掌握时更高亢清脆，锻造时更深沉有力
    osc.type = isMastered ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(isMastered ? 880 : 440, now);
    osc.frequency.exponentialRampToValueAtTime(isMastered ? 220 : 110, now + 0.15);
    
    // 增益控制 (Envelope)
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.2);
    
    // 增加一个超高频的“咔哒”声，提升清脆感
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(4000, now);
    clickGain.gain.setValueAtTime(0.1, now);
    clickGain.gain.exponentialRampToValueAtTime(0.01, now + 0.02);
    click.connect(clickGain);
    clickGain.connect(ctx.destination);
    click.start(now);
    click.stop(now + 0.02);
  }, []);

  /**
   * 触发“成就”音效 (更丰富、具有回响)
   */
  const playSuccessSound = useCallback(() => {
    initAudio();
    const ctx = audioContextRef.current!;
    const now = ctx.currentTime;
    
    const frequencies = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    
    frequencies.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.05);
      
      gain.gain.setValueAtTime(0.1, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.3);
    });
  }, []);

  /**
   * 触发“史诗级”成就音效 (宽广的和弦加上次声频打击感)
   */
  const playGrandSuccessSound = useCallback(() => {
    initAudio();
    const ctx = audioContextRef.current!;
    const now = ctx.currentTime;
    
    // 基础和弦进行: Cmaj9 -> Fmaj7 -> C大和弦 (壮阔感)
    const chords = [
      { freqs: [261.63, 329.63, 392.00, 493.88, 587.33], time: 0, duration: 0.8 },      // Cmaj9
      { freqs: [349.23, 440.00, 523.25, 659.25], time: 0.9, duration: 1.0 },              // Fmaj7
      { freqs: [523.25, 659.25, 783.99, 1046.50, 1318.51], time: 2.0, duration: 2.5 }     // High C Major sweep
    ];

    chords.forEach(chord => {
      chord.freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, now + chord.time);
        
        // Envelope: 缓慢上升, 悠长衰减
        gain.gain.setValueAtTime(0.001, now + chord.time);
        gain.gain.linearRampToValueAtTime(0.08, now + chord.time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + chord.time + chord.duration);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now + chord.time);
        osc.stop(now + chord.time + chord.duration);
      });
    });

    // Sub-bass sweep at the final chord for maximum impact
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, now + 2.0); // A2
    subOsc.frequency.exponentialRampToValueAtTime(55, now + 3.0); // glissando down to A1
    
    subGain.gain.setValueAtTime(0.001, now + 2.0);
    subGain.gain.linearRampToValueAtTime(0.2, now + 2.1);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 4.0);
    
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now + 2.0);
    subOsc.stop(now + 4.0);
    
    // Sparkle ping at the very end
    const pingOsc = ctx.createOscillator();
    const pingGain = ctx.createGain();
    pingOsc.type = 'sine';
    pingOsc.frequency.setValueAtTime(2093.00, now + 2.2); // C7
    
    pingGain.gain.setValueAtTime(0.1, now + 2.2);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 3.5);
    
    pingOsc.connect(pingGain);
    pingGain.connect(ctx.destination);
    pingOsc.start(now + 2.2);
    pingOsc.stop(now + 3.5);
    
  }, []);

  return { playForgeSound, playSuccessSound, playGrandSuccessSound };
};
