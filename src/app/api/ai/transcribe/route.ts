
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
    // Intelligent Configuration for Whisper
    // 1. Start with explicit OpenAI config
    let apiKey = process.env.OPENAI_API_KEY;
    let baseURL = process.env.OPENAI_BASE_URL;

    // 2. Check for incompatibility
    const isDeepSeekUrl = baseURL?.includes("deepseek");

    if (isDeepSeekUrl) {
        // DeepSeek API currently does NOT support Whisper. 
        // We must strip the BaseURL to force the SDK to use the official OpenAI endpoint.
        console.log("[Transcribe] Detected DeepSeek BaseURL. Ignoring it for Whisper (Audio) request to use official OpenAI.");
        baseURL = undefined;
    }

    // 3. Fallback logic
    if (!apiKey) {
        if (baseURL && !isDeepSeekUrl) {
            // If using a CUSTOM proxy (not DeepSeek, not official), 
            // the user might be sharing the key variable.
            apiKey = process.env.DEEPSEEK_API_KEY;
        }
    }

    if (!apiKey) {
        return NextResponse.json({
            error: 'Configuration Error: OpenAI API Key is missing.',
            details: 'To use Whisper Transcription, please add OPENAI_API_KEY to your .env file. DeepSeek keys cannot be used for official OpenAI Audio endpoints.'
        }, { status: 500 });
    }

    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: baseURL // If undefined, defaults to https://api.openai.com/v1
    });

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const prompt = formData.get('prompt') as string | null;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        console.log(`[Transcribe] Processing file: ${file.name}, size: ${file.size}, type: ${file.type}, prompt_len: ${prompt?.length || 0}`);

        // PRIORITY 1: Try Local Whisper Server (localhost:3002)
        try {
            console.log('[Transcribe] Attempting Local Whisper (port 3002)...');
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Note: whisper-server.js expects raw body or similar? 
            // Checking score/route.ts: it sends 'body: buffer'.
            // Let's replicate score/route.ts logic exactly.

            const localRes = await fetch('http://localhost:3002/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: buffer,
            });

            if (localRes.ok) {
                const localData = await localRes.json();
                console.log('[Transcribe] Local Whisper Success:', localData.text?.slice(0, 50));
                return NextResponse.json({ text: localData.text });
            } else {
                console.warn('[Transcribe] Local Whisper returned Error:', await localRes.text());
            }
        } catch (localErr) {
            console.warn('[Transcribe] Local Whisper unavailable, falling back to OpenAI Cloud.');
        }

        // PRIORITY 2: OpenAI Cloud (Fallback)
        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
            language: "en",
            prompt: prompt || undefined, // Inject context
        });

        return NextResponse.json({ text: transcription.text });

    } catch (error: any) {
        console.error('Transcription error details:', error);
        return NextResponse.json({
            error: 'Transcription failed',
            details: error?.message || 'Unknown error'
        }, { status: 500 });
    }
}
