import React, { useEffect, useRef } from 'react';

interface WaveformVisualizerProps {
    stream: MediaStream | null;
    isRecording: boolean;
}

export function WaveformVisualizer({ stream, isRecording }: WaveformVisualizerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const contextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
        if (!stream || !isRecording || !canvasRef.current) return;

        // Initialize Audio Context
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        contextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!isRecording) return;

            animationRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            canvasCtx.fillStyle = 'rgb(20, 20, 30)'; // Dark background to match theme
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i] / 2;

                // Gradient color: Cyan to Purple
                const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, '#06b6d4'); // Cyan-500
                gradient.addColorStop(1, '#a855f7'); // Purple-500

                canvasCtx.fillStyle = gradient;
                canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        };

        draw();

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (contextRef.current) contextRef.current.close();
        };
    }, [stream, isRecording]);

    return (
        <canvas
            ref={canvasRef}
            width={300}
            height={60}
            className="w-full h-full rounded-lg opacity-80"
        />
    );
}
