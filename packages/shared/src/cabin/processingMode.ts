import { hasCloudConsent, setCloudConsent, cloudHeaders } from './cloudConsent';
import { isOnlineLangCode } from '../i18n/onlineLanguages';

export type ProcessingMode = 'offline' | 'online';
let mode: ProcessingMode = 'offline';
const listeners = new Set<() => void>();
export function getProcessingMode(): ProcessingMode { return mode; }
export function subscribeProcessingMode(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }
/** Online selection is the explicit opt-in action; never persist it between page sessions. */
export function setProcessingMode(value: ProcessingMode): void {
  if (value === mode && (value === 'offline' ? !hasCloudConsent() : hasCloudConsent())) return;
  mode = value; setCloudConsent(value === 'online'); listeners.forEach((listener) => listener());
}
export function usesOnline(lang: string): boolean { return mode === 'online' && hasCloudConsent() && isOnlineLangCode(lang); }
export function processingHeaders(...languages: string[]): Record<string, string> {
  return mode === 'online' && hasCloudConsent() && languages.every(isOnlineLangCode)
    ? { 'X-HearMe-Mode': 'online', ...cloudHeaders() } : {};
}

/** Synchronize the demo's embedded devices only with their same-origin parent/registered child frames. */
export function installModeBridge(win: Window = window): () => void {
  const post = (target: Window, type: 'mode' | 'ready', value = getProcessingMode()) => target.postMessage({ source: 'hearme-mode', type, mode: value }, win.location.origin);
  const send = () => {
    if (win.parent !== win) post(win.parent, 'mode');
    for (let i = 0; i < win.frames.length; i++) post(win.frames[i]!, 'mode');
  };
  let receiving = false;
  const off = subscribeProcessingMode(() => { if (!receiving) send(); });
  const receive = (event: MessageEvent) => {
    if (event.origin !== win.location.origin || event.data?.source !== 'hearme-mode') return;
    const parent = win.parent !== win && event.source === win.parent;
    let child = false;
    for (let i = 0; i < win.frames.length; i++) if (event.source === win.frames[i]) child = true;
    if (!parent && !child) return;
    if (event.data.type === 'ready') { if (child) post(event.source as Window, 'mode'); return; }
    if (event.data.type !== 'mode' || !['online', 'offline'].includes(event.data.mode)) return;
    receiving = true; setProcessingMode(event.data.mode); receiving = false;
    if (child) send();
  };
  win.addEventListener('message', receive);
  if (win.parent !== win) post(win.parent, 'ready');
  return () => { off(); win.removeEventListener('message', receive); };
}
