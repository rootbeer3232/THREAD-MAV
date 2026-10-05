import type { AppContext, Screen } from '../app/context';
import { h } from '../ui/dom';

const topics: { id: string; title: string; body: string[] }[] = [
  {
    id: 'threewire',
    title: 'What is the 3-wire method?',
    body: [
      'Three wires of equal diameter are laid in the thread grooves — one on one side, two on the other — and the distance across them is measured with a micrometer.',
      'That “measurement over wires” converts directly to the pitch diameter, which a plain micrometer can’t reach.',
      'Thread Mav uses M = E + 3W − 0.866025·P for 60° threads, where E is pitch diameter, W is the wire diameter and P is the pitch. It assumes straight 60° flanks and does not apply a lead-angle correction.',
    ],
  },
  {
    id: 'bestwire',
    title: 'Best wire vs actual wire',
    body: [
      'Best wire (0.57735 × pitch) touches the flanks exactly at the pitch line, so small flank-angle errors don’t change the reading.',
      'You rarely own the exact best wire. Enter the ACTUAL wire diameter you are using — every number in Thread Mav is calculated from it. If you leave it blank, the theoretical best wire is used and the result says so.',
      'Wires much smaller than about 0.505 × pitch can let the micrometer anvil touch the crests; Thread Mav warns you. Wires that don’t seat on the flanks at all are refused.',
    ],
  },
  {
    id: 'standards',
    title: 'Verified vs geometry vs manual',
    body: [
      'GEOMETRY ONLY — pure 60° thread math (basic pitch diameter, best wire, over wires). Always correct for the dimensions entered.',
      'MANUAL — limits you typed in from your print or standard. Thread Mav calculates over-wires for them, but never presents them as standard data.',
      'CUSTOM — a thread you defined yourself.',
      'VERIFIED — tolerance limits that passed Thread Mav’s standards gate (exact edition, provenance, verifier, date). This build ships with NO verified records, so standard acceptance limits (ASME B1.1, ISO 965) show as STANDARD LIMITS NOT VERIFIED. Wrong limits are worse than none.',
    ],
  },
  {
    id: 'class',
    title: 'Why does thread class matter?',
    body: [
      'Class sets how much pitch-diameter tolerance (and allowance) the thread gets — 1A/2A/3A external and 1B/2B/3B internal for Unified, 6g/6H etc. for metric. The class changes the pitch-diameter limits and therefore the over-wires window.',
      'Thread Mav records the class you choose, but until verified limits are loaded you supply the pitch-diameter limits through MANUAL LIMITS.',
    ],
  },
  {
    id: 'sine',
    title: 'What does a sine bar calculate?',
    body: [
      'A sine bar tilts to an angle when a gage-block stack is placed under one roller: stack = L × sin θ, where L is the roller center-to-center distance (commonly 5.000 in).',
      'FIND STACK gives the gage-block height for an angle. FIND ANGLE gives the angle for a stack. Above about 45° a sine bar setup loses accuracy quickly.',
    ],
  },
  {
    id: 'units',
    title: 'Inch and metric',
    body: ['Every result shows both systems, blue for inch and red for metric, from the same underlying number (1 in = 25.4 mm exactly). There is no convert step.'],
  },
  {
    id: 'disclaimer',
    title: 'Professional use',
    body: ['Always verify critical dimensions and follow shop procedures. Thread Mav is a calculator and aid; it does not replace the controlling drawing, shop procedures, calibrated inspection equipment or the applicable standard.'],
  },
];

export function helpScreen(_ctx: AppContext, params: URLSearchParams): Screen {
  const open = params.get('t');
  const root = h('div', { class: 'screen help' });
  for (const t of topics) {
    const d = h('details', { class: 'card help-item', id: `help-${t.id}` }, h('summary', null, t.title), ...t.body.map((p) => h('p', null, p)));
    if (t.id === open) d.setAttribute('open', '');
    root.append(d);
  }
  if (open) setTimeout(() => root.querySelector(`#help-${open}`)?.scrollIntoView({ block: 'start' }), 30);
  return { el: root };
}
