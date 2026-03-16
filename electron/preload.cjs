const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yasiDesktop", {
    platform: process.platform,
    isDesktopApp: true,
    getMicrophoneStatus: () => ipcRenderer.invoke("desktop:get-microphone-status"),
    requestMicrophoneAccess: () => ipcRenderer.invoke("desktop:request-microphone-access"),
    getSpeechModelStatus: () => ipcRenderer.invoke("desktop:get-speech-model-status"),
    getSpeechModelPath: () => ipcRenderer.invoke("desktop:get-speech-model-path"),
    downloadSpeechModel: () => ipcRenderer.invoke("desktop:download-speech-model"),
    onSpeechModelProgress: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on("speech-model:progress", wrapped);
        return () => ipcRenderer.removeListener("speech-model:progress", wrapped);
    },
    onSpeechModelStatus: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on("speech-model:status", wrapped);
        return () => ipcRenderer.removeListener("speech-model:status", wrapped);
    },
});
