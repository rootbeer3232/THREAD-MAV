import type { AppContext, Screen } from '../app/context';
import { APP_VERSION, BUILD_ID, VERSION_LABEL } from '../app/version';
import { h } from '../ui/dom';

export function aboutScreen(_ctx: AppContext): Screen {
  return {
    el: h(
      'div',
      { class: 'screen about' },
      h('div', { class: 'about-logo' }, 'THREAD MAV'),
      h('p', { class: 'about-line' }, 'Built by a Machinist, for Machinists.'),
      h('p', { class: 'about-tag' }, 'Quick. Accurate. Reliable. Right there in the shop.'),
      h('div', { class: 'card' }, h('p', null, 'Thread Mav is designed around real shop-floor calculations and the math machinists repeat every day — threads, wires, angles — with inch and metric always shown together.'), h('p', null, 'Offline-first and private: calculations happen on this device, there is no account, no ads and no tracking.')),
      h('div', { class: 'card' }, h('h3', { class: 'card-title' }, 'Version'), h('p', { class: 'mono' }, VERSION_LABEL), h('p', { class: 'mono dim' }, `v${APP_VERSION} · build ${BUILD_ID}`)),
      h('p', { class: 'dim small' }, 'Always verify critical dimensions and follow shop procedures. Thread Mav is a calculator and aid; it does not replace the controlling drawing, shop procedures, calibrated inspection equipment or applicable standards.'),
    ),
  };
}
