import type { AppContext, Screen } from '../app/context';
import { COARSE_METRIC, metricPitchChoices } from '../calculators/thread/metric';
import { type ThreadForm, defaultClassLabel, defaultForm } from '../calculators/thread/form';
import {
  UNIFIED_CLASSES_EXTERNAL,
  UNIFIED_SIZES,
  findUnifiedSize,
  findUnifiedSizeByMajor,
  parseDesignation,
} from '../calculators/thread/unified';
import { METRIC_CLASSES_EXTERNAL } from '../calculators/thread/metric';
import { segmented } from '../ui/components';
import { h, icon } from '../ui/dom';
import { savedRow } from './record-list';

type Sys = 'unified' | 'metric';

export function homeScreen(ctx: AppContext): Screen {
  const root = h('div', { class: 'screen home' });
  let sys: Sys = ctx.settings.defaultUnit === 'mm' ? 'metric' : 'unified';
  let sizeVal = '';
  let pitchVal = '';
  let classVal = '';
  let typed = '';

  const card = h('section', { class: 'card select-card' });
  const msg = h('div', { class: 'quick-msg' });

  const sel = (label: string, value: string, options: [string, string][], onChange: (v: string) => void) => {
    const s = h('select', { class: 'select-lg', 'aria-label': label, on: { change: (e: Event) => onChange((e.target as HTMLSelectElement).value) } });
    for (const [v, l] of options) s.append(h('option', { value: v }, l));
    s.value = value;
    return h('label', { class: 'sel-box' }, h('span', { class: 'sel-cap' }, label), s, h('span', { class: 'sel-chev' }, icon('chevron', 18)));
  };

  function drawCard() {
    const sizeOpts: [string, string][] = [['', 'ALL']];
    if (sys === 'unified') UNIFIED_SIZES.forEach((s) => sizeOpts.push([s.label, s.label]));
    else COARSE_METRIC.forEach((m) => sizeOpts.push([`M${m.d}`, `M${m.d}`]));
    const pitchOpts: [string, string][] = [['', 'ALL']];
    if (sys === 'unified') findUnifiedSize(sizeVal)?.pitches.forEach((p) => pitchOpts.push([String(p.tpi), `${p.tpi} ${p.series}`]));
    else {
      const m = COARSE_METRIC.find((x) => `M${x.d}` === sizeVal);
      if (m) metricPitchChoices(m.d).forEach((c) => pitchOpts.push([String(c.pitch), `${c.pitch}${c.fine ? ' fine' : ''}`]));
    }
    const classOpts: [string, string][] = [['', 'ALL'], ...(sys === 'unified' ? UNIFIED_CLASSES_EXTERNAL : METRIC_CLASSES_EXTERNAL).map((c): [string, string] => [c, c])];

    const input = h('input', {
      class: 'text-input designation',
      type: 'text',
      inputmode: 'text',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      placeholder: sys === 'unified' ? 'Enter Thread Size (ex: 1/2-20 UNF-2A)' : 'Enter Thread Size (ex: M12 x 1.5-6g)',
      'aria-label': 'Thread designation',
    });
    input.value = typed;
    input.addEventListener('input', () => {
      typed = input.value;
      msg.textContent = '';
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (input.blur(), go()));

    card.replaceChildren(
      h('h2', { class: 'card-title blue-title' }, 'SELECT THREAD'),
      segmented<Sys>({
        extraClass: `seg-system seg-${sys}`,
        ariaLabel: 'System',
        value: sys,
        options: [
          { value: 'unified', label: 'UNIFIED (INCH)' },
          { value: 'metric', label: 'METRIC (mm)' },
        ],
        onChange: (v) => {
          sys = v;
          sizeVal = pitchVal = classVal = '';
          drawCard();
        },
      }),
      h('div', { class: 'search-box' }, input, h('span', { class: 'search-ic' }, icon('search', 22))),
      h(
        'div',
        { class: 'sel-grid' },
        sel(sys === 'unified' ? 'Major Diameter' : 'Diameter', sizeVal, sizeOpts, (v) => {
          sizeVal = v;
          const s = findUnifiedSize(v);
          const m = COARSE_METRIC.find((x) => `M${x.d}` === v);
          pitchVal = s ? String((s.pitches.find((p) => p.series === 'UNC') ?? s.pitches[0]!).tpi) : m ? String(m.pitch) : '';
          drawCard();
        }),
        sel(sys === 'unified' ? 'Pitch / TPI' : 'Pitch', pitchVal, pitchOpts, (v) => (pitchVal = v)),
        sel('Class', classVal, classOpts, (v) => (classVal = v)),
      ),
      msg,
      h('button', { class: 'btn btn-calc-blue', type: 'button', on: { click: () => go() } }, icon('calc', 26), 'CALCULATE'),
    );
  }

  /** Hands the chosen thread to the Thread / 3-Wire screen (via its saved draft) and opens it calculated. */
  async function go() {
    const form: ThreadForm = defaultForm(sys, ctx.settings);
    const p = typed.trim() ? parseDesignation(typed) : null;
    if (typed.trim() && !p) {
      msg.className = 'quick-msg bad';
      msg.textContent = '⚠ Couldn’t read that size. Try 3/8-16, #10-32 or M10x1.5';
      return;
    }
    if (p) {
      form.system = p.system;
      form.unit = p.system === 'unified' ? 'in' : 'mm';
      form.pitchMode = p.system === 'unified' ? 'tpi' : 'pitch';
      form.majorText = String(Number(p.major.toFixed(6)));
      form.pitchText = String(p.system === 'unified' ? p.tpi : p.pitch);
      form.sizeLabel = p.system === 'unified' ? (findUnifiedSizeByMajor(p.major)?.label ?? 'other') : COARSE_METRIC.some((m) => m.d === p.major) ? `M${p.major}` : 'other';
      form.classLabel = p.classLabel ?? defaultClassLabel(p.system, true, ctx.settings);
    } else {
      if (!sizeVal || !pitchVal) {
        msg.className = 'quick-msg bad';
        msg.textContent = '⚠ Pick a size and pitch, or type a designation.';
        return;
      }
      form.sizeLabel = sizeVal;
      form.pitchText = pitchVal;
      form.majorText = sys === 'unified' ? String(findUnifiedSize(sizeVal)!.major) : String(COARSE_METRIC.find((m) => `M${m.d}` === sizeVal)!.d);
      if (classVal) form.classLabel = classVal;
    }
    await ctx.repo.setDraft('thread', { form, limitsOpen: false, calculated: true });
    ctx.go('thread');
  }

  drawCard();
  root.append(h('div', { class: 'home-tagline' }, 'THREAD ANSWERS. BOTH SYSTEMS. NO CONVERSIONS.'), card);

  root.append(
    h(
      'section',
      { class: 'card' },
      h('div', { class: 'section-head' }, h('h2', { class: 'card-title blue-title' }, 'CALCULATORS'), h('button', { class: 'link-btn', type: 'button', on: { click: () => ctx.go('calcs') } }, 'ALL ›')),
      h(
        'div',
        { class: 'quick-grid' },
        qa('SINE BAR', 'calc', () => ctx.go('sine')),
        qa('SPEEDS & FEEDS', 'calc', () => ctx.go('speeds')),
        qa('RIGHT TRIANGLE', 'calc', () => ctx.go('triangle')),
        qa('BOLT CIRCLE', 'calc', () => ctx.go('boltcircle')),
        qa('CSK / CBORE', 'calc', () => ctx.go('cskcbore')),
        qa('TAPER', 'calc', () => ctx.go('taper')),
        qa('DRILL POINT', 'calc', () => ctx.go('drillpoint')),
        qa('CHAMFER', 'calc', () => ctx.go('chamfer')),
        qa('RADIUS / CHORD', 'calc', () => ctx.go('arc')),
        qa('ALL TOOLS', 'calc', () => ctx.go('calcs')),
      ),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title blue-title' }, 'QUICK ACCESS'),
      h(
        'div',
        { class: 'quick-grid' },
        qa('RECENT', 'history', () => { try { sessionStorage.setItem('tm-history-filter', 'recents'); } catch { /* ignore */ } ctx.go('history'); }),
        qa('FAVORITES', 'star', () => { try { sessionStorage.setItem('tm-saved-filter', 'favorites'); } catch { /* ignore */ } ctx.go('saved'); }, 'fav'),
        qa('THREAD CHARTS', 'calc', () => ctx.go('threadchart')),
        qa('DRILL CHART', 'calc', () => ctx.go('drillchart')),
        qa('TOLERANCE GUIDE', 'help', () => ctx.go('help', { t: 'standards' })),
      ),
    ),
  );

  const saved = h('section', { class: 'card' });
  root.append(saved);
  const draw = async () => {
    const favs = await ctx.repo.list('favorites');
    const recs = favs.length ? favs : await ctx.repo.list('saved');
    saved.replaceChildren(
      h('div', { class: 'section-head' }, h('h2', { class: 'card-title blue-title' }, 'YOUR SAVED THREADS'), h('button', { class: 'link-btn', type: 'button', on: { click: () => ctx.go('saved') } }, 'VIEW ALL ›')),
      ...(recs.length ? recs.slice(0, 4).map((r) => savedRow(ctx, r)) : [h('div', { class: 'empty small' }, 'Saved and favorite calculations appear here.')]),
    );
  };
  void draw();

  root.append(
    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title blue-title' }, 'INFO'),
      info('3-WIRE METHOD', 'Measures over three wires placed in the thread grooves.', 'threewire'),
      info('WIRE SIZE', 'Use the best wire size — or enter the actual wire you have.', 'bestwire'),
      info('STANDARDS', 'Standard limits appear only when verified; otherwise geometry plus your manual limits.', 'standards'),
      info('DISCLAIMER', 'Always verify critical dimensions and follow shop procedures.', 'disclaimer'),
    ),
  );

  function qa(label: string, ic: 'history' | 'star' | 'calc' | 'help', fn: (() => void) | null, cls = '', badge?: string) {
    const b = h('button', { class: `qa ${cls}`, type: 'button', disabled: fn === null, on: fn ? { click: fn } : {} }, icon(ic, 34), h('span', null, label), badge ? h('small', { class: 'qa-badge' }, badge) : null);
    return b;
  }
  function info(title: string, text: string, topic: string) {
    return h('button', { class: 'info-row', type: 'button', on: { click: () => ctx.go('help', { t: topic }) } }, icon('help', 26), h('span', null, h('strong', null, title), h('small', null, text)));
  }
  return { el: root };
}
