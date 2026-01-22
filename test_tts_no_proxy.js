const { EdgeTTSClient, OUTPUT_FORMAT } = require("edge-tts-client");
const fs = require("fs");
const path = require("path");

// Disable proxy for this request
delete process.env.http_proxy;
delete process.env.https_proxy;
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

async function test() {
    console.log("[Test] Starting edge-tts-client test (no proxy)...");
    console.log("[Test] HTTP_PROXY:", process.env.http_proxy);
    console.log("[Test] HTTPS_PROXY:", process.env.https_proxy);

    try {
        const tts = new EdgeTTSClient();
        await tts.setMetadata("en-US-JennyNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

        const readable = tts.toStream("Hello world.");
        const chunks = [];

        readable.on("data", (chunk) => {
            chunks.push(chunk);
        });

        readable.on("end", () => {
            const buffer = Buffer.concat(chunks);
            console.log("[Test] TTS generated successfully! Size:", buffer.length, "bytes");
            fs.writeFileSync(path.join(__dirname, "test_output.mp3"), buffer);
            process.exit(0);
        });

        readable.on("error", (err) => {
            console.error("[Test] Stream Error:", err.message);
            console.error("[Test] Full Error:", err);
            process.exit(1);
        });

    } catch (error) {
        console.error("[Test] TTS Error:", error.message);
        console.error("[Test] Full Error:", error);
        process.exit(1);
    }
}

test();
