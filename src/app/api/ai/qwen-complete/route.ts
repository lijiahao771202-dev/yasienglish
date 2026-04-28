import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai/qwen-complete
 * 
 * Word completion via local Qwen 3.5 0.8B.
 * Completes the current partial word based on reference answer context.
 */
export async function POST(req: NextRequest) {
    try {
        const { currentInput, referenceAnswer } = await req.json();

        if (!currentInput?.trim() || !referenceAnswer) {
            return NextResponse.json({ suggestion: null });
        }

        const partialMatch = currentInput.match(/[a-zA-Z']+$/);
        const partial = partialMatch ? partialMatch[0] : '';
        if (!partial) {
            return NextResponse.json({ suggestion: null });
        }

        // More constrained prompt: explicitly tell it to complete using reference words
        const prompt = `/no_think
The reference sentence is: "${referenceAnswer}"
The student is typing: "${currentInput}"
The student is currently typing the word "${partial}".
What word from the reference is the student trying to type? Reply with ONLY that single complete word, nothing else.`;

        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'qwen3.5:0.8b',
                prompt,
                stream: false,
                think: false,
                options: {
                    temperature: 0.0,
                    num_predict: 12,
                    num_ctx: 256,
                    stop: ['\n', '.', ',', '!', '?'],
                },
            }),
        });

        if (!res.ok) {
            return NextResponse.json({ suggestion: null });
        }

        const data = await res.json();
        let word = (data.response || '')
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/^["'`\s]+|["'`\s]+$/g, '')
            .trim()
            .split(/\s+/)[0]  // Take first word only
            ?.replace(/[^a-zA-Z'-]/g, '')
            .toLowerCase() || '';

        if (!word || word.length < 2) {
            return NextResponse.json({ suggestion: null });
        }

        const p = partial.toLowerCase();

        // If word starts with the partial → direct completion
        if (word.startsWith(p) && word.length > p.length) {
            return NextResponse.json({ suggestion: word.slice(p.length) });
        }

        // If word is a valid reference word but doesn't match prefix → replacement suggestion
        const refWords = referenceAnswer.toLowerCase().split(/\s+/).map((w: string) => w.replace(/[^a-z'-]/g, ''));
        if (refWords.includes(word) && word !== p) {
            return NextResponse.json({ suggestion: word.slice(p.length > 0 ? 0 : 0), fullWord: word });
        }

        return NextResponse.json({ suggestion: null });
    } catch (error) {
        console.error('[qwen-complete] Error:', (error as Error).message);
        return NextResponse.json({ suggestion: null });
    }
}
