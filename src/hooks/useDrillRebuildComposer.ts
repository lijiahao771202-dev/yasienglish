"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import {
    normalizeRebuildTokenForMatch,
    pickPreferredRebuildTokenCandidate,
    type RebuildTokenInstance,
} from "@/lib/drill-rebuild-helpers";
import { playRebuildSfx } from "@/lib/rebuild-sfx";
import { playPopSound, shootDynamicWordBlast } from "@/lib/feedback-engine";

type RebuildFeedbackStateLike = object | null;
type RebuildMetaShape = {
    answerTokens: string[];
};
type DrillDataShape = {
    _rebuildMeta?: RebuildMetaShape;
};

type UseDrillRebuildComposerArgs = {
    activePassageResult: object | null;
    drillData: DrillDataShape | null;
    handleSubmitRebuild: (skipped?: boolean) => boolean;
    isPlaying: boolean;
    isRebuildMode: boolean;
    isRebuildPassage: boolean;
    onPlayAudio: () => void | Promise<unknown>;
    rebuildAnswerTokens: RebuildTokenInstance[];
    rebuildAutocorrect: boolean;
    rebuildAvailableTokens: RebuildTokenInstance[];
    rebuildComboLastAtRef: MutableRefObject<number>;
    rebuildFeedback: RebuildFeedbackStateLike;
    rebuildTokenOrderRef: MutableRefObject<Map<string, number>>;
    rebuildTypingBuffer: string;
    rebuildTypingBufferRef: MutableRefObject<string>;
    setRebuildAnswerTokens: (updater: (current: RebuildTokenInstance[]) => RebuildTokenInstance[]) => void;
    setRebuildAutocompleteSuggestion: (value: string | null) => void;
    setRebuildAvailableTokens: (updater: (current: RebuildTokenInstance[]) => RebuildTokenInstance[]) => void;
    setRebuildCombo: (updater: (current: number) => number) => void;
    setRebuildComboFxAt: (value: number | null) => void;
    setRebuildEditCount: (updater: (current: number) => number) => void;
    setRebuildTypingBuffer: (value: string) => void;
};

