export type DesktopSpeechModelStatus = "missing" | "downloading" | "ready" | "failed";

export interface DesktopSpeechModelProgress {
    status: DesktopSpeechModelStatus;
    modelPath: string;
    downloadedBytes: number;
    totalBytes: number | null;
    error: string | null;
}

export interface SpeechInputResult {
    text: string;
    isEndpoint: boolean;
    isFinal: boolean;
}

export const LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE =
    "本地语音识别目前只在桌面 App 提供，网页端暂时维护中。";

export const LOCAL_SPEECH_MODEL_MISSING_MESSAGE =
    "当前设备还没完成本地语音模型安装，请先下载模型后再开始录音。";

export const LOCAL_SPEECH_MODEL_FAILED_MESSAGE =
    "本地语音模型安装失败，请重试下载。";

export const LOCAL_SPEECH_DOWNLOADING_MESSAGE =
    "本地语音模型正在下载中，下载完成后就可以开始录音。";

export const LOCAL_SPEECH_TRANSCRIBE_FAILED_MESSAGE =
    "本地语音转写失败，请重试一次。";

export function formatSpeechModelStatusMessage(progress: DesktopSpeechModelProgress | null | undefined) {
    if (!progress) {
        return LOCAL_SPEECH_DESKTOP_ONLY_MESSAGE;
    }

    switch (progress.status) {
        case "ready":
            return "本地英文语音模型已就绪。";
        case "downloading":
            return LOCAL_SPEECH_DOWNLOADING_MESSAGE;
        case "failed":
            return progress.error || LOCAL_SPEECH_MODEL_FAILED_MESSAGE;
        case "missing":
        default:
            return LOCAL_SPEECH_MODEL_MISSING_MESSAGE;
    }
}

export function formatBytes(bytes: number | null) {
    if (bytes == null || Number.isNaN(bytes)) {
        return "0 B";
    }

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
