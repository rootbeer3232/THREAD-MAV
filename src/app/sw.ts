import { BUILD_ID } from './version';

export type SwState = 'unsupported' | 'registering' | 'active' | 'update-ready' | 'error';

export interface SwStatus {
  state: SwState;
  controlled: boolean;
  detail?: string;
}

let current: SwStatus = { state: 'unsupported', controlled: false };
const listeners = new Set<(s: SwStatus) => void>();
let waiting: ServiceWorker | null = null;

function set(s: SwStatus) {
  current = s;
  listeners.forEach((f) => f(s));
}
export function swStatus() {
  return current;
}
export function onSwStatus(fn: (s: SwStatus) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    set({ state: 'unsupported', controlled: false, detail: import.meta.env.DEV ? 'disabled in dev server' : undefined });
    return;
  }
  set({ state: 'registering', controlled: !!navigator.serviceWorker.controller });
  navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .then((reg) => {
      const flagWaiting = (w: ServiceWorker | null) => {
        if (w && navigator.serviceWorker.controller) {
          waiting = w;
          set({ state: 'update-ready', controlled: true, detail: 'A new version is ready' });
        }
      };
      flagWaiting(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed') flagWaiting(nw);
        });
      });
      set({ state: reg.waiting ? 'update-ready' : 'active', controlled: !!navigator.serviceWorker.controller });
      const check = () => void reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      window.addEventListener('online', check);
    })
    .catch((e: unknown) => set({ state: 'error', controlled: false, detail: String(e) }));

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    set({ ...current, controlled: true });
    if (reloading) location.reload();
  });
}

let reloading = false;
export function applyUpdate(): void {
  if (waiting) {
    reloading = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } else location.reload();
}

export async function checkForUpdate(): Promise<string> {
  if (!('serviceWorker' in navigator)) return 'Service workers not supported';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'Not registered (open the deployed build, not the dev server)';
  await reg.update();
  return reg.waiting ? 'Update ready — tap Reload' : `Up to date (build ${BUILD_ID})`;
}

/** Ask the active worker which cache version it holds. */
export async function swCacheVersion(): Promise<string> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sw = reg?.active;
    if (!sw) return 'none';
    return await new Promise<string>((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => resolve(String((e.data as { cache?: string }).cache ?? 'unknown'));
      sw.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
      setTimeout(() => resolve('no reply'), 1500);
    });
  } catch {
    return 'unavailable';
  }
}
