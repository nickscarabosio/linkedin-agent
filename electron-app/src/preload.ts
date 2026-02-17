import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  onLog: (callback: (entry: { message: string; level?: string }) => void) => {
    ipcRenderer.on("log", (_event, entry) => callback(entry));
  },
  onStatusUpdate: (callback: (status: Record<string, any>) => void) => {
    ipcRenderer.on("status-update", (_event, status) => callback(status));
  },
});
