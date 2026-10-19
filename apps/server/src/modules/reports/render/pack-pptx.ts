import {
  type PackContent,
  type PackInitiativeRow,
  type PackSection,
  REPORT_AUDIENCES,
  ROLE_LABELS,
  PACK_ROWS_PER_PAGE,
} from '@sims/contracts';
import PptxModule from 'pptxgenjs';
import {
  COLOURS,
  HEALTH_LABEL,
  kpiValue,
  longDate,
  money,
  pages,
  percent,
  pp,
  TRAJECTORY_LABEL,
} from './formatting.js';

const FONT = 'Calibri';

// The package's types describe a CommonJS module, but Node loads its ES
// build, whose default export is the class itself.
const PptxGenJS = PptxModule as unknown as typeof PptxModule.default;
type Pptx = InstanceType<typeof PptxModule.default>;
type Slide = ReturnType<Pptx['addSlide']>;
type Cell = { text: string; options?: Record<string, unknown> };

/**
 * A pack as a 16:9 PowerPoint deck: a cover slide, then one slide per
 * printed page, with the same content and wording as the PDF.
 */
export async function renderPackPptx(pack: PackContent): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.company = pack.organisation;
  pptx.title = pack.title;
  pptx.author = 'SIMS';

  const cover = pptx.addSlide();
  cover.background = { color: COLOURS.primary };
  cover.addText(pack.organisation.toUpperCase(), {
    x: 0.7,
    y: 1.2,
    w: 12,
    h: 0.4,
    fontFace: FONT,
    fontSize: 12,
    color: 'D9E1EA',
    charSpacing: 2,
  });
  cover.addText(pack.title, {
    x: 0.7,
    y: 1.7,
    w: 12,
    h: 1.2,
    fontFace: FONT,
    fontSize: 40,
    bold: true,
    color: 'FFFFFF',
  });
  cover.addText(
    `${pack.period} · prepared for ${REPORT_AUDIENCES[pack.audience]}\nFigures from the reporting cycle locked on ${longDate(pack.lockedAt)}, as approved by management.${
      pack.sensitiveSummarised
        ? `\nSensitive initiatives (${pack.sensitiveSummarised}) are summarised at pillar level for this audience.`
        : ''
    }`,
    {
      x: 0.7,
      y: 3.1,
      w: 11.5,
      h: 1.6,
      fontFace: FONT,
      fontSize: 16,
      color: 'FFFFFF',
      valign: 'top',
    },
  );

  for (const section of pack.sections) addSection(pptx, section, pack);

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(output as ArrayBuffer);
}

function titled(pptx: Pptx, title: string, pack: PackContent): Slide {
  const slide = pptx.addSlide();
  slide.addText(title, {
    x: 0.5,
    y: 0.3,
    w: 12.3,
    h: 0.6,
    fontFace: FONT,
    fontSize: 24,
    bold: true,
    color: COLOURS.primary,
  });
  slide.addText(`${pack.organisation} · ${pack.title}`, {
    x: 0.5,
    y: 7.0,
    w: 12.3,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: COLOURS.muted,
  });
  return slide;
}

function addTable(
  slide: Slide,
  headings: string[],
  rows: string[][],
  healthColumn = -1,
) {
  const head: Cell[] = headings.map((h) => ({
    text: h,
    options: {
      bold: true,
      color: COLOURS.muted,
      fill: { color: COLOURS.surface },
    },
  }));
  const body: Cell[][] = rows.map((row) =>
    row.map((text, i) => {
      if (i !== healthColumn) return { text };
      const key = (
        Object.keys(HEALTH_LABEL) as (keyof typeof HEALTH_LABEL)[]
      ).find((k) => HEALTH_LABEL[k] === text);
      return key
        ? {
            text,
            options: {
              bold: true,
              color: COLOURS.health[key].text,
              fill: { color: COLOURS.health[key].fill },
            },
          }
        : { text };
    }),
  );
  slide.addTable([head, ...body] as never, {
    x: 0.5,
    y: 1.1,
    w: 12.3,
    fontFace: FONT,
    fontSize: 10,
    color: COLOURS.ink,
    border: { type: 'solid', pt: 0.5, color: COLOURS.border },
    autoPage: false,
  });
}

