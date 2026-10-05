/** Screen Wake Lock wrapper. Reports honestly when unsupported. */
type Sentinel = { release(): Promise<void>; addEventListener(t: string, f: () => void): void };
interface WakeNav {
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
}

let sentinel: Sentinel | null = null;
let wanted = false;
let bound = false;

export function wakeLockSupported(): boolean {
  return !!(navigator as unknown as WakeNav).wakeLock;
}

export function wakeLockActive(): boolean {
  return sentinel !== null;
}

async function acquire() {
  if (!wanted || sentinel || document.visibilityState !== 'visible') return;
  try {
    const s = await (navigator as unknown as WakeNav).wakeLock!.request('screen');
    sentinel = s;
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null;
    });
  } catch {
    sentinel = null; // denied (e.g. low power mode) — not an error worth surfacing
  }
}

export async function setKeepScreenOn(on: boolean): Promise<void> {
  wanted = on;
  if (!bound) {
    bound = true;
    document.addEventListener('visibilitychange', () => void acquire());
  }
  if (!wakeLockSupported()) return;
  if (on) await acquire();
  else if (sentinel) {
    const s = sentinel;
    sentinel = null;
    try {
      await s.release();
    } catch {
      /* ignore */
    }
  }
}
