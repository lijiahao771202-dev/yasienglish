import { useCallback, useEffect, useRef, useState } from "react";

import { mergeChannels, encodeWavPcm16, resampleLinear } from "@/lib/speech-audio";
import { ensureMicrophoneAccess, getMicrophoneErrorMessage } from "@/lib/desktop-media";
import { useDesktopSpeechModel } from "@/hooks/useDesktopSpeechModel";
import {
    type SpeechInputResult,
    LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE,
    LOCAL_SPEECH_MODEL_FAILED_MESSAGE,
    formatSpeechModelStatusMessage,
} from "@/lib/speech-input";

const EMPTY_RESULT: SpeechInputResult = { text: "", isEndpoint: false, isFinal: false };

export function useSpeechInput() {
    const { progress, isDesktopApp, isReady, downloadModel } = useDesktopSpeechModel();
    const [result, setResult] = useState<SpeechInputResult>(EMPTY_RESULT);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [wavBlob, setWavBlob] = useState<Blob | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioUrlRef = useRef<string | null>(null);
    const playbackRef = useRef<HTMLAudioElement | null>(null);
    const analyzerFrameRef = useRef<number | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const inputContextRef = useRef<string>("");

    const clearAudioMeter = useCallback(() => {
        if (analyzerFrameRef.current != null) {
            window.cancelAnimationFrame(analyzerFrameRef.current);
            analyzerFrameRef.current = null;
        }

        analyzerRef.current?.disconnect();
        analyzerRef.current = null;
        audioContextRef.current?.close().catch(() => undefined);
        audioContextRef.current = null;
        setAudioLevel(0);
    }, []);

    useEffect(() => {
        return () => {
            clearAudioMeter();
            mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }
            playbackRef.current?.pause();
        };
    }, [clearAudioMeter]);

    const watchAudioLevel = useCallback((stream: MediaStream) => {
        if (typeof window === "undefined" || typeof AudioContext === "undefined") {
            return;
        }

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let index = 0; index < data.length; index += 1) {
                const centered = (data[index] - 128) / 128;
                sum += centered * centered;
            }
            setAudioLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
            analyzerFrameRef.current = window.requestAnimationFrame(tick);
        };

        audioContextRef.current = audioContext;
        analyzerRef.current = analyser;
        analyzerFrameRef.current = window.requestAnimationFrame(tick);
    }, []);

    const normalizeRecordingBlob = useCallback(async (blob: Blob) => {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new AudioContext();
        const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        const merged = mergeChannels(decoded);
        const resampled = resampleLinear(merged, decoded.sampleRate, 16000);
        await audioContext.close();
        return encodeWavPcm16(resampled, 16000);
    }, []);

    const playRecording = useCallback(() => {
        if (!audioBlob) {
            return;
        }

        playbackRef.current?.pause();
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
        }

        const url = URL.createObjectURL(audioBlob);
        audioUrlRef.current = url;
        const audio = new Audio(url);
        playbackRef.current = audio;
        void audio.play().catch(() => undefined);
    }, [audioBlob]);

    const resetResult = useCallback(() => {
        setResult(EMPTY_RESULT);
        setAudioBlob(null);
        setWavBlob(null);
        setError(null);
    }, []);

    const setContext = useCallback((context: string) => {
        inputContextRef.current = context;
    }, []);

    const startRecognition = useCallback(async () => {
        if (!isDesktopApp) {
            window.alert(LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE);
            return;
        }

        if (progress.status !== "ready") {
            if (progress.status === "missing" || progress.status === "failed") {
                try {
                    await downloadModel();
                } catch (downloadError) {
                    setError(downloadError instanceof Error ? downloadError.message : LOCAL_SPEECH_MODEL_FAILED_MESSAGE);
                }
            } else {
                window.alert(formatSpeechModelStatusMessage(progress));
            }
            return;
        }

        try {
            const access = await ensureMicrophoneAccess();
            if (!access.granted) {
                throw new Error("Yasi 还没有拿到麦克风权限，请到系统设置里允许后再试。");
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            chunksRef.current = [];
            resetResult();
            mediaStreamRef.current = stream;
            watchAudioLevel(stream);

            const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? { mimeType: "audio/webm;codecs=opus" }
                : undefined);
            recorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                setIsProcessing(true);
                clearAudioMeter();
                try {
                    const sourceBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
                    setAudioBlob(sourceBlob);
                    const wavBlob = await normalizeRecordingBlob(sourceBlob);
                    setWavBlob(wavBlob);
                    setResult({
                        text: "",
                        isEndpoint: true,
                        isFinal: true,
                    });
                    setError(null);
                } catch (processingError) {
                    setError(processingError instanceof Error ? processingError.message : LOCAL_SPEECH_MODEL_FAILED_MESSAGE);
                    setResult(EMPTY_RESULT);
                } finally {
                    setIsProcessing(false);
                    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
                    mediaStreamRef.current = null;
                }
            };

            recorder.start(250);
            setIsRecording(true);
            setError(null);
        } catch (startError) {
            const message = getMicrophoneErrorMessage(startError);
            setError(message);
            window.alert(message);
        }
    }, [clearAudioMeter, downloadModel, isDesktopApp, normalizeRecordingBlob, progress, resetResult, watchAudioLevel]);

    const stopRecognition = useCallback(() => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
            return;
        }

        setIsRecording(false);
        recorder.stop();
    }, []);

    return {
        isAvailable: isDesktopApp,
        canRecord: isDesktopApp && isReady,
        unavailableReason: isDesktopApp ? formatSpeechModelStatusMessage(progress) : LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE,
        isRecording,
        isProcessing,
        result,
        audioBlob,
        wavBlob,
        audioLevel,
        error,
        modelStatus: progress.status,
        modelProgress: progress,
        setContext,
        startRecognition,
        stopRecognition,
        playRecording,
        resetResult,
        downloadModel,
    };
}
