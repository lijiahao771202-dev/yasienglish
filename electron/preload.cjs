const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("yasiDesktop", {
    platform: process.platform,
    isDesktopApp: true,
});
