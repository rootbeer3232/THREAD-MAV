import type { AppContext, Screen } from '../app/context';
import { h, icon } from '../ui/dom';
import { recordCard } from './record-list';

export function homeScreen(ctx: AppContext): Screen {
  const root = h('div', { class: 'screen home' });

  root.append(
    h('div', { class: 'hero' }, h('div', { class: 'hero-sub' }, 'Built by a Machinist, for Machinists.')),
    h(
      'div',
      { class: 'tile-grid' },
      tile('Thread / 3-Wire', 'Unified · Metric · Custom', 'thread', 'tile-blue'),
      tile('Sine Bar', '5.000" preset · any length', 'sine', 'tile-neutral'),
    ),
  );

  const recent = h('section', { class: 'home-section' });
  const favs = h('section', { class: 'home-section' });
  root.append(recent, favs);

  const draw = async () => {
    const [recs, fav] = await Promise.all([ctx.repo.list('recents'), ctx.repo.list('favorites')]);
    recent.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', null, 'Recent'), h('button', { class: 'link-btn', type: 'button', on: { click: () => ctx.go('history') } }, 'ALL')),
      ...(recs.length ? recs.slice(0, 3).map((r) => recordCard(ctx, r, { allowDelete: false, onChange: () => void draw() })) : [h('div', { class: 'empty small' }, 'Your last calculations show up here.')]),
    );
    favs.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', { class: 'fav-h' }, '★ Favorites'), h('button', { class: 'link-btn', type: 'button', on: { click: () => ctx.go('saved') } }, 'ALL SAVED')),
      ...(fav.length ? fav.slice(0, 3).map((r) => recordCard(ctx, r, { allowDelete: false, onChange: () => void draw() })) : [h('div', { class: 'empty small' }, 'Tap ★ on any result to pin it here.')]),
    );
  };
  void draw();

  root.append(
    h(
      'section',
      { class: 'home-section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Reference')),
      h(
        'div',
        { class: 'ref-grid' },
        refCard('3-Wire Method', 'help', 'threewire'),
        refCard('Best Wire vs Actual', 'help', 'bestwire'),
        refCard('Verified vs Geometry', 'help', 'standards'),
        refCard('What a Sine Bar Does', 'help', 'sine'),
      ),
    ),
    h('div', { class: 'tagline' }, 'THREAD ANSWERS. BOTH SYSTEMS. NO CONVERSIONS.'),
  );

  function tile(title: string, sub: string, route: string, cls: string) {
    return h('button', { class: `tile ${cls}`, type: 'button', on: { click: () => ctx.go(route) } }, h('div', { class: 'tile-title' }, title), h('div', { class: 'tile-sub' }, sub), h('span', { class: 'tile-go' }, icon('chevron', 26)));
  }
  function refCard(label: string, _ic: 'help', anchor: string) {
    return h('button', { class: 'ref-card', type: 'button', on: { click: () => ctx.go('help', { t: anchor }) } }, icon('help', 20), h('span', null, label));
  }
  return { el: root };
}
