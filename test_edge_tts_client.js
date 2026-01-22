const { EdgeTTS } = require("edge-tts-client");
const fs = require("fs");
const path = require("path");

async function testTTS() {
    try {
        console.log("Initializing EdgeTTS (client)...");
        const tts = new EdgeTTS();

        const tempFile = path.join(__dirname, "test_output_client.mp3");
        console.log(`Generating audio to ${tempFile}...`);

        await tts.ttsPromise("Hello, this is a test of the alternative text to speech system.", tempFile);

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