const isSingleWordInputKey = (key: string) => /^[a-zA-Z0-9']$/.test(key);

export function useDrillRebuildComposer({
    activePassageResult,
    drillData,
    handleSubmitRebuild,
    isPlaying,
    isRebuildMode,
    isRebuildPassage,
    onPlayAudio,
    rebuildAnswerTokens,
    rebuildAutocorrect,
    rebuildAvailableTokens,
    rebuildComboLastAtRef,
    rebuildFeedback,
    rebuildTokenOrderRef,
    rebuildTypingBuffer,
    rebuildTypingBufferRef,
    setRebuildAnswerTokens,
    setRebuildAutocompleteSuggestion,
    setRebuildAvailableTokens,
    setRebuildCombo,
    setRebuildComboFxAt,
    setRebuildEditCount,
    setRebuildTypingBuffer,
}: UseDrillRebuildComposerArgs) {
    const typingHitComboRef = useRef<number>(0);
    const lastKeystrokeTimeRef = useRef<number>(Date.now());

    const handleRebuildSelectToken = useCallback((tokenId: string, source: "click" | "autocomplete" | "type" = "click") => {
        if (!isRebuildMode) return;
        if (isRebuildPassage && activePassageResult) return;
        if (!isRebuildPassage && rebuildFeedback) return;
        const token = rebuildAvailableTokens.find((item) => item.id === tokenId);
        if (!token) return;

        if (source === "click") {
            playRebuildSfx("pick");
            typingHitComboRef.current = 0;
        } else if (source === "autocomplete" || source === "type") {
            if (source === "autocomplete") {
                typingHitComboRef.current += 2;
            }

            const el = document.getElementById("rebuild-typing-cursor");
            if (el) {
                const combo = typingHitComboRef.current;
                const wordLen = token.text.length;

                let triggerProb = 0.06;
                if (wordLen >= 7) triggerProb += 0.10;
                if (combo >= 10 && combo < 20) triggerProb += 0.05;
                else if (combo >= 20 && combo < 30) triggerProb += 0.20;
                else if (combo >= 30 && combo < 40) triggerProb += 0.45;
                if (combo >= 40) triggerProb = 1.0;

                window.dispatchEvent(new CustomEvent("rebuild-debug-stats", {
                    detail: { combo, prob: triggerProb },
                }));

                if (Math.random() <= triggerProb) {
                    const intensity = (combo > 10 ? 5 : 0) + (wordLen > 5 ? 5 : 0) + (combo / 5);
                    shootDynamicWordBlast(el.getBoundingClientRect(), intensity);
                }
            }
        }

        setRebuildAvailableTokens((currentTokens) => currentTokens.filter((item) => item.id !== tokenId));
        setRebuildAnswerTokens((answerTokens) => (
            answerTokens.some((item) => item.id === token.id)
                ? answerTokens
                : [...answerTokens, token]
        ));

        const now = Date.now();
        const gap = now - rebuildComboLastAtRef.current;
        rebuildComboLastAtRef.current = now;
        if (gap < 5000) {
            setRebuildCombo((prev) => {
                const next = prev + 1;
                if (next > 0 && next % 5 === 0) {
                    playRebuildSfx("celebrate");
                    setRebuildComboFxAt(now);
                }
                return next;
            });
        } else {
            setRebuildCombo(() => 1);
        }
    }, [
        activePassageResult,
        isRebuildMode,
        isRebuildPassage,
        rebuildAvailableTokens,
        rebuildFeedback,
        rebuildComboLastAtRef,
        setRebuildAnswerTokens,
        setRebuildAvailableTokens,
        setRebuildCombo,
        setRebuildComboFxAt,
    ]);

    const handleRebuildRemoveToken = useCallback((tokenId: string) => {
        if (!isRebuildMode) return;
        if (isRebuildPassage && activePassageResult) return;
        if (!isRebuildPassage && rebuildFeedback) return;
        const token = rebuildAnswerTokens.find((item) => item.id === tokenId);
        if (!token) return;

        playRebuildSfx("remove");
        setRebuildEditCount((prev) => prev + 1);
        setRebuildAvailableTokens((availableTokens) => (
            availableTokens.some((item) => item.id === token.id)
                ? availableTokens
                : [...availableTokens, token].sort((left, right) => (
                    (rebuildTokenOrderRef.current.get(left.id) ?? 0) - (rebuildTokenOrderRef.current.get(right.id) ?? 0)
                ))
        ));
        setRebuildAnswerTokens((currentTokens) => currentTokens.filter((item) => item.id !== tokenId));
    }, [
        activePassageResult,
        isRebuildMode,
        isRebuildPassage,
        rebuildAnswerTokens,
        rebuildFeedback,
        rebuildTokenOrderRef,
        setRebuildAnswerTokens,
        setRebuildAvailableTokens,
        setRebuildEditCount,
    ]);

    const handleRebuildPoolTokenClick = useCallback((tokenId: string) => {
        handleRebuildSelectToken(tokenId);
        rebuildTypingBufferRef.current = "";
        setRebuildTypingBuffer("");
        setRebuildAutocompleteSuggestion(null);
    }, [handleRebuildSelectToken, rebuildTypingBufferRef, setRebuildAutocompleteSuggestion, setRebuildTypingBuffer]);

    useEffect(() => {
        rebuildTypingBufferRef.current = rebuildTypingBuffer;
    }, [rebuildTypingBuffer, rebuildTypingBufferRef]);

    useEffect(() => {
        if (!isRebuildMode || !drillData?._rebuildMeta) return;
        if (isRebuildPassage && activePassageResult) return;
        if (!isRebuildPassage && rebuildFeedback) return;

        const expectedNextAnswerToken = drillData._rebuildMeta.answerTokens[rebuildAnswerTokens.length] ?? null;

        const fuzzyMatch = (input: string, tokens: RebuildTokenInstance[]) => {
            const normalizedInput = normalizeRebuildTokenForMatch(input);
            if (!normalizedInput) return null;

            const scored = tokens.map((token) => {
                const normalizedToken = normalizeRebuildTokenForMatch(token.text);
                const prefixBonus = normalizedToken.startsWith(normalizedInput) ? 2 : 0;
                let sharedPrefix = 0;
                while (
                    sharedPrefix < normalizedInput.length
                    && sharedPrefix < normalizedToken.length
                    && normalizedInput[sharedPrefix] === normalizedToken[sharedPrefix]
                ) {
                    sharedPrefix += 1;
                }

                const distancePenalty = Math.abs(normalizedToken.length - normalizedInput.length);
                const score = sharedPrefix + prefixBonus - distancePenalty * 0.5;
                return { score, token };
            });

            const best = scored.sort((left, right) => right.score - left.score)[0];
            return best && best.score >= Math.max(2, normalizedInput.length * 0.5)
                ? best.token
                : null;
        };

        const clearTypingBuffer = () => {
            rebuildTypingBufferRef.current = "";
            setRebuildTypingBuffer("");
            setRebuildAutocompleteSuggestion(null);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;

            if (event.key === "Backspace") {
                typingHitComboRef.current = 0;
                if (rebuildTypingBufferRef.current.length > 0) {
                    playPopSound(0);
                    const next = rebuildTypingBufferRef.current.slice(0, -1);
                    rebuildTypingBufferRef.current = next;
                    setRebuildTypingBuffer(next);
                    if (next.length > 0) {
                        const nextClean = normalizeRebuildTokenForMatch(next);
                        const prefixTokens = rebuildAvailableTokens.filter((token) => (
                            normalizeRebuildTokenForMatch(token.text).startsWith(nextClean)
                        ));
                        if (prefixTokens.length > 0) {
                            const sorted = [...prefixTokens].sort((left, right) => left.text.length - right.text.length);
                            setRebuildAutocompleteSuggestion(sorted[0].text);
                        } else {
                            setRebuildAutocompleteSuggestion(null);
                        }
                    } else {
                        setRebuildAutocompleteSuggestion(null);
                    }
                } else if (rebuildAnswerTokens.length > 0) {
                    const lastToken = rebuildAnswerTokens[rebuildAnswerTokens.length - 1];
                    handleRebuildRemoveToken(lastToken.id);
                }
                return;
            }

            if (event.key === "Enter") {
                event.preventDefault();

                const buffered = rebuildTypingBufferRef.current;
                if (buffered.length > 0) {
                    const bufferedClean = normalizeRebuildTokenForMatch(buffered);
                    const exactMatches = rebuildAvailableTokens.filter((token) => (
                        normalizeRebuildTokenForMatch(token.text) === bufferedClean
                    ));

                    if (exactMatches.length > 0) {
                        const matchedToken = pickPreferredRebuildTokenCandidate({
                            candidates: exactMatches,
                            typedRaw: buffered,
                            expectedRaw: expectedNextAnswerToken,
                        }) ?? exactMatches[0];
                        handleRebuildSelectToken(matchedToken.id, "type");
                        clearTypingBuffer();
                        return;
                    }

                    if (rebuildAutocorrect) {
                        const fuzzyResult = fuzzyMatch(buffered, rebuildAvailableTokens);
                        if (fuzzyResult) {
                            handleRebuildSelectToken(fuzzyResult.id, "type");
                            clearTypingBuffer();
                            return;
                        }
                    }
                }

                if (rebuildAnswerTokens.length > 0) {
                    void handleSubmitRebuild();
                }
                return;
            }

            if (event.key === " " || event.key === "Spacebar") {
                event.preventDefault();
                const buffered = rebuildTypingBufferRef.current;
                if (buffered.length > 0) {
                    const currentClean = normalizeRebuildTokenForMatch(buffered);
                    const exactMatches = rebuildAvailableTokens.filter((token) => (
                        normalizeRebuildTokenForMatch(token.text) === currentClean
                    ));
                    if (exactMatches.length > 0) {
                        const matchedToken = pickPreferredRebuildTokenCandidate({
                            candidates: exactMatches,
                            typedRaw: buffered,
                            expectedRaw: expectedNextAnswerToken,
                        }) ?? exactMatches[0];
                        handleRebuildSelectToken(matchedToken.id, "type");
                        clearTypingBuffer();
                    } else if (rebuildAutocorrect) {
                        const fuzzyResult = fuzzyMatch(buffered, rebuildAvailableTokens);
                        if (fuzzyResult) {
                            handleRebuildSelectToken(fuzzyResult.id, "type");
                            clearTypingBuffer();
                        }
                    }
                } else if (!isPlaying) {
                    void onPlayAudio();
                }
                return;
            }

            if (event.key === "Tab") {
                event.preventDefault();
                const buffered = rebuildTypingBufferRef.current;
                if (buffered.length > 0) {
                    const currentClean = normalizeRebuildTokenForMatch(buffered);
                    const prefixTokens = rebuildAvailableTokens.filter((token) => (
                        normalizeRebuildTokenForMatch(token.text).startsWith(currentClean)
                    ));
                    if (prefixTokens.length > 0) {
                        const sorted = [...prefixTokens].sort((left, right) => left.text.length - right.text.length);
                        if (prefixTokens.length === 1) {
                            handleRebuildSelectToken(sorted[0].id, "autocomplete");
                            clearTypingBuffer();
                        } else {
                            let common = normalizeRebuildTokenForMatch(sorted[0].text);
                            for (const token of prefixTokens) {
                                const normalizedToken = normalizeRebuildTokenForMatch(token.text);
                                let index = 0;
                                while (
                                    index < common.length
                                    && index < normalizedToken.length
                                    && common[index] === normalizedToken[index]
                                ) {
                                    index += 1;
                                }
                                common = common.slice(0, index);
                            }
                            if (common.length > currentClean.length) {
                                const fillText = sorted[0].text.slice(0, common.length);
                                rebuildTypingBufferRef.current = fillText;
                                setRebuildTypingBuffer(fillText);
                                setRebuildAutocompleteSuggestion(sorted[0].text);
                            }
                        }
                    }
                }
                return;
            }

            if (event.key.length === 1 && isSingleWordInputKey(event.key)) {
                const now = Date.now();
                if (now - lastKeystrokeTimeRef.current > 5000) {
                    typingHitComboRef.current = 0; // Strict flow state: reset keystroke combo if paused for >5.0s
                }
                lastKeystrokeTimeRef.current = now;

                typingHitComboRef.current += 1;
                
                const nextBuffer = rebuildTypingBufferRef.current + event.key;
                const nextClean = normalizeRebuildTokenForMatch(nextBuffer);
                const prefixMatches = rebuildAvailableTokens.filter((token) => (
                    normalizeRebuildTokenForMatch(token.text).startsWith(nextClean)
                ));
                
                if (prefixMatches.length === 0 && !rebuildAutocorrect) {
                    typingHitComboRef.current = 0;
                }
                
                if (typingHitComboRef.current < 40) {
                    playPopSound(typingHitComboRef.current);
                } else {
                    playPopSound(40);
                }
                
                rebuildTypingBufferRef.current = nextBuffer;
                setRebuildTypingBuffer(nextBuffer);

                const exactMatches = prefixMatches.filter((token) => (
                    normalizeRebuildTokenForMatch(token.text) === nextClean
                ));

                const expectedClean = expectedNextAnswerToken ? normalizeRebuildTokenForMatch(expectedNextAnswerToken) : "";
                const matchesExpected = exactMatches.length > 0 && nextClean === expectedClean;
                const isUnambiguous = exactMatches.length > 0 && prefixMatches.length === exactMatches.length;

                if (matchesExpected || isUnambiguous) {
                    const matchedToken = pickPreferredRebuildTokenCandidate({
                        candidates: exactMatches,
                        typedRaw: nextBuffer,
                        expectedRaw: expectedNextAnswerToken,
                    }) ?? exactMatches[0];
                    handleRebuildSelectToken(matchedToken.id, "type");
                    clearTypingBuffer();
                } else if (rebuildAutocorrect && prefixMatches.length === 0) {
                    const fuzzyResult = fuzzyMatch(nextBuffer, rebuildAvailableTokens);
                    if (fuzzyResult) {
                        handleRebuildSelectToken(fuzzyResult.id, "type");
                        clearTypingBuffer();
                    } else {
                        setRebuildAutocompleteSuggestion(null);
                    }
                } else if (prefixMatches.length > 0) {
                    const sorted = [...prefixMatches].sort((left, right) => left.text.length - right.text.length);
                    setRebuildAutocompleteSuggestion(sorted[0].text);
                } else {
                    setRebuildAutocompleteSuggestion(null);
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        activePassageResult,
        drillData?._rebuildMeta,
        handleRebuildRemoveToken,
        handleRebuildSelectToken,
        handleSubmitRebuild,
        isPlaying,
        isRebuildMode,
        isRebuildPassage,
        onPlayAudio,
        rebuildAnswerTokens,
        rebuildAutocorrect,
        rebuildAvailableTokens,
        rebuildFeedback,
        rebuildTypingBufferRef,
        setRebuildAutocompleteSuggestion,
        setRebuildTypingBuffer,
    ]);

    return {
        handleRebuildPoolTokenClick,
        handleRebuildRemoveToken,
        handleRebuildSelectToken,
    };
}
