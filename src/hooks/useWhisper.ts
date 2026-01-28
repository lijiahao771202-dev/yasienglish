import { useState, useRef, useCallback, useEffect } from 'react';

// Removed external WHISPER_SERVER constant to use internal Next.js API route

interface WhisperResult {
    text: string;
    isEndpoint: boolean;
    isFinal: boolean;
}

export function useWhisper() {
    const [isReady, setIsReady] = useState(true);
    const [result, setResult] = useState<WhisperResult>({ text: "", isEndpoint: false, isFinal: false });
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recognitionRef = useRef<any>(null);

    // Audio Analysis & VAD
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const [contextPrompt, setContext] = useState<string>("");
    const [engineMode, setEngineMode] = useState<'fast' | 'precise'>('precise'); // Default to precise

    // 1. Stop Recognition (Defined first to be used by resetSilenceTimer)
    const stopRecognition = useCallback(async () => {
        if (!streamRef.current) return; // Already stopped

        setIsRecording(false);
        setIsProcessing(true);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        // Stop Web Speech API
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) { }
        }

        // Stop MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            await new Promise(resolve => {
                mediaRecorderRef.current!.onstop = resolve;
            });
        }

        // Stop streams & context
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        setAudioLevel(0);

        // Create blob
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);

        // Send to Whisper (Internal API)
        // Send to Whisper
        if (engineMode === 'precise') {
            try {
                console.log('[ASR] Precise Mode: Sending to API /api/ai/transcribe...');

                const formData = new FormData();
                formData.append('file', blob, 'recording.webm');

                // Context Priming: Improves accuracy for specific vocabulary/sentences
                if (contextPrompt) {
                    formData.append('prompt', contextPrompt);
                    console.log('[ASR] Context priming:', contextPrompt.slice(0, 50) + "...");
                }

                const response = await fetch('/api/ai/transcribe', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                const text = data.text || (data.success && data.text) || "";

                if (text) {
                    setResult({
                        text: text,
                        isEndpoint: true,
                        isFinal: true
                    });
                } else {
                    // If Whisper fails or returns empty, keep the WebSpeech result (if any)
                    setResult(prev => ({ ...prev, isFinal: true }));
                }
            } catch (err) {
                console.error('[ASR] Error:', err);
                setResult(prev => ({ ...prev, isFinal: true }));
            }
        } else {
            console.log('[ASR] Fast Mode: Skipping Server Upload (Using WebSpeech)');
            setResult(prev => ({ ...prev, isFinal: true }));
        }

        setIsProcessing(false);
    }, [contextPrompt, engineMode]);

    // 2. Reset Silence Timer
    const resetSilenceTimer = useCallback(() => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
            console.log('[VAD] Silence detected (3s strict), stopping...');
            stopRecognition();
        }, 3000); // 3 seconds (More forgiving for learners)
    }, [stopRecognition]);

    // 3. Start Recognition
    const startRecognition = useCallback(async () => {
        try {
            chunksRef.current = [];
            setAudioBlob(null);
            setResult({ text: "", isEndpoint: false, isFinal: false });

            // Start Web Speech API
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.start();
                } catch (e) {
                    console.warn('[WebSpeech] Already started:', e);
                }
            }

            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });
            streamRef.current = stream;

            // Setup Audio Context for Visualization & VAD
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 256;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;

            // Volume Monitoring Loop
            const checkVolume = () => {
                if (!analyserRef.current) return;
                analyserRef.current.getByteFrequencyData(dataArray);

                // Calculate RMS
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i] * dataArray[i];
                }
                const rms = Math.sqrt(sum / dataArray.length);
                const normalizedVolume = Math.min(100, (rms / 128) * 100);

                setAudioLevel(normalizedVolume);

                // Simple VAD based on volume threshold (10 out of 100)
                if (normalizedVolume > 10) {
                    resetSilenceTimer();
                }

                if (streamRef.current?.active) {
                    requestAnimationFrame(checkVolume);
                }
            };
            checkVolume();
            resetSilenceTimer(); // Start initial timer

            // Set up MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };
            mediaRecorder.start(200); // Collect data frequently
            mediaRecorderRef.current = mediaRecorder;

            setIsRecording(true);

        } catch (error) {
            console.error('[ASR] Failed to start:', error);
        }
    }, [resetSilenceTimer]);

    // Initialize Web Speech API
    useEffect(() => {
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const recognition = new (window as any).webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let finalTranscript = '';

                // Fix: Loop from 0 to capture ALL results, not just the update.
                // Web Speech API maintains the full session history in event.results.
                for (let i = 0; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                const currentText = finalTranscript + interimTranscript;
                if (currentText) {
                    setResult(prev => ({
                        ...prev,
                        text: currentText,
                        isEndpoint: false,
                        isFinal: false
                    }));

                    // Reset silence timer on speech detection from API (Backup VAD)
                    resetSilenceTimer();
                }
            };

            recognitionRef.current = recognition;
        }
    }, [resetSilenceTimer]);

    const playRecording = useCallback(() => {
        if (audioBlob) {
            const url = URL.createObjectURL(audioBlob);
            const audio = new Audio(url);
            audio.play();
            audio.onended = () => URL.revokeObjectURL(url);
        }
    }, [audioBlob]);

    return {
        isReady,
        isRecording,
        isProcessing,
        result,
        audioBlob,
        audioLevel, // Exposed for UI
        setContext, // Enable context priming
        startRecognition,
        stopRecognition,
        playRecording,
        engineMode,
        setEngineMode
    };
}