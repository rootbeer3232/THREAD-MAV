import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { mountSine } from './calculators/sine/ui';
import { mountThread } from './calculators/thread/ui';
import { DEFAULT_SETTINGS, type Settings } from './core/settings-model';
import type { AppContext, Screen, ScreenDef } from './app/context';
import { buildHash, parseHash } from './app/router';
import { buildShell } from './app/shell';
import { applyUpdate, onSwStatus, registerServiceWorker } from './app/sw';
import { setKeepScreenOn } from './app/wakelock';
import { openRepository } from './storage/repository';
import { showToast } from './ui/dialogs';
import { aboutScreen } from './screens/about';
import { calculatorsScreen } from './screens/calcs';
import { helpScreen } from './screens/help';
import { homeScreen } from './screens/home';
import { historyScreen, savedScreen } from './screens/lists';
import { drillChartScreen, threadChartScreen } from './screens/charts';
import { settingsScreen } from './screens/settings';

async function boot() {
  const { repo, fallbackReason } = await openRepository();
  let settings: Settings = await repo.getSettings().catch(() => DEFAULT_SETTINGS);

  const ctx: AppContext = {
    repo,
    get settings() {
      return settings;
    },
    async updateSettings(patch) {
      settings = { ...settings, ...patch };
      await repo.saveSettings(settings);
      if ('keepScreenOn' in patch) await setKeepScreenOn(settings.keepScreenOn);
    },
    go(route, params) {
      const next = buildHash(route, params);
      if (location.hash === next) void render();
      else location.hash = next;
    },
    toast: showToast,
    ...(fallbackReason ? { storageFallbackReason: fallbackReason } : {}),
  } as AppContext;

  const screens: ScreenDef[] = [
    { route: '', title: 'Thread Mav', tab: 'home', render: (c) => homeScreen(c) },
    { route: 'calcs', title: 'Calculators', tab: 'calcs', render: (c) => calculatorsScreen(c) },
    { route: 'thread', title: 'Thread / 3-Wire', tab: 'calcs', back: 'calcs', backLabel: 'Calculators', render: (c, p) => mountThread(c, p) },
    { route: 'sine', title: 'Sine Bar Calculator', tab: 'calcs', back: 'calcs', backLabel: 'Calculators', render: (c, p) => mountSine(c, p) },
    { route: 'threadchart', title: 'Thread Chart', tab: 'calcs', back: 'calcs', render: (c) => threadChartScreen(c) },
    { route: 'drillchart', title: 'Drill Chart', tab: 'calcs', back: 'calcs', render: (c) => drillChartScreen(c) },
    { route: 'saved', title: 'Saved', tab: 'saved', render: (c) => savedScreen(c) },
    { route: 'history', title: 'History', tab: 'history', render: (c) => historyScreen(c) },
    { route: 'settings', title: 'Settings', tab: 'settings', render: (c) => settingsScreen(c) },
    { route: 'help', title: 'Help', tab: 'settings', back: 'settings', backLabel: 'Settings', render: (c, p) => helpScreen(c, p) },
    { route: 'about', title: 'About', tab: 'settings', back: 'settings', backLabel: 'Settings', render: (c) => aboutScreen(c) },
  ];

  const shell = buildShell(ctx);
  let current: Screen | null = null;
  let renderId = 0;

  async function render() {
    const id = ++renderId;
    const loc = parseHash(location.hash);
    const def = screens.find((s) => s.route === loc.route) ?? screens[0]!;
    current?.destroy?.();
    current = null;
    shell.setHeader(def);
    shell.main.replaceChildren();
    try {
      const scr = await def.render(ctx, loc.params);
      if (id !== renderId) {
        scr.destroy?.();
        return;
      }
      current = scr;
      shell.main.replaceChildren(scr.el);
    } catch (err) {
      console.error(err);
      shell.main.replaceChildren(Object.assign(document.createElement('div'), { className: 'screen empty', textContent: 'Something went wrong loading this screen. Go back and try again.' }));
    }
    window.scrollTo({ top: 0 });
  }

  window.addEventListener('hashchange', () => void render());
  const refreshOnline = () => shell.setOffline(!navigator.onLine);
  window.addEventListener('online', refreshOnline);
  window.addEventListener('offline', refreshOnline);
  refreshOnline();

  await setKeepScreenOn(settings.keepScreenOn);
  registerServiceWorker();
  onSwStatus((st) => {
    if (st.state === 'update-ready') shell.showUpdateBanner(() => applyUpdate());
  });
  // Ask for durable storage so the OS is less likely to evict saved calculations.
  void navigator.storage?.persist?.().catch(() => undefined);

  await render();
}

void boot();
