/**
 * Preload bridge — the only channel between the sandboxed renderer and the
 * privileged main process. Exposes a tiny, explicit API on window.cognitive.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('cognitive', {
  /** Subscribe to system telemetry events streamed from the main process. */
  onTelemetry: (cb: (data: unknown) => void): void => {
    ipcRenderer.on('telemetry', (_e, data) => cb(data));
  },
  /** Report the live Cognitive Load Index so the menu-bar title can recolor. */
  sendCLI: (cli: number, redline: boolean): void => {
    ipcRenderer.send('cli-update', { cli, redline });
  },
  /** Fire a native macOS notification. */
  notify: (title: string, body: string): void => {
    ipcRenderer.send('notify', { title, body });
  },
});
