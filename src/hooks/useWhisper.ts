import { useState, useRef, useCallback, useEffect } from 'react';

const WHISPER_SERVER = 'http://localhost:3002';

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

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                // Update result with real-time text
                // We prioritize interim results for immediate feedback
                const currentText = finalTranscript + interimTranscript;
                if (currentText) {
                    setResult(prev => ({
                        ...prev,
                        text: currentText,
                        isEndpoint: false,
                        isFinal: false
                    }));
                }
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const startRecognition = useCallback(async () => {
        try {
            chunksRef.current = [];
            setAudioBlob(null);
            setResult({ text: "", isEndpoint: false, isFinal: false });

            // Start Web Speech API for real-time preview
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.start();
                } catch (e) {
                    console.warn('[WebSpeech] Already started or error:', e);
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

            // Set up MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };
            mediaRecorder.start(1000); // Collect data every second
            mediaRecorderRef.current = mediaRecorder;

            setIsRecording(true);

        } catch (error) {
            console.error('[ASR] Failed to start:', error);
        }
    }, []);

    const stopRecognition = useCallback(async () => {
        setIsRecording(false);
        setIsProcessing(true);

        // Stop Web Speech API
        if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            } catch (e) {
                console.warn('[WebSpeech] Error stopping:', e);
            }
        }

        // Stop MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();

            // Wait for final data
            await new Promise(resolve => {
                mediaRecorderRef.current!.onstop = resolve;
            });
        }

        // Stop media stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Create blob from chunks
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);

        // Send to Whisper for transcription
        try {
            console.log('[ASR] Sending to Whisper for transcription...', blob.size, 'bytes');

            const response = await fetch(`${WHISPER_SERVER}/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: blob
            });

            const data = await response.json();
            console.log('[ASR] Whisper result:', data);

            // Handle various response formats from local whisper servers
            const text = data.text || (data.success && data.text) || "";

            if (text) {
                setResult({
                    text: text,
                    isEndpoint: true,
                    isFinal: true
                });
            } else {
                console.error('[ASR] Whisper error:', data.error);
                setResult(prev => ({ ...prev, isFinal: true }));
            }
        } catch (err) {
            console.error('[ASR] Error sending to Whisper:', err);
            setResult(prev => ({ ...prev, isFinal: true }));
        }

        setIsProcessing(false);
    }, []);

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
        startRecognition,
        stopRecognition,
        playRecording
    };
}