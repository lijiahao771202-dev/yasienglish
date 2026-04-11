import { pipeline, FeatureExtractionPipeline, env } from '@huggingface/transformers';

// Optimization for Domestic Network
env.allowLocalModels = false;
env.remoteHost = 'https://hf-mirror.com';

let generator: FeatureExtractionPipeline | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

async function initModel(modelId: string, onProgress: (progress: any) => void) {
    if (generator) return;
    if (initPromise) return initPromise;
    
    isInitializing = true;
    initPromise = (async () => {
        try {
            // Strip all forced configurations (device, dtype, quantizations)
            // Let Transformers.js globally negotiate the best available format automatically.
            generator = await pipeline(
                'feature-extraction',
                modelId,
                {
                    progress_callback: onProgress,
                }
            );
        } catch (err: any) {
            console.error("Initialization Error:", err);
            throw new Error(`Failed to load model. Error: ${err.message || String(err)}`);
        } finally {
            isInitializing = false;
        }
    })();
    
    return initPromise;
}

function cosineSimilarity(v1: Float32Array | number[], v2: Float32Array | number[]) {
    let dot = 0; let n1 = 0; let n2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        n1 += v1[i] * v1[i];
        n2 += v2[i] * v2[i];
    }
    const den = Math.sqrt(n1) * Math.sqrt(n2);
    return den === 0 ? 0 : dot / den;
}

self.addEventListener('message', async (e) => {
    const { id, type, payload } = e.data;
    
    if (type === 'init') {
        const { modelId } = payload;
        try {
            await initModel(modelId, (progress) => {
                self.postMessage({ id, type: 'init_progress', payload: progress });
            });
            self.postMessage({ id, type: 'init_ready' });
        } catch (error: any) {
            self.postMessage({ id, type: 'init_error', payload: error.message || String(error) });
        }
    } 
    else if (type === 'predict') {
        const { input, reference } = payload;
        if (!generator) {
            self.postMessage({ id, type: 'predict_error', payload: "Model not initialized" });
            return;
        }
        
        try {
            const rawClean = (input || "").trim();
            if (!rawClean) {
                self.postMessage({ id, type: 'predict_done', payload: "" });
                return;
            }
            
            // 1. Get input embedding
            // We use pooling: 'cls' to get the single sentence-level embedding vector
            const inputOut = await generator(rawClean, { pooling: 'cls', normalize: true }) as any;
            const inputVector = inputOut.data;
            
            // 2. Generate prefix chunks of reference
            // e.g. ref = "This message says the driver..."
            // tokenizes into ["This", "message", "says", ...] by space. Just a simple approx tokenizer.
            const refWords = reference.trim().split(/\s+/);
            const prefixStrings: string[] = [];
            const remainderStrings: string[] = [];
            
            for (let i = 1; i <= refWords.length; i++) {
                prefixStrings.push(refWords.slice(0, i).join(' '));
                remainderStrings.push(refWords.slice(i).join(' ')); // What comes AFTER the prefix
            }
            
            // 3. Score all prefixes individually (SEQUENTIALLY to prevent ONNX WASM deadlock)
            let maxSim = -Infinity;
            let bestIndex = -1;
            
            const prefixOuts: any[] = [];
            for (const p of prefixStrings) {
                const out = await generator(p, { pooling: 'cls', normalize: true }) as any;
                prefixOuts.push(out);
            }
            
            for (let i = 0; i < prefixOuts.length; i++) {
                const sim = cosineSimilarity(inputVector, prefixOuts[i].data);
                if (sim > maxSim) {
                    maxSim = sim;
                    bestIndex = i;
                }
            }
            
            // 4. Threshold lock. If the semantic similarity of the BEST prefix > 0.82
            if (maxSim > 0.80 && bestIndex !== -1 && remainderStrings[bestIndex]) {
                const completion = remainderStrings[bestIndex];
                self.postMessage({ id, type: 'predict_done', payload: " " + completion });
            } else {
                self.postMessage({ id, type: 'predict_done', payload: "" });
            }
            
        } catch (error: any) {
             self.postMessage({ id, type: 'predict_error', payload: error.message || String(error) });
        }
    }
    else if (type === 'grade') {
        const { input, reference } = payload;
        if (!generator) {
            self.postMessage({ id, type: 'grade_error', payload: "Model not initialized" });
            return;
        }
        try {
            const userRaw = (input || "").trim();
            const refRaw = (reference || "").trim();
            if (!userRaw || !refRaw) {
                self.postMessage({ id, type: 'grade_done', payload: 0 });
                return;
            }
            // Run sequentially to prevent ONNX Session deadlocks
            const userOut = await generator(userRaw, { pooling: 'cls', normalize: true }) as any;
            const refOut = await generator(refRaw, { pooling: 'cls', normalize: true }) as any;
            
            const sim = cosineSimilarity(userOut.data, refOut.data);
            self.postMessage({ id, type: 'grade_done', payload: sim });
        } catch(error: any) {
            self.postMessage({ id, type: 'grade_error', payload: error.message || String(error) });
        }
    }
});
