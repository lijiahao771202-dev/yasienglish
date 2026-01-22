import { useState, useEffect, useRef, useCallback } from 'react';

// Define types for Sherpa messages
interface SherpaResult {
    text: string;
    isFinal: boolean;
    timestamps?: number[];
}

export function useSherpa() {
    const [isReady, setIsReady] = useState(false);
    const [result, setResult] = useState<SherpaResult>({ text: "", isFinal: false });
    const workerRef = useRef<Worker | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        // Initialize Worker
        const worker = new Worker(new URL('../workers/sherpa.worker.ts', import.meta.url));

        worker.onmessage = (event) => {
            const { type, data } = event.data;
            if (type === 'init-success') {
                console.log("[Sherpa] Initialized successfully");
                setIsReady(true);
            } else if (type === 'result') {
                setResult(data);
            } else if (type === 'init-error') {
                console.error("[Sherpa] Initialization error:", data.error);
            }
        };

        // Send init message
        worker.postMessage({ type: 'init' });

        workerRef.current = worker;

        return () => {
            worker.terminate();
        };
    }, []);

    const startRecognition = useCallback(async () => {
        if (!isReady || !workerRef.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            streamRef.current = stream;

            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);
            // Buffer size 4096 is a good balance between latency and performance
            const processor = audioContext.createScriptProcessor(4096, 1, 1);

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Send copy of data to worker to avoid transfer issues with shared buffers if any
                workerRef.current?.postMessage({
                    type: 'audio-chunk',
                    data: inputData
                });
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            scriptProcessorRef.current = processor;

            workerRef.current.postMessage({ type: 'start' });

        } catch (error) {
            console.error("[Sherpa] Failed to start recording:", error);
        }
    }, [isReady]);

    const stopRecognition = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'stop' });
        }
    }, []);

    return {
        isReady,
        result,
        startRecognition,
        stopRecognition
    };
}
