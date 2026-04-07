const { EdgeTTS } = require('@andresaya/edge-tts');
async function test() {
    const tts = new EdgeTTS();
    await tts.synthesize("Please confirm your booking details later today.", "en-US-AriaNeural");
    console.log("Audio buffer length:", tts.toBuffer().length);
}
test().catch(console.error);
