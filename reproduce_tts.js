const { EdgeTTS } = require("node-edge-tts");
const fs = require("fs");
const path = require("path");

async function testTTS() {
    try {
        console.log("Initializing EdgeTTS...");
        const tts = new EdgeTTS({
            voice: "en-US-JennyNeural",
            lang: "en-US",
            outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        });

        const tempFile = path.join(__dirname, "test_output.mp3");
        console.log(`Generating audio to ${tempFile}...`);

        await tts.ttsPromise("Hello, this is a test of the text to speech system.", tempFile);

        console.log("Success! Audio generated.");
        const stats = fs.statSync(tempFile);
        console.log(`File size: ${stats.size} bytes`);

        // Cleanup
        fs.unlinkSync(tempFile);
    } catch (error) {
        console.error("TTS Failed:", error);
    }
}

testTTS();
