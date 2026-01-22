import { useState, useCallback, useEffect } from 'react';

interface PhoneticDiff {
    word: string;
    ipaTarget: string;
    ipaSpoken: string;
    isMatch: boolean;
}

// Singleton state
let globalDict: Map<string, string> | null = null;
let globalPromise: Promise<Map<string, string>> | null = null;

export function useIPA() {
    const [isReady, setIsReady] = useState(!!globalDict);
    const [dict, setDict] = useState<Map<string, string>>(globalDict || new Map());

    useEffect(() => {
        if (globalDict) {
            setIsReady(true);
            setDict(globalDict);
            return;
        }

        if (!globalPromise) {
            globalPromise = (async () => {
                try {
                    console.log("[IPA] Fetching dictionary...");
                    const response = await fetch('/ipa.txt');
                    if (!response.ok) throw new Error("Failed to load IPA dictionary");

                    const text = await response.text();
                    const newDict = new Map<string, string>();

                    const lines = text.split('\n');
                    lines.forEach(line => {
                        const parts = line.trim().split('\t');
                        if (parts.length >= 2) {
                            const word = parts[0].toLowerCase();
                            const ipa = parts[1].split(',')[0].trim();
                            newDict.set(word, ipa);
                        }
                    });

                    console.log(`[IPA] Dictionary loaded with ${newDict.size} words`);
                    globalDict = newDict;
                    return newDict;
                } catch (e) {
                    console.error("[IPA] Failed to load dictionary:", e);
                    return new Map<string, string>();
                }
            })();
        }

        globalPromise.then((loadedDict) => {
            setDict(loadedDict);
            setIsReady(true);
        });

    }, []);

    const getIPA = useCallback((text: string) => {
        if (!isReady || !dict) return "";
        const lower = text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
        return dict.get(lower) || "";
    }, [isReady, dict]);

    const comparePhonetics = useCallback((target: string, spoken: string): PhoneticDiff[] => {
        if (!target || !spoken) return [];

        const cleanAndSplit = (str: string) => str.toLowerCase()
            .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
            .split(/\s+/)
            .filter(w => w.length > 0);

        const targetWords = cleanAndSplit(target);
        const spokenWords = cleanAndSplit(spoken);

        return targetWords.map((word, i) => {
            const spokenWord = spokenWords[i] || "";
            const ipaTarget = getIPA(word);
            const ipaSpoken = spokenWord ? getIPA(spokenWord) : "";

            let isMatch = word === spokenWord;

            if (!isMatch && ipaTarget && ipaSpoken) {
                isMatch = ipaTarget === ipaSpoken;
            }

            return {
                word,
                ipaTarget,
                ipaSpoken,
                isMatch
            };
        });
    }, [getIPA]);

    return {
        isReady,
        getIPA,
        comparePhonetics
    };
}
