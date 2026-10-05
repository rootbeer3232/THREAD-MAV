import { h, icon, type IconName } from '../ui/dom';
import type { AppContext, ScreenDef } from './context';

export const TABS: { id: ScreenDef['tab']; route: string; label: string; icon: IconName }[] = [
  { id: 'home', route: '', label: 'Home', icon: 'home' },
  { id: 'calcs', route: 'calcs', label: 'Calcs', icon: 'calc' },
  { id: 'saved', route: 'saved', label: 'Saved', icon: 'saved' },
  { id: 'history', route: 'history', label: 'History', icon: 'history' },
  { id: 'settings', route: 'settings', label: 'Settings', icon: 'settings' },
];

export interface Shell {
  main: HTMLElement;
  setHeader(def: ScreenDef): void;
  setOffline(offline: boolean): void;
  showUpdateBanner(onReload: () => void): void;
}

export function buildShell(ctx: AppContext): Shell {
  const backBtn = h('button', { class: 'hdr-btn hdr-back', type: 'button', 'aria-label': 'Back' }, icon('back', 26));
  const title = h('h1', { class: 'hdr-title' });
  const offline = h('span', { class: 'pill-offline', hidden: true }, 'OFFLINE');
  const helpBtn = h('button', { class: 'hdr-btn', type: 'button', 'aria-label': 'Help', on: { click: () => ctx.go('help') } }, icon('help', 24));
  const header = h('header', { class: 'app-header' }, h('div', { class: 'hdr-inner' }, backBtn, title, offline, helpBtn));
  const banner = h('div', { class: 'update-banner', hidden: true });
  const main = h('main', { id: 'main', class: 'app-main', tabindex: '-1' });
  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Primary' });
  const tabEls = new Map<string, HTMLElement>();
  for (const t of TABS) {
    const b = h('button', { class: 'tab', type: 'button', 'data-tab': t.id, on: { click: () => ctx.go(t.route) } }, icon(t.icon, 26), h('span', null, t.label));
    tabEls.set(t.id, b);
    nav.append(b);
  }
  const app = document.getElementById('app')!;
  app.replaceChildren(header, banner, main, nav);

  let backRoute: string | undefined;
  backBtn.addEventListener('click', () => ctx.go(backRoute ?? ''));

  return {
    main,
    setHeader(def) {
      title.textContent = def.title;
      backRoute = def.back;
      backBtn.style.visibility = def.back !== undefined ? 'visible' : 'hidden';
      for (const [id, el] of tabEls) {
        el.classList.toggle('active', id === def.tab);
        if (id === def.tab) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      }
      document.title = def.route ? `${def.title} — Thread Mav` : 'Thread Mav';
    },
    setOffline(v) {
      offline.hidden = !v;
    },
    showUpdateBanner(onReload) {
      banner.hidden = false;
      banner.replaceChildren(h('span', null, 'Update ready'), h('button', { class: 'btn btn-primary btn-sm', type: 'button', on: { click: onReload } }, 'RELOAD'));
    },
  };
}
