const { EdgeTTS } = require("@andresaya/edge-tts");
const fs = require('fs');

async function testTTS() {
    console.log("Starting TTS Test...");
    try {
        const tts = new EdgeTTS();
        const text = "Hello world, this is a test of the emergency broadcast system.";
        const voice = "en-US-JennyNeural";
        const rate = "+15%";

        console.log(`Synthesizing with rate: ${rate}`);
        await tts.synthesize(text, voice, {
            rate: rate,
            outputFormat: "audio-24khz-48kbitrate-mono-mp3"
        });

        const buffer = tts.toBuffer();
        console.log(`Success! Buffer length: ${buffer.length}`);
        fs.writeFileSync("test_tts.mp3", buffer);

    } catch (e) {
        console.error("Test Failed:", e);
    }
}

testTTS();
