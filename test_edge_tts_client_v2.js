const { EdgeTTSClient, OUTPUT_FORMAT } = require("edge-tts-client");
const fs = require("fs");
const path = require("path");

async function test() {
    console.log("[Test] Starting edge-tts-client test...");

    try {
        const tts = new EdgeTTSClient();
        await tts.setMetadata("en-US-JennyNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        const outputPath = path.join(__dirname, "test_tts_client_output.mp3");
        console.log("[Test] Generating TTS to:", outputPath);

        const readable = tts.toStream("Hello world, this is a test.");
        const writable = fs.createWriteStream(outputPath);

        readable.pipe(writable);

        writable.on("finish", () => {
            console.log("[Test] TTS generated successfully!");
            process.exit(0);
        });

        writable.on("error", (err) => {
            console.error("[Test] Write Error:", err);
            process.exit(1);
        });

    } catch (error) {
        console.error("[Test] TTS Error:", error);
        process.exit(1);
    }
}

test();
