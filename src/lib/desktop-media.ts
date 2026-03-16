export type DesktopMicrophoneStatus = "granted" | "denied" | "restricted" | "unknown" | "not-determined";

export interface DesktopMicrophoneAccessResult {
    granted: boolean;
    status: DesktopMicrophoneStatus;
}

const AUDIO_RECORDER_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
] as const;

export async function ensureMicrophoneAccess(): Promise<DesktopMicrophoneAccessResult> {
    if (typeof window === "undefined") {
        return { granted: true, status: "unknown" };
    }

    const desktopApi = window.yasiDesktop;
    if (!desktopApi?.requestMicrophoneAccess) {
        return { granted: true, status: "unknown" };
    }

    return desktopApi.requestMicrophoneAccess();
}

export function getPreferredMediaRecorderMimeType() {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
        return undefined;
    }

    return AUDIO_RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function createAudioMediaRecorder(stream: MediaStream) {
    const mimeType = getPreferredMediaRecorderMimeType();
    return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

export function getMicrophoneErrorMessage(error: unknown) {
    if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
            return "Yasi 还没有拿到麦克风权限，请在系统设置里允许后重试。";
        }

        if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
            return "没有找到可用的麦克风设备。";
        }

        if (error.name === "NotReadableError" || error.name === "TrackStartError") {
            return "麦克风正在被其他应用占用，先关闭占用它的应用再试。";
        }
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    return "录音启动失败，请检查麦克风权限和设备状态。";
}
