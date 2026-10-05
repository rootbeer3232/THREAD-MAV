import type { AppContext, Screen } from '../app/context';
import { exportJson } from '../app/share';
import { applyUpdate, checkForUpdate, onSwStatus, swCacheVersion, swStatus } from '../app/sw';
import { APP_VERSION, BUILD_ID, BUILD_TIME, ENGINE_VERSION, VERSION_LABEL } from '../app/version';
import { wakeLockActive, wakeLockSupported } from '../app/wakelock';
import { DEFAULT_SETTINGS, type Settings } from '../core/settings-model';
import { METRIC_CLASSES_EXTERNAL, METRIC_CLASSES_INTERNAL } from '../calculators/thread/metric';
import { segmented, selectField } from '../ui/components';
import { confirmDialog } from '../ui/dialogs';
import { h } from '../ui/dom';

export function settingsScreen(ctx: AppContext): Screen {
  const root = h('div', { class: 'screen settings' });
  const s = ctx.settings;
  const set = (patch: Partial<Settings>) => void ctx.updateSettings(patch).then(() => draw());

  function draw() {
    const cur = ctx.settings;
    const wl = wakeLockSupported();
    root.replaceChildren(
      group('Defaults', [
        row('Default unit', segmented<'in' | 'mm'>({ ariaLabel: 'Default unit', value: cur.defaultUnit, tone: 'neutral', options: [{ value: 'in', label: 'INCH' }, { value: 'mm', label: 'METRIC' }], onChange: (v) => set({ defaultUnit: v }) })),
        selectField({ id: 'set-uclass', label: 'Default Unified class', value: cur.defaultUnifiedClass, options: [{ value: '1', label: 'Class 1 (1A / 1B)' }, { value: '2', label: 'Class 2 (2A / 2B)' }, { value: '3', label: 'Class 3 (3A / 3B)' }], onChange: (v) => set({ defaultUnifiedClass: v as Settings['defaultUnifiedClass'] }) }).el,
        selectField({ id: 'set-mext', label: 'Default metric class — external', value: cur.defaultMetricExternal, options: METRIC_CLASSES_EXTERNAL.map((c) => ({ value: c, label: c })), onChange: (v) => set({ defaultMetricExternal: v }) }).el,
        selectField({ id: 'set-mint', label: 'Default metric class — internal', value: cur.defaultMetricInternal, options: METRIC_CLASSES_INTERNAL.map((c) => ({ value: c, label: c })), onChange: (v) => set({ defaultMetricInternal: v }) }).el,
        row('Wire mode', segmented<'actual' | 'best'>({ ariaLabel: 'Wire mode', value: cur.wireMode, tone: 'neutral', options: [{ value: 'actual', label: 'ACTUAL', sub: 'enter wire' }, { value: 'best', label: 'BEST', sub: 'theoretical' }], onChange: (v) => set({ wireMode: v }) })),
      ]),
      group('Display', [
        row('Inch decimals', segmented<'4' | '5' | '6'>({ ariaLabel: 'Inch decimals', value: String(cur.inchDecimals) as '4', tone: 'neutral', options: [{ value: '4', label: '4' }, { value: '5', label: '5' }, { value: '6', label: '6' }], onChange: (v) => set({ inchDecimals: Number(v) as Settings['inchDecimals'] }) })),
        row('Metric decimals', segmented<'2' | '3' | '4'>({ ariaLabel: 'Metric decimals', value: String(cur.metricDecimals) as '3', tone: 'neutral', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }], onChange: (v) => set({ metricDecimals: Number(v) as Settings['metricDecimals'] }) })),
        h(
          'div',
          { class: 'toggle-row' },
          h('div', null, h('div', { class: 'field-label' }, 'Keep screen on'), h('div', { class: 'dim small' }, wl ? (cur.keepScreenOn ? (wakeLockActive() ? 'Active while the app is open.' : 'On — activates while the app is visible.') : 'Off') : 'Not available in this browser — the screen will dim normally.')),
          h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(cur.keepScreenOn && wl), disabled: !wl, on: { click: () => set({ keepScreenOn: !cur.keepScreenOn }) } }, h('span', { class: 'knob' })),
        ),
      ]),
      group('Data (stored only on this device)', [
        h('button', { class: 'btn btn-secondary btn-wide', type: 'button', on: { click: async () => exportJson(`thread-mav-history-${new Date().toISOString().slice(0, 10)}.json`, await ctx.repo.exportBundle('all'), ctx.toast) } }, 'EXPORT HISTORY (JSON)'),
        h('button', { class: 'btn btn-secondary btn-wide', type: 'button', on: { click: async () => {
          const okc = await confirmDialog({ title: 'Clear recents?', message: 'Removes automatic recent calculations. Saved items, favorites and notes are kept.', confirmText: 'CLEAR RECENTS' });
          if (okc) ctx.toast(`Cleared ${await ctx.repo.clearRecents()} recent calculation(s)`);
        } } }, 'CLEAR RECENTS'),
        h('div', { class: 'danger-gap' }),
        h('button', { class: 'btn btn-danger btn-wide', type: 'button', on: { click: async () => {
          const first = await confirmDialog({ title: 'Clear ALL data?', message: 'This permanently deletes every saved calculation, favorite, note, history entry and your settings from this device. It cannot be undone.', confirmText: 'CONTINUE', danger: true });
          if (!first) return;
          const second = await confirmDialog({ title: 'Really delete everything?', message: 'Last chance — all Thread Mav data on this device will be erased.', confirmText: 'DELETE EVERYTHING', danger: true });
          if (!second) return;
          await ctx.repo.clearAll();
          await ctx.updateSettings({ ...DEFAULT_SETTINGS });
          ctx.toast('All data cleared');
          ctx.go('');
        } } }, 'CLEAR ALL DATA'),
      ]),
      group('Updates & diagnostics', [diagnostics(ctx)]),
      h('button', { class: 'btn btn-secondary btn-wide', type: 'button', on: { click: () => ctx.go('about') } }, 'ABOUT THREAD MAV'),
      h('div', { class: 'version-line' }, `${VERSION_LABEL} · v${APP_VERSION} · ${BUILD_ID}`),
    );
    void s;
  }
  draw();
  return { el: root };
}

