const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

const PORT = 3002;

// Paths
const whisperCliPath = path.join(__dirname, 'node_modules/@lumen-labs-dev/whisper-node/lib/whisper.cpp.new/build/bin/whisper-cli');
const modelPath = path.join(__dirname, 'node_modules/@lumen-labs-dev/whisper-node/lib/whisper.cpp/models/ggml-medium.en.bin');

console.log('[Whisper Server] Starting...');
console.log('[Whisper Server] CLI path:', whisperCliPath);
console.log('[Whisper Server] Model path:', modelPath);

// Check whisper-cli exists
if (!fs.existsSync(whisperCliPath)) {
    console.error('[Whisper Server] whisper-cli not found! Please build whisper.cpp first.');
    process.exit(1);
}

// Check model exists
if (!fs.existsSync(modelPath)) {
    console.error('[Whisper Server] Model not found! Run: npx @lumen-labs-dev/whisper-node download');
    process.exit(1);
}

console.log('[Whisper Server] whisper-cli and model found. Ready to transcribe.');

// Transcribe audio endpoint
app.post('/transcribe', async (req, res) => {
    const timestamp = Date.now();
    const tempWebmPath = path.join(__dirname, `temp_${timestamp}.webm`);
    const tempWavPath = path.join(__dirname, `temp_${timestamp}.wav`);

    try {
        console.log('[Whisper] Received audio, size:', req.body.length, 'bytes');

        // Save the audio buffer
        fs.writeFileSync(tempWebmPath, req.body);

        // Convert to WAV using ffmpeg
        await new Promise((resolve, reject) => {
            exec(`"${ffmpegPath}" -i "${tempWebmPath}" -ar 16000 -ac 1 -y "${tempWavPath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error('[Whisper] ffmpeg error:', stderr);
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });

        // Clean up webm
        if (fs.existsSync(tempWebmPath)) {
            fs.unlinkSync(tempWebmPath);
        }

        console.log('[Whisper] Converted to WAV, transcribing...');

        // Transcribe with whisper-cli
        // Transcribe with whisper-cli
        const result = await new Promise((resolve, reject) => {
            // Get prompt from header if present
            const promptHeader = req.headers['x-whisper-prompt'];
            let promptArg = '';

            if (promptHeader) {
                // Sanitize prompt: remove quotes and dangerous chars
                const safePrompt = promptHeader.replace(/["\\$;|]/g, ' ').slice(0, 200); // Limit length
                console.log('[Whisper] Using prompt:', safePrompt);
                promptArg = `--prompt "${safePrompt}"`;
            }

            // Use whisper-cli with JSON output
            // Added --prompt argument
            const cmd = `"${whisperCliPath}" -m "${modelPath}" -f "${tempWavPath}" -l en ${promptArg} --output-json -of /tmp/whisper_output_${timestamp}`;

            exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('[Whisper] CLI error:', stderr);
                    reject(new Error(stderr || error.message));
                } else {
                    // Read JSON output
                    const jsonPath = `/tmp/whisper_output_${timestamp}.json`;
                    if (fs.existsSync(jsonPath)) {
                        try {
                            const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                            fs.unlinkSync(jsonPath);
                            resolve(jsonData);
                        } catch (e) {
                            // Fallback: parse stdout
                            resolve({ text: stdout.trim() });
                        }
                    } else {
                        // Parse stdout directly (plain text output)
                        resolve({ text: stdout.trim() });
                    }
                }
            });
        });

        console.log('[Whisper] Transcription result:', result);

        // Clean up wav
        if (fs.existsSync(tempWavPath)) {
            fs.unlinkSync(tempWavPath);
        }

        // Extract text from result
        let text = '';
        if (result.transcription && Array.isArray(result.transcription)) {
            text = result.transcription.map(t => t.text).join(' ').trim();
        } else if (result.text) {
            text = result.text;
        }

        res.json({
            success: true,
            text: text,
            segments: result.transcription || []
        });

    } catch (error) {
        console.error('[Whisper] Error:', error.message);

        // Clean up temp files
        [tempWavPath, tempWebmPath].forEach(f => {
            if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) { }
        });

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', model: 'medium.en', cli: 'whisper-cli' });
});

app.listen(PORT, () => {
    console.log(`[Whisper Server] Running on http://localhost:${PORT}`);
    console.log('[Whisper Server] POST /transcribe - Send audio for transcription');
});
