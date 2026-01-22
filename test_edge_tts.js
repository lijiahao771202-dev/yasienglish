const { EdgeTTS } = require("node-edge-tts");
const path = require("path");

async function test() {
    console.log("[Test] Starting EdgeTTS test...");

    try {
        const tts = new EdgeTTS({
            voice: "en-US-JennyNeural",
            lang: "en-US",
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        });

        const outputPath = path.join(__dirname, "test_tts_output.mp3");
        console.log("[Test] Generating TTS to:", outputPath);

        await tts.ttsPromise("Hello world, this is a test.", outputPath);

        console.log("[Test] TTS generated successfully!");
    } catch (error) {
        console.error("[Test] TTS Error:", error);
    }
}

test();
