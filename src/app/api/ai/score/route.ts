import { NextRequest, NextResponse } from 'next/server';
import { LOCAL_SPEECH_TRANSCRIBE_FAILED_MESSAGE } from '@/lib/speech-input';

export const runtime = "nodejs";

// Helper to normalize text for comparison
function normalize(text: string): string[] {
    return text.toLowerCase()
        .replace(/[.,!?;:"'()]/g, '') // Remove punctuation
        .split(/\s+/)
        .filter(w => w.length > 0);
}

// LCS (Longest Common Subsequence) Algorithm
function calculateLCS(original: string[], transcript: string[]) {
    const m = original.length;
    const n = transcript.length;
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (original[i - 1] === transcript[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    // Backtrack to find matches
    const matches = new Set<number>(); // Indices of matched words in original
    let i = m, j = n;
    while (i > 0 && j > 0) {
        if (original[i - 1] === transcript[j - 1]) {
            matches.add(i - 1);
            i--;
            j--;
        } else if (dp[i - 1][j] > dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }

    return { length: dp[m][n], matches };
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const originalText = formData.get('text') as string;
        const transcript = (formData.get('transcript') as string | null)?.trim() || "";

        if (!originalText) {
            return NextResponse.json({ error: 'Missing text' }, { status: 400 });
        }

        if (!transcript) {
            return NextResponse.json({
                error: 'Speech input unavailable',
                details: LOCAL_SPEECH_TRANSCRIBE_FAILED_MESSAGE,
            }, { status: 503 });
        }

        // 1. Advanced Scoring with LCS
        const originalWordsRaw = originalText.split(/\s+/); // Keep original for display
        const originalNorm = normalize(originalText);
        const transcriptNorm = normalize(transcript);

        const { length: matchCount, matches } = calculateLCS(originalNorm, transcriptNorm);

        // Calculate Score: (Matches / Total Original Words) * 100
        const score = Math.round((matchCount / Math.max(1, originalNorm.length)) * 100);

        // 2. Generate Diff for UI
        let normIndex = 0;
        const diff = originalWordsRaw.map((word) => {
            const cleanWord = word.toLowerCase().replace(/[.,!?;:"'()]/g, '');

            if (cleanWord.length === 0) {
                return { word, status: 'correct', transcript: '' };
            }

            const isMatch = matches.has(normIndex);
            normIndex++;

            return {
                word,
                status: isMatch ? 'correct' : 'incorrect',
                transcript: isMatch ? cleanWord : '?'
            };
        });

        // Generate feedback
        let feedback = "";
        if (score >= 90) feedback = "太棒了！发音非常标准！🎉";
        else if (score >= 80) feedback = "很不错，继续保持！👏";
        else if (score >= 60) feedback = "及格了，注意一些单词的发音。💪";
        else feedback = "加油，多听多练，你可以的！🔥";

        return NextResponse.json({
            score,
            transcript,
            diff,
            feedback
        });

    } catch (error: any) {
        console.error('Scoring Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
