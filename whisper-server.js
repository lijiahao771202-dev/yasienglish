const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { whisper } = require('@lumen-labs-dev/whisper-node');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }));

const PORT = 3002;

// Model path
const modelPath = path.join(__dirname, 'node_modules/@lumen-labs-dev/whisper-node/lib/whisper.cpp/models/ggml-medium.en.bin');

console.log('[Whisper Server] Starting...');
console.log('[Whisper Server] Model path:', modelPath);

if (!fs.existsSync(modelPath)) {
    console.error('[Whisper Server] Model not found! Run: npx @lumen-labs-dev/whisper-node download');
    process.exit(1);
}

console.log('[Whisper Server] Model found. Ready to transcribe.');

// Transcribe audio endpoint
app.post('/transcribe', async (req, res) => {
    const tempWavPath = path.join(__dirname, `temp_${Date.now()}.wav`);

    try {
        console.log('[Whisper] Received audio, size:', req.body.length, 'bytes');

        // Save the audio buffer as WAV
        // The audio is coming as webm, need to convert to wav
        const tempWebmPath = path.join(__dirname, `temp_${Date.now()}.webm`);
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

        // Transcribe with Whisper
        const transcript = await whisper(tempWavPath, {
            modelPath: modelPath,
            language: 'en',
            translate: false,
        });

        console.log('[Whisper] Transcription result:', transcript);

        // Clean up wav
        if (fs.existsSync(tempWavPath)) {
            fs.unlinkSync(tempWavPath);
        }

        // Extract text from transcript
        const text = transcript.map(t => t.speech).join(' ').trim();

        res.json({
            success: true,
            text: text,
            segments: transcript
        });

    } catch (error) {
        console.error('[Whisper] Error:', error.message);

        // Clean up temp files
        [tempWavPath, tempWavPath.replace('.wav', '.webm')].forEach(f => {
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
    res.json({ status: 'ok', model: 'small.en' });
});

app.listen(PORT, () => {
    console.log(`[Whisper Server] Running on http://localhost:${PORT}`);
    console.log('[Whisper Server] POST /transcribe - Send audio for transcription');
});
