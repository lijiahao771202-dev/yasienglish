"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Loader2, RefreshCw, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
    text: string;
    voice?: string;
}

export function AudioPlayer({ text, voice = "en-US-JennyNeural" }: AudioPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const userContainerRef = useRef<HTMLDivElement>(null);
    const wavesurfer = useRef<WaveSurfer | null>(null);
    const userWavesurfer = useRef<WaveSurfer | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const audioChunks = useRef<Blob[]>([]);

    const generateAudio = async () => {
        if (!text) return;
        setIsLoading(true);
        try {
            const response = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voice }),
            });

            if (!response.ok) throw new Error("TTS failed");

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setAudioUrl(url);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (audioUrl && containerRef.current) {
            wavesurfer.current = WaveSurfer.create({
                container: containerRef.current,
                waveColor: "rgba(34, 211, 238, 0.4)",
                progressColor: "#22d3ee",
                cursorColor: "#8b5cf6",
                barWidth: 2,
                barGap: 3,
                height: 60,
                normalize: true,
            });

            wavesurfer.current.load(audioUrl);
            wavesurfer.current.on('finish', () => setIsPlaying(false));

            return () => {
                wavesurfer.current?.destroy();
            };
        }
    }, [audioUrl]);

    useEffect(() => {
        if (userAudioUrl && userContainerRef.current) {
            userWavesurfer.current = WaveSurfer.create({
                container: userContainerRef.current,
                waveColor: "rgba(168, 85, 247, 0.4)", // Purple
                progressColor: "#a855f7",
                cursorColor: "#22d3ee",
                barWidth: 2,
                barGap: 3,
                height: 40,
                normalize: true,
            });
            userWavesurfer.current.load(userAudioUrl);
            return () => {
                userWavesurfer.current?.destroy();
            };
        }
    }, [userAudioUrl]);

    const togglePlay = () => {
        if (wavesurfer.current) {
            wavesurfer.current.playPause();
            setIsPlaying(!isPlaying);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder.current = new MediaRecorder(stream);
            audioChunks.current = [];

            mediaRecorder.current.ondataavailable = (event) => {
                audioChunks.current.push(event.data);
            };

            mediaRecorder.current.onstop = () => {
                const audioBlob = new Blob(audioChunks.current, { type: "audio/wav" });
                const url = URL.createObjectURL(audioBlob);
                setUserAudioUrl(url);
            };

            mediaRecorder.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
        }
    };

    const stopRecording = () => {
        if (mediaRecorder.current && isRecording) {
            mediaRecorder.current.stop();
            setIsRecording(false);
            mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    const playUserAudio = () => {
        userWavesurfer.current?.playPause();
    };

    return (
        <div className="glass-panel p-6 rounded-2xl space-y-6 w-full max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-cyan-100">Shadowing Player</h3>
                {!audioUrl && (
                    <button
                        onClick={generateAudio}
                        disabled={isLoading}
                        className="glass-button px-4 py-2 rounded-lg text-sm flex items-center gap-2 text-cyan-400"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Generate Audio
                    </button>
                )}
            </div>

            {/* Main Player (TTS) */}
            <div className={cn("relative", !audioUrl && "opacity-50 pointer-events-none")}>
                <div ref={containerRef} className="w-full" />
                {audioUrl && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {!isPlaying && (
                            <div className="bg-black/30 backdrop-blur-sm p-4 rounded-full">
                                <Play className="w-8 h-8 text-white fill-white" />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Controls */}
            {audioUrl && (
                <div className="flex justify-center gap-6 items-center">
                    {/* Play/Pause TTS */}
                    <button
                        onClick={togglePlay}
                        className="glass-button w-14 h-14 rounded-full flex items-center justify-center text-white hover:bg-cyan-500/20 transition-all"
                    >
                        {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
                    </button>

                    {/* Recording Controls */}
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={cn(
                            "glass-button w-14 h-14 rounded-full flex items-center justify-center transition-all",
                            isRecording ? "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse" : "text-purple-400 hover:bg-purple-500/20"
                        )}
                    >
                        {isRecording ? <Square className="w-6 h-6 fill-current" /> : <Mic className="w-6 h-6" />}
                    </button>
                </div>
            )}

            {/* User Recording Visualization */}
            {userAudioUrl && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center justify-between text-xs text-purple-300 uppercase tracking-wider font-semibold">
                        <span>Your Recording</span>
                        <button onClick={playUserAudio} className="hover:text-white flex items-center gap-1">
                            <Play className="w-3 h-3" /> Play
                        </button>
                    </div>
                    <div ref={userContainerRef} className="w-full bg-black/20 rounded-lg p-2" />
                </div>
            )}
        </div>
    );
}
