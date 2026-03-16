"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    type DesktopSpeechModelProgress,
    LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE,
    formatSpeechModelStatusMessage,
} from "@/lib/speech-input";

const EMPTY_MODEL_PROGRESS: DesktopSpeechModelProgress = {
    status: "missing",
    modelPath: "",
    downloadedBytes: 0,
    totalBytes: null,
    error: null,
};

export function useDesktopSpeechModel() {
    const [progress, setProgress] = useState<DesktopSpeechModelProgress>(EMPTY_MODEL_PROGRESS);
    const [loading, setLoading] = useState(true);
    const isDesktopApp = typeof window !== "undefined" && Boolean(window.yasiDesktop?.isDesktopApp);
    const desktopApi = typeof window !== "undefined" ? window.yasiDesktop : undefined;

    useEffect(() => {
        if (!isDesktopApp || !desktopApi) {
            setLoading(false);
            return;
        }

        let disposed = false;
        desktopApi.getSpeechModelStatus?.()
            .then((next) => {
                if (!disposed && next) {
                    setProgress(next);
                }
            })
            .finally(() => {
                if (!disposed) {
                    setLoading(false);
                }
            });

        const offStatus = desktopApi.onSpeechModelStatus?.((next) => {
            setProgress(next);
            setLoading(false);
        });
        const offProgress = desktopApi.onSpeechModelProgress?.((next) => {
            setProgress(next);
            setLoading(false);
        });

        return () => {
            disposed = true;
            offStatus?.();
            offProgress?.();
        };
    }, [desktopApi, isDesktopApp]);

    const downloadModel = useCallback(async () => {
        if (!desktopApi?.downloadSpeechModel) {
            throw new Error(LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE);
        }

        const next = await desktopApi.downloadSpeechModel();
        if (next) {
            setProgress(next);
        }
        return next;
    }, [desktopApi]);

    const summary = useMemo(() => ({
        isDesktopApp,
        isReady: progress.status === "ready",
        isDownloading: progress.status === "downloading",
        statusMessage: formatSpeechModelStatusMessage(progress),
    }), [isDesktopApp, progress]);

    return {
        progress,
        loading,
        downloadModel,
        ...summary,
    };
}
