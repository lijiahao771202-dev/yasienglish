/**
 * Bionic Reading Utility
 * Transforms text by bolding the first portion of each word
 * to help guide the eye and improve reading speed.
 */

/**
 * Calculate how many characters to bold based on word length.
 * - 1-2 chars: bold 1
 * - 3-4 chars: bold 2
 * - 5+ chars: bold ~40% (rounded up)
 */
function getBoldLength(wordLength: number): number {
    if (wordLength <= 2) return 1;
    if (wordLength <= 4) return 2;
    return Math.ceil(wordLength * 0.4);
}

/**
 * Transform a single word into bionic format.
 * Returns an object with bold and regular parts.
 */
export function bionicWord(word: string): { bold: string; regular: string } {
    // Skip if word is too short or not alphabetic
    if (word.length < 2 || !/[a-zA-Z]/.test(word)) {
        return { bold: '', regular: word };
    }

    const boldLen = getBoldLength(word.length);
    return {
        bold: word.slice(0, boldLen),
        regular: word.slice(boldLen)
    };
}

/**
 * Transform text into bionic reading format.
 * Returns an array of segments for rendering.
 */
export interface BionicSegment {
    type: 'word' | 'space' | 'punctuation';
    bold?: string;
    regular?: string;
    text?: string;
}

export function bionicText(text: string): BionicSegment[] {
    const segments: BionicSegment[] = [];

    // Split by word boundaries while preserving spaces and punctuation
    const tokens = text.split(/(\s+|[.,!?;:'"()\[\]{}—–-]+)/);

    for (const token of tokens) {
        if (!token) continue;

        // Check if it's whitespace
        if (/^\s+$/.test(token)) {
            segments.push({ type: 'space', text: token });
        }
        // Check if it's punctuation
        else if (/^[.,!?;:'"()\[\]{}—–-]+$/.test(token)) {
            segments.push({ type: 'punctuation', text: token });
        }
        // It's a word
        else {
            const { bold, regular } = bionicWord(token);
            segments.push({ type: 'word', bold, regular });
        }
    }

    return segments;
}