function group(title: string, children: (HTMLElement | null)[]) {
  return h('section', { class: 'card settings-group' }, h('h3', { class: 'card-title' }, title), ...children);
}
function row(label: string, control: HTMLElement) {
  return h('div', { class: 'field' }, h('div', { class: 'field-label' }, label), control);
}

function diagnostics(ctx: AppContext): HTMLElement {
  const box = h('div', { class: 'diag' });
  const lines = h('dl', { class: 'diag-list' });
  const updateRow = h('div', { class: 'diag-actions' });
  box.append(lines, updateRow);

  const draw = async () => {
    const sw = swStatus();
    const cache = await swCacheVersion();
    let persisted = 'unknown';
    try {
      persisted = (await navigator.storage?.persisted?.()) ? 'granted' : 'not granted';
    } catch {
      /* ignore */
    }
    const kv: [string, string][] = [
      ['App version', `${APP_VERSION} (${VERSION_LABEL})`],
      ['Build', `${BUILD_ID}${BUILD_TIME ? ` · ${BUILD_TIME}` : ''}`],
      ['Calculation engines', ENGINE_VERSION],
      ['Service worker', `${sw.state}${sw.controlled ? ' · controlling page' : ''}${sw.detail ? ` · ${sw.detail}` : ''}`],
      ['Offline cache', cache],
      ['Storage', `${ctx.repo.backend.kind} · schema v${ctx.repo.backend.schemaVersion}${ctx.storageFallbackReason ? ` · FALLBACK (${ctx.storageFallbackReason})` : ''}`],
      ['Persistent storage', persisted],
      ['Network', navigator.onLine ? 'online' : 'offline'],
      ['Display mode', matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone ? 'standalone (Home Screen app)' : 'browser tab'],
    ];
    lines.replaceChildren(...kv.flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
    updateRow.replaceChildren(
      h('button', { class: 'btn btn-secondary btn-wide', type: 'button', on: { click: async () => ctx.toast(await checkForUpdate()) } }, 'CHECK FOR UPDATE'),
    );
    if (sw.state === 'update-ready') {
      updateRow.append(h('button', { class: 'btn btn-primary btn-wide', type: 'button', on: { click: () => applyUpdate() } }, 'RELOAD TO UPDATE'));
    }
  };
  void draw();
  onSwStatus(() => void draw());
  window.addEventListener('online', () => void draw());
  window.addEventListener('offline', () => void draw());
  return box;
}
