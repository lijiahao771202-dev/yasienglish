import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/ai/embed-words
 * 
 * Batch embed words/phrases via local nomic-embed-text.
 * Used for pre-computing reference word embeddings and semantic synonym matching.
 */
export async function POST(req: NextRequest) {
    try {
        const { inputs } = await req.json();

        if (!Array.isArray(inputs) || inputs.length === 0) {
            return NextResponse.json({ embeddings: [] });
        }

        const res = await fetch('http://localhost:11434/api/embed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'nomic-embed-text',
                input: inputs,
            }),
        });

        if (!res.ok) {
            return NextResponse.json({ embeddings: [] });
        }

        const data = await res.json();
        return NextResponse.json({ embeddings: data.embeddings || [] });
    } catch {
        return NextResponse.json({ embeddings: [] });
    }
}
