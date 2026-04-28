import nlp from 'compromise';

class SyntaxParser {
    /**
     * Parses an English sentence into grammatical chunks (Syntax Blocks).
     */
    parseChunks(text: string) {
        if (!text || typeof text !== 'string') return [];
        
        const doc = nlp(text);
        const chunks = doc.chunks().json();

        return chunks.map((c: any) => {
            const flatTags = c.terms.flatMap((t: any) => t.tags);

            let type = 'other';
            // Hierarchy of phrases based on constituent tags
            if (flatTags.includes('Verb')) type = 'verb_phrase';
            else if (flatTags.includes('Noun') || flatTags.includes('Pronoun') || flatTags.includes('Determiner')) type = 'noun_phrase';
            else if (flatTags.includes('Preposition')) type = 'prep_phrase';
            else if (flatTags.includes('Conjunction')) type = 'conjunction';
            else if (flatTags.includes('Adjective')) type = 'adjective';
            else if (flatTags.includes('Adverb')) type = 'adverb';

            return { text: c.text, type };
        });
    }
}

export const syntaxParser = new SyntaxParser();