function emptyNote(slide: Slide, text: string) {
  slide.addText(text, {
    x: 0.5,
    y: 1.3,
    w: 12,
    h: 0.5,
    fontFace: FONT,
    fontSize: 14,
    color: COLOURS.muted,
  });
}

function initiativeRows(
  rows: PackInitiativeRow[],
  withImpact: boolean,
): string[][] {
  return rows.map((i) => [
    `${i.code} ${i.title}`,
    i.pillar ?? '—',
    i.owner ?? '—',
    HEALTH_LABEL[i.health],
    percent(i.verifiedProgress),
    percent(i.plannedProgress),
    pp(i.gapPp),
    ...(withImpact ? [i.impactSummary ?? percent(i.impactScore)] : []),
  ]);
}
const INITIATIVE_HEADINGS = [
  'Initiative',
  'Pillar',
  'Owner',
  'Health',
  'Verified',
  'Planned',
  'Gap',
];

function paged<T>(
  rows: readonly T[],
  size: number,
  each: (rows: T[], suffix: string) => void,
) {
  const chunks = pages(rows, size);
  chunks.forEach((chunk, i) =>
    each(chunk, chunks.length > 1 ? ` (${i + 1} of ${chunks.length})` : ''),
  );
}

function addSection(pptx: Pptx, section: PackSection, pack: PackContent) {
  switch (section.key) {
    case 'executive_summary': {
      const slide = titled(pptx, section.title, pack);
      const h = section.headline;
      const currency =
        (
          pack.sections.find((s) => s.key === 'benefits') as
            { currency?: string } | undefined
        )?.currency ?? 'NGN';
      if (section.narrative) {
        slide.addText(section.narrative, {
          x: 0.5,
          y: 1.1,
          w: 12.3,
          h: 1.1,
          fontFace: FONT,
          fontSize: 14,
          color: COLOURS.ink,
          valign: 'top',
        });
      }
      const tiles: [string, string][] = [
        ['Active initiatives', String(h.initiatives)],
        ['On track', String(h.onTrack)],
        ['At risk', String(h.atRisk)],
        ['Delayed', String(h.delayed)],
        ['KPIs on trajectory', `${h.kpisOnTrajectory} / ${h.kpisTotal}`],
        [
          'Benefits realised',
          `${money(h.benefitsRealised, currency)}${h.benefitsRealisedPct === null ? '' : ` · ${h.benefitsRealisedPct}%`}`,
        ],
        ['Open escalations', String(h.openEscalations)],
        ['Decisions pending', String(h.decisionsPending)],
      ];
      tiles.forEach(([label, value], i) => {
        const x = 0.5 + (i % 4) * 3.1;
        const y = 2.5 + Math.floor(i / 4) * 2;
        slide.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w: 2.9,
          h: 1.7,
          fill: { color: 'FFFFFF' },
          line: { color: COLOURS.border, width: 1 },
        });
        slide.addText(label, {
          x: x + 0.15,
          y: y + 0.15,
          w: 2.6,
          h: 0.4,
          fontFace: FONT,
          fontSize: 11,
          color: COLOURS.muted,
        });
        slide.addText(value, {
          x: x + 0.15,
          y: y + 0.6,
          w: 2.6,
          h: 0.8,
          fontFace: FONT,
          fontSize: 26,
          bold: true,
          color: COLOURS.ink,
        });
      });
      return;
    }
    case 'pillar_performance': {
      const slide = titled(pptx, section.title, pack);
      addTable(
        slide,
        [
          'Pillar',
          'Health',
          'Execution',
          'Impact',
          'Initiatives',
          'At risk',
          'Delayed',
        ],
        section.pillars.map((p) => [
          `${p.code} ${p.title}`,
          HEALTH_LABEL[p.health],
          percent(p.executionScore),
          percent(p.impactScore),
          String(p.initiatives),
          String(p.atRisk),
          String(p.delayed),
        ]),
        1,
      );
      return;
    }
    case 'delivery_vs_value': {
      const slide = titled(pptx, section.title, pack);
      const q = section.quadrants;
      const cells: [string, string, string[], string][] = [
        [
          'Behind plan · value on track',
          'Protect momentum, unblock delivery',
          q.BEHIND_VALUE_OK,
          COLOURS.surface,
        ],
        [
          'On plan · value on track',
          'Delivering strategy as intended',
          q.ON_PLAN_VALUE_OK,
          COLOURS.health.GREEN.fill,
        ],
        [
          'Behind plan · value below target',
          'Intervene or stop',
          q.BEHIND_VALUE_LOW,
          COLOURS.health.RED.fill,
        ],
        [
          'On plan · value below target',
          'Delivered, but not creating value',
          q.ON_PLAN_VALUE_LOW,
          COLOURS.health.AMBER.fill,
        ],
      ];
      cells.forEach(([title, advice, codes, fill], i) => {
        const x = 0.5 + (i % 2) * 6.2;
        const y = 1.1 + Math.floor(i / 2) * 2.8;
        slide.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w: 6,
          h: 2.6,
          fill: { color: fill },
          line: { color: fill },
        });
        slide.addText(
          [
            {
              text: `${title}\n`,
              options: { fontSize: 11, color: COLOURS.muted },
            },
            {
              text: `${codes.length}\n`,
              options: { fontSize: 28, bold: true, color: COLOURS.ink },
            },
            {
              text: `${advice}\n`,
              options: { fontSize: 10, color: COLOURS.muted },
            },
            {
              text: codes.join(' · '),
              options: { fontSize: 9, color: COLOURS.muted },
            },
          ],
          {
            x: x + 0.2,
            y: y + 0.1,
            w: 5.6,
            h: 2.4,
            fontFace: FONT,
            valign: 'top',
          },
        );
      });
      slide.addText(
        `Value below target means impact under ${section.thresholdPct}% of target. ${q.NOT_MEASURABLE.length} initiative(s) are not yet measurable.`,
        {
          x: 0.5,
          y: 6.6,
          w: 12.3,
          h: 0.3,
          fontFace: FONT,
          fontSize: 10,
          color: COLOURS.muted,
        },
      );
      return;
    }
    case 'exceptions':
      paged(
        section.initiatives,
        PACK_ROWS_PER_PAGE.exceptions,
        (rows, suffix) => {
          const slide = titled(pptx, section.title + suffix, pack);
          if (rows.length)
            addTable(
              slide,
              [...INITIATIVE_HEADINGS, 'Impact'],
              initiativeRows(rows, true),
              3,
            );
          else emptyNote(slide, 'No initiative is at risk or delayed.');
        },
      );
      return;
    case 'decisions': {
      const slide = titled(pptx, section.title, pack);
      if (section.decisions.length)
        addTable(
          slide,
          ['Ref', 'Decision', 'Required from', 'Initiative', 'Due'],
          section.decisions.map((d) => [
            d.reference,
            d.title,
            ROLE_LABELS[d.requiredFrom],
            d.initiative ?? 'Portfolio',
            d.dueDate ? longDate(`${d.dueDate}T00:00:00Z`) : '—',
          ]),
        );
      else emptyNote(slide, 'No decisions are waiting.');
      return;
    }
    case 'benefits': {
      const slide = titled(pptx, section.title, pack);
      slide.addText(
        `Expected FY${section.year}: ${money(section.expected, section.currency)}   ·   Realised to date: ${money(section.realisedToDate, section.currency)}   ·   ${percent(section.realisedPctOfExpected)} of year-to-date expectation`,
        {
          x: 0.5,
          y: 1.1,
          w: 12.3,
          h: 0.5,
          fontFace: FONT,
          fontSize: 14,
          color: COLOURS.ink,
        },
      );
      const labels = section.quarters.map((q) => q.label);
      slide.addChart(
        pptx.ChartType.bar,
        [
          {
            name: 'Expected',
            labels,
            values: section.quarters.map((q) => q.expected),
          },
          {
            name: 'Realised',
            labels,
            values: section.quarters.map((q) => q.realised ?? 0),
          },
          {
            name: 'Forecast',
            labels,
            values: section.quarters.map((q) =>
              q.realised === null ? (q.forecast ?? 0) : 0,
            ),
          },
        ],
        {
          x: 0.5,
          y: 1.8,
          w: 12.3,
          h: 4.9,
          barGrouping: 'clustered',
          chartColors: [COLOURS.expected, COLOURS.impact, 'E8C99A'],
          showLegend: true,
          legendPos: 'b',
          valAxisLabelFormatCode: '#,##0',
          catAxisLabelFontSize: 12,
        },
      );
      return;
    }
    case 'register':
      paged(
        section.initiatives,
        PACK_ROWS_PER_PAGE.register,
        (rows, suffix) => {
          const slide = titled(pptx, section.title + suffix, pack);
          addTable(slide, INITIATIVE_HEADINGS, initiativeRows(rows, false), 3);
        },
      );
      return;
    case 'pillar_overview': {
      const slide = titled(pptx, section.title, pack);
      const p = section.pillar;
      slide.addText(
        `${p.code} ${p.title} · ${HEALTH_LABEL[p.health]} · execution ${percent(p.executionScore)} · impact ${percent(p.impactScore)} · ${p.initiatives} initiatives (${p.atRisk} at risk, ${p.delayed} delayed)`,
        {
          x: 0.5,
          y: 1.0,
          w: 12.3,
          h: 0.5,
          fontFace: FONT,
          fontSize: 13,
          color: COLOURS.ink,
        },
      );
      const table = section.objectives.map((o) => [
        `${o.code} ${o.title}`,
        HEALTH_LABEL[o.health],
        percent(o.executionScore),
        percent(o.impactScore),
      ]);
      if (table.length) {
        slide.addTable(
          [
            ['Objective', 'Health', 'Execution', 'Impact'].map((t) => ({
              text: t,
              options: {
                bold: true,
                color: COLOURS.muted,
                fill: { color: COLOURS.surface },
              },
            })),
            ...table.map((r) => r.map((text) => ({ text }))),
          ] as never,
          {
            x: 0.5,
            y: 1.7,
            w: 12.3,
            fontFace: FONT,
            fontSize: 10,
            border: { type: 'solid', pt: 0.5, color: COLOURS.border },
          },
        );
      }
      return;
    }
    case 'pillar_kpis':
      paged(section.kpis, PACK_ROWS_PER_PAGE.kpis, (rows, suffix) => {
        const slide = titled(pptx, section.title + suffix, pack);
        addTable(
          slide,
          ['KPI', 'Objective', 'Baseline', 'Target', 'Latest', 'Trajectory'],
          rows.map((k) => [
            `${k.code} ${k.name}`,
            k.objective,
            kpiValue(k.baseline, k.unit),
            kpiValue(k.target, k.unit),
            kpiValue(k.latestValue, k.unit),
            TRAJECTORY_LABEL[k.trajectory],
          ]),
        );
      });
      return;
    case 'pillar_initiatives':
      paged(
        section.initiatives,
        PACK_ROWS_PER_PAGE.initiatives,
        (rows, suffix) => {
          const slide = titled(pptx, section.title + suffix, pack);
          addTable(
            slide,
            [...INITIATIVE_HEADINGS, 'Impact'],
            initiativeRows(rows, true),
            3,
          );
        },
      );
      return;
  }
}
