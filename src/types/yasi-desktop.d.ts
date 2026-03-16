import type { DesktopMicrophoneAccessResult } from "@/lib/desktop-media";
import type { DesktopSpeechModelProgress } from "@/lib/speech-input";

declare global {
    interface Window {
        yasiDesktop?: {
            platform: string;
            isDesktopApp: boolean;
            getMicrophoneStatus?: () => Promise<DesktopMicrophoneAccessResult>;
            requestMicrophoneAccess?: () => Promise<DesktopMicrophoneAccessResult>;
            getSpeechModelStatus?: () => Promise<DesktopSpeechModelProgress>;
            getSpeechModelPath?: () => Promise<string>;
            downloadSpeechModel?: () => Promise<DesktopSpeechModelProgress>;
            onSpeechModelProgress?: (listener: (progress: DesktopSpeechModelProgress) => void) => (() => void);
            onSpeechModelStatus?: (listener: (progress: DesktopSpeechModelProgress) => void) => (() => void);
        };
    }
}

export {};
