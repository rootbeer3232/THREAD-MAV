import type { AppContext, Screen } from '../app/context';
import { VERSION_LABEL } from '../app/version';
import type { CalcRecord } from '../storage/types';
import { h } from '../ui/dom';
import { fmtWhen } from './record-list';

interface Header {
  job: string;
  part: string;
  operator: string;
}

/**
 * Job sheet: pick any saved / recent calculations, add a job number, part and operator, then PRINT / SAVE AS PDF.
 * No PDF library — the phone's own print dialog saves a PDF (iPhone: Share → Save to Files). Works offline.
 * Each calculation prints exactly the snapshot stored when it was calculated, with its note.
 */
export async function jobSheetScreen(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen jobsheet-screen' });
  const header: Header = { job: '', part: '', operator: '', ...((await ctx.repo.getDraft<Header>('jobsheet')) ?? {}) };
  const saveHeader = () => void ctx.repo.setDraft('jobsheet', header);

  const [saved, recents] = await Promise.all([ctx.repo.list('saved'), ctx.repo.list('recents')]);
  const pool: CalcRecord[] = [...saved, ...recents.filter((r) => !saved.some((s) => s.id === r.id))];
  const pre = params.get('r');
  if (pre && !pool.some((r) => r.id === pre)) {
    const one = await ctx.repo.getRecord(pre);
    if (one) pool.unshift(one);
  }
  const chosen = new Set<string>(pre ? [pre] : []);

  const sheet = h('section', { class: 'job-sheet', 'aria-label': 'Job sheet preview' });
  const field = (label: string, key: keyof Header, placeholder: string) => {
    const input = h('input', { class: 'js-input', type: 'text', placeholder, 'aria-label': label }) as HTMLInputElement;
    input.value = header[key];
    input.addEventListener('input', () => {
      header[key] = input.value;
      saveHeader();
      renderSheet();
    });
    return h('label', { class: 'js-field' }, h('span', { class: 'js-label' }, label), input);
  };

  const list = h('div', { class: 'js-list' });
  const renderList = () => {
    list.replaceChildren(
      ...(pool.length
        ? pool.map((r) => {
            const cb = h('input', { type: 'checkbox', class: 'js-check' }) as HTMLInputElement;
            cb.checked = chosen.has(r.id);
            cb.addEventListener('change', () => {
              if (cb.checked) chosen.add(r.id);
              else chosen.delete(r.id);
              renderSheet();
            });
            return h('label', { class: 'js-row' }, cb, h('span', { class: 'js-row-t' }, h('b', null, r.title), h('small', null, `${r.subtitle} · ${fmtWhen(r.updatedAt, true)}${r.saved ? ' · saved' : ''}`)));
          })
        : [h('p', { class: 'dim' }, 'Nothing to put on a sheet yet — calculate something first, then come back.')]),
    );
  };

  function renderSheet() {
    const picked = pool.filter((r) => chosen.has(r.id));
    const meta = h(
      'div',
      { class: 'js-meta' },
      ...[
        ['JOB #', header.job],
        ['PART', header.part],
        ['OPERATOR', header.operator],
        ['DATE', new Date().toLocaleDateString()],
      ].map(([k, v]) => h('div', null, h('small', null, k!), h('b', null, v || '—'))),
    );
    sheet.replaceChildren(
      h('h2', { class: 'js-title' }, 'THREAD MAV — JOB SHEET'),
      meta,
      ...(picked.length
        ? picked.map((r) =>
            h(
              'div',
              { class: 'js-calc' },
              h('h3', null, r.title),
              h('p', { class: 'js-sub' }, r.subtitle),
              h('table', { class: 'js-table' }, h('tbody', null, ...r.summary.map((l) => h('tr', null, h('td', null, l.label), h('td', null, l.value), h('td', { class: 'js-alt' }, l.alt ?? ''))))),
              ...(r.note.trim() ? [h('p', { class: 'js-note' }, `NOTE: ${r.note.trim()}`)] : []),
            ),
          )
        : [h('p', { class: 'dim no-print' }, 'Tick one or more calculations above to build the sheet.')]),
      h('p', { class: 'js-foot' }, `${VERSION_LABEL} — printed values are the snapshot saved when each calculation was run. Verify critical dimensions against the print and shop procedures.`),
    );
  }

  const printBtn = h('button', { class: 'btn btn-calc-blue btn-wide', type: 'button', on: { click: () => (chosen.size ? window.print() : ctx.toast('Tick at least one calculation first')) } }, 'PRINT / SAVE AS PDF');
  root.append(
    h(
      'div',
      { class: 'no-print' },
      h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Job details'), field('Job #', 'job', 'e.g. 24-1187'), field('Part', 'part', 'part name / number'), field('Operator', 'operator', 'name')),
      h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Put on the sheet'), list),
      printBtn,
      h('p', { class: 'dim small' }, 'On iPhone: tap PRINT, then the Share button and “Save to Files” to keep a PDF. Works offline.'),
    ),
    sheet,
  );
  renderList();
  renderSheet();
  return { el: root, destroy() {} };
}
