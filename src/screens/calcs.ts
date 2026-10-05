import type { AppContext, Screen } from '../app/context';
import { CALCULATORS, CATEGORIES } from '../calculators/registry';
import { h, icon } from '../ui/dom';

export function calculatorsScreen(ctx: AppContext): Screen {
  const root = h('div', { class: 'screen' });
  for (const cat of CATEGORIES) {
    const items = CALCULATORS.filter((c) => c.category === cat.id);
    root.append(
      h(
        'section',
        { class: 'home-section' },
        h('div', { class: 'section-head' }, h('h2', null, cat.name)),
        ...items.map((c) =>
          c.status === 'ready'
            ? h(
                'button',
                { class: 'card calc-item', type: 'button', on: { click: () => ctx.go(c.route!) } },
                h('div', null, h('div', { class: 'calc-name' }, c.name), h('div', { class: 'calc-blurb' }, c.blurb)),
                icon('chevron', 24),
              )
            : h('div', { class: 'card calc-item calc-planned', 'aria-disabled': 'true' }, h('div', null, h('div', { class: 'calc-name' }, c.name), h('div', { class: 'calc-blurb' }, c.blurb)), h('span', { class: 'badge badge-planned' }, 'PLANNED')),
        ),
      ),
    );
  }
  root.append(h('p', { class: 'dim small center' }, 'PLANNED tools are on the roadmap and not implemented yet.'));
  return { el: root };
}
