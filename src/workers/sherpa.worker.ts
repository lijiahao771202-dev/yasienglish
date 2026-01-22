/// <reference lib="webworker" />

// sherpa.worker.ts

// Define types for the Sherpa global object
interface SherpaOnnx {
    createOnlineRecognizer: (config: any) => any;
}

declare const Module: any;
declare const SherpaOnnx: SherpaOnnx;

let recognizer: any = null;
let isReady = false;

// Configuration for the model files
// These should be placed in public/sherpa/
const modelConfig = {
    tokens: "./sherpa/tokens.txt",
    provider: "cpu",
    encoder: "./sherpa/encoder-epoch-99-avg-1.onnx",
    decoder: "./sherpa/decoder-epoch-99-avg-1.onnx",
    joiner: "./sherpa/joiner-epoch-99-avg-1.onnx",
    numThreads: 1,
    decodingMethod: "greedy_search",
    debug: false,
};

// Helper to load the WASM script
const loadSherpa = async () => {
    try {
        // We use importScripts to load the main JS wrapper for WASM
        // This assumes the file is at public/sherpa/sherpa-onnx-wasm-main.js
        importScripts('./sherpa/sherpa-onnx-wasm-main.js');

        // Wait for Module to be ready (standard Emscripten pattern)
        if (typeof Module !== 'undefined') {
            return new Promise<void>((resolve) => {
                Module.onRuntimeInitialized = () => {
                    resolve();
                };
            });
        }
    } catch (e) {
        console.error("Failed to load Sherpa WASM script:", e);
        throw e;
    }
};

self.onmessage = async (event: MessageEvent) => {
    const { type, data } = event.data;

    if (type === 'init') {
        try {
            console.log("[Sherpa Worker] Initializing...");

            // 1. Load the WASM wrapper using absolute path
            const scriptUrl = self.location.origin + '/sherpa/sherpa-onnx-wasm-main.js';
            console.log("[Sherpa Worker] Loading script from:", scriptUrl);
            importScripts(scriptUrl);

            // 2. Wait for Module to be ready using the Emscripten callback pattern
            await new Promise<void>((resolve, reject) => {
                if (typeof Module === 'undefined') {
                    reject(new Error("Module is undefined after importScripts"));
                    return;
                }

                // Check if Module is already initialized (rare but possible)
                if (Module.calledRun) {
                    console.log("[Sherpa Worker] Module already initialized");
                    resolve();
                    return;
                }

                // Set the callback
                Module.onRuntimeInitialized = () => {
                    console.log("[Sherpa Worker] WASM runtime initialized");
                    resolve();
                };

                // Timeout after 30 seconds
                setTimeout(() => reject(new Error("WASM initialization timeout")), 30000);
            });

            console.log("[Sherpa Worker] WASM Module loaded. Creating recognizer...");

            // 3. Initialize the recognizer
            if (typeof SherpaOnnx === 'undefined') {
                throw new Error("SherpaOnnx global not found after WASM load");
            }

            recognizer = SherpaOnnx.createOnlineRecognizer({
                featConfig: {
                    sampleRate: 16000,
                    featureDim: 80,
                },
                modelConfig: modelConfig
            });

            console.log("[Sherpa Worker] Recognizer created successfully");
            isReady = true;
            self.postMessage({ type: 'init-success' });

        } catch (error) {
            console.error("[Sherpa Worker] Init failed:", error);
            self.postMessage({ type: 'init-error', data: { error: String(error) } });
        }
    }

    if (type === 'start') {
        if (recognizer) {
            recognizer.reset();
        }
        console.log("[Sherpa Worker] Started");
    }

    if (type === 'audio-chunk') {
        if (recognizer) {
            try {
                const float32Array = new Float32Array(data);
                recognizer.acceptWaveform(16000, float32Array);
                const result = recognizer.getResult();
                if (result.text.length > 0) {
                    self.postMessage({ type: 'result', data: { text: result.text, isFinal: false } });
                }
            } catch (e) {
                console.error("[Sherpa Worker] Error processing audio chunk:", e);
            }
        }
    }

    if (type === 'stop') {
        if (recognizer) {
            const result = recognizer.getResult();
            self.postMessage({ type: 'result', data: { text: result.text, isFinal: true } });
        }
        console.log("[Sherpa Worker] Stopped");
    }
};

export { };
