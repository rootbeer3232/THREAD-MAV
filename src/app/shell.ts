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

const gauge = () =>
  h('span', { class: 'gauge', 'aria-hidden': 'true' }, (() => {
    const wrap = document.createElement('span');
    wrap.innerHTML =
      '<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="#52a8ff" stroke-width="3.5" stroke-linecap="round"><path d="M9 33a16 16 0 1 1 30 0"/><path d="M24 30l9-12"/><circle cx="24" cy="30" r="3" fill="#52a8ff"/><path d="M13 20l3 2M24 13v4M35 20l-3 2" stroke-width="2.5"/></svg>';
    return wrap.firstElementChild as Element;
  })());

export function buildShell(ctx: AppContext): Shell {
  const leftBtn = h('button', { class: 'hdr-btn hdr-side', type: 'button' });
  const rightBtn = h('button', { class: 'hdr-btn hdr-side', type: 'button', on: { click: () => ctx.go('saved') } }, icon('star', 24), h('span', null, 'FAVORITES'));
  const tagline = h('div', { class: 'brand-tag' });
  const brand = h(
    'button',
    { class: 'brand', type: 'button', 'aria-label': 'Thread Mav home', on: { click: () => ctx.go('') } },
    gauge(),
    h('span', { class: 'brand-text' }, h('span', { class: 'wordmark' }, h('span', { class: 'wm-thread' }, 'THREAD'), h('span', { class: 'wm-mav' }, 'MAV')), tagline),
  );
  const offline = h('span', { class: 'pill-offline', hidden: true }, 'OFFLINE');
  const header = h('header', { class: 'app-header' }, h('div', { class: 'hdr-inner' }, leftBtn, brand, rightBtn), h('div', { class: 'offline-row' }, offline));
  const titlebar = h('div', { class: 'titlebar' });
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
  app.replaceChildren(header, banner, titlebar, main, nav);

  return {
    main,
    setHeader(def) {
      const isHome = def.route === '';
      tagline.textContent = 'MACHINIST TOOLS. REAL ANSWERS.';
      leftBtn.replaceChildren(icon('settings', 24), h('span', null, 'SETTINGS'));
      leftBtn.onclick = () => ctx.go('settings');
      titlebar.hidden = isHome || def.tab === 'saved' || def.tab === 'history';
      titlebar.replaceChildren(
        def.back !== undefined ? h('button', { class: 'tb-back', type: 'button', on: { click: () => ctx.go(def.back!) } }, icon('back', 22), 'Back') : h('span', { class: 'tb-back' }),
        h('h1', { class: 'tb-title' }, def.title),
        h('span', { class: 'tb-back' }),
      );
      for (const [id, el] of tabEls) {
        el.classList.toggle('active', id === def.tab);
        if (id === def.tab) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      }
      document.title = def.route ? `${def.title} — Thread Mav` : 'Thread Mav';
    },
    setOffline(v) {
      offline.hidden = !v;
      offline.parentElement!.classList.toggle('on', v);
    },
    showUpdateBanner(onReload) {
      banner.hidden = false;
      banner.replaceChildren(h('span', null, 'Update ready'), h('button', { class: 'btn btn-primary btn-sm', type: 'button', on: { click: onReload } }, 'RELOAD'));
    },
  };
}
