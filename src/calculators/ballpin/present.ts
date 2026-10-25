import { fmtLoose } from '../../core/format';
import type { Presentation } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { DovetailResult, VBallResult } from './engine';

export function presentDovetail(r: DovetailResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const male = r.kind === 'male';
  const meas = male ? 'Measurement over pins' : 'Measurement between pins';
  const width = 'Width at the sharp base corners';
  return {
    title: `${male ? 'Male' : 'Female'} dovetail — ${fmtLoose(r.input.angleDeg, 3)}°`,
    subtitle: `Ø${r.unit === 'in' ? r.input.pin.toFixed(4) : r.input.pin.toFixed(3)} ${r.unit} pins`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      {
        rows: [
          r.solved === 'measurement' ? { label: meas, dual: d(r.measurement), size: 'hero' } : { label: width, dual: d(r.width), size: 'hero' },
          r.solved === 'measurement' ? { label: width, dual: d(r.width), size: 'normal' } : { label: meas, dual: d(r.measurement), size: 'normal' },
          {
            label: `Pins ${male ? 'add' : 'take away'}  d·(1 + cot(α/2))`,
            dual: d(r.pinAllowance),
            size: 'normal',
          },
        ],
      },
    ],
    messages: [
      {
        tone: 'info',
        text: `α is the angle between the base and the flank (${fmtLoose(r.input.angleDeg, 3)}°). Width is to the SHARP corners where flank meets base. The pins must touch the flank below its top edge and sit flat on the base — check that before trusting the reading.`,
      },
    ],
  };
}

export function presentVBall(r: VBallResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const msgs: Presentation['messages'] = [
    {
      tone: 'info',
      text: 'Height is from the surface to the top of the ball / pin (negative = top is below the surface). Opening is the countersink diameter, or the V width, at the surface.',
    },
  ];
  if (!r.seats)
    msgs.unshift({
      tone: 'warn',
      text: 'This ball is too big — it would rest on the top edge, not on the angled sides, so these numbers do not apply. Use a smaller ball.',
    });
  return {
    title: `Ball in a ${fmtLoose(r.input.includedDeg, 3)}° V / countersink`,
    subtitle: `Ø${r.unit === 'in' ? r.input.ball.toFixed(4) : r.input.ball.toFixed(3)} ${r.unit} ball / pin`,
    badges: [
      {
        text: r.seats ? 'CALCULATED' : 'NOT VALID',
        tone: r.seats ? 'geometry' : 'warn',
      },
    ],
    ...(r.seats
      ? {}
      : {
          status: {
            level: 'red' as const,
            text: 'STOP — ball does not seat on the angled sides',
          },
        }),
    sections: !r.seats
      ? []
      : [
          {
            rows: [
              r.solved === 'height'
                ? {
                    label: 'Ball top above the surface',
                    dual: d(r.height),
                    size: 'hero',
                  }
                : {
                    label: 'Opening at the surface',
                    dual: d(r.opening),
                    size: 'hero',
                  },
              r.solved === 'height'
                ? {
                    label: 'Opening at the surface',
                    dual: d(r.opening),
                    size: 'normal',
                  }
                : {
                    label: 'Ball top above the surface',
                    dual: d(r.height),
                    size: 'normal',
                  },
              {
                label: 'Sharp apex depth below the surface',
                dual: d(r.apexDepth),
                size: 'normal',
              },
              {
                label: 'Ball center above the apex',
                dual: d(r.centerAboveApex),
                size: 'normal',
              },
            ],
          },
        ],
    messages: msgs,
  };
}
