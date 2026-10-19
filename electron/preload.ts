import { contextBridge, ipcRenderer } from 'electron';

/**
 * Minimal, explicit bridge. Only three whitelisted channels are exposed and none
 * of them accepts arbitrary code, paths or shell commands.
 */
const api = {
  getAppInfo: (): Promise<{ name: string; version: string; platform: string; isPackaged: boolean }> =>
    ipcRenderer.invoke('pidlab:app-info'),
  exportResults: (json: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('pidlab:export-results', json)
};

contextBridge.exposeInMainWorld('pidLab', Object.freeze(api));

export type PidLabBridge = typeof api;
