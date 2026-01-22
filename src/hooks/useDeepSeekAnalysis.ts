import { useState } from 'react';

interface AnalysisResult {
    score: number;
    feedback: string;
    corrections: {
        word: string;
        issue: string;
        tip: string;
    }[];
}

export function useDeepSeekAnalysis() {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const analyze = async (originalText: string, spokenText: string, phonetics: any[]) => {
        setIsAnalyzing(true);
        setError(null);
        try {
            const response = await fetch('/api/analyze-shadowing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    originalText,
                    spokenText,
                    phonetics,
                }),
            });

            if (!response.ok) {
                throw new Error('Analysis failed');
            }

            const data = await response.json();
            setResult(data);
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred');
        } finally {
            setIsAnalyzing(false);
        }
    };

    return {
        analyze,
        isAnalyzing,
        result,
        error,
        reset: () => setResult(null),
    };
}
