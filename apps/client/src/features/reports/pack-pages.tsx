import {
  PACK_ROWS_PER_PAGE,
  type PackContent,
  type PackSection,
  ROLE_LABELS,
} from '@sims/contracts';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatMoney, formatPercent } from '@/lib/format';
import { HEALTH_DISPLAY, TRAJECTORY_DISPLAY } from '@/lib/health';
import { InitiativeRows, MiniTable, Tile } from './preview-parts';

/** One printed page: a title and what is on it. */
export interface PreviewPage {
  title: string;
  body: ReactNode;
}

const chunks = <T,>(rows: readonly T[], size: number): T[][] => {
  if (rows.length === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

/**
 * Splits the pack into the same pages the files print (cover, then each
 * section, long lists over several pages), so "Page 2 of 8" here is page 2
 * of the PDF.
 */
export function previewPages(
  pack: PackContent,
  currency: string,
): PreviewPage[] {
  const pages: PreviewPage[] = [
    {
      title: pack.title,
      body: (
        <>
          <p>
            {pack.period} ·{' '}
            {pack.audience === 'BOARD' ? 'Board of Directors' : 'EXCO'}
          </p>
          <ol className="mt-2 list-decimal pl-4">
            {pack.sections.map((s) => (
              <li key={s.key}>{s.title}</li>
            ))}
          </ol>
        </>
      ),
    },
  ];
  for (const section of pack.sections)
    pages.push(...sectionPages(section, currency));
  return pages;
}

function paged<T>(
  title: string,
  rows: readonly T[],
  size: number,
  body: (rows: T[]) => ReactNode,
): PreviewPage[] {
  const parts = chunks(rows, size);
  return parts.map((part, i) => ({
    title: parts.length > 1 ? `${title} (${i + 1} of ${parts.length})` : title,
    body: body(part),
  }));
}

function sectionPages(section: PackSection, currency: string): PreviewPage[] {
  const { title } = section;
  switch (section.key) {
    case 'executive_summary': {
      const h = section.headline;
      return [
        {
          title,
          body: (
            <>
              {section.narrative && (
                <p className="mb-2 border-l-2 border-impact pl-2">
                  {section.narrative}
                </p>
              )}
              <div className="grid grid-cols-4 gap-1">
                <Tile label="Initiatives" value={h.initiatives} />
                <Tile
                  label="On track"
                  value={h.onTrack}
                  tone="bg-success-soft"
                />
                <Tile label="At risk" value={h.atRisk} tone="bg-warning-soft" />
                <Tile label="Delayed" value={h.delayed} tone="bg-danger-soft" />
                <Tile
                  label="KPIs on trajectory"
                  value={`${h.kpisOnTrajectory} / ${h.kpisTotal}`}
                />
                <Tile
                  label="Benefits realised"
                  value={formatMoney(h.benefitsRealised, currency)}
                />
                <Tile label="Open escalations" value={h.openEscalations} />
                <Tile label="Decisions pending" value={h.decisionsPending} />
              </div>
            </>
          ),
        },
      ];
    }
    case 'pillar_performance':
      return [
        {
          title,
          body: (
            <MiniTable
              headings={['Pillar', 'Health', 'Execution', 'Impact']}
              rows={section.pillars.map((p) => [
                `${p.code} ${p.title}`,
                HEALTH_DISPLAY[p.health].label,
                formatPercent(p.executionScore),
                formatPercent(p.impactScore),
              ])}
            />
          ),
        },
      ];
    case 'delivery_vs_value': {
      const q = section.quadrants;
      return [
        {
          title,
          body: (
            <div className="grid grid-cols-2 gap-1">
              <Tile
                label="Behind plan · value on track"
                value={q.BEHIND_VALUE_OK.length}
              />
              <Tile
                label="On plan · value on track"
                value={q.ON_PLAN_VALUE_OK.length}
                tone="bg-success-soft"
              />
              <Tile
                label="Behind plan · value below target"
                value={q.BEHIND_VALUE_LOW.length}
                tone="bg-danger-soft"
              />
              <Tile
                label="On plan · value below target"
                value={q.ON_PLAN_VALUE_LOW.length}
                tone="bg-warning-soft ring-1 ring-impact"
              />
            </div>
          ),
        },
      ];
    }
    case 'exceptions':
      return paged(
        title,
        section.initiatives,
        PACK_ROWS_PER_PAGE.exceptions,
        (rows) =>
          rows.length ? (
            <InitiativeRows rows={rows} />
          ) : (
            <p>No initiative is at risk or delayed.</p>
          ),
      );
    case 'register':
      return paged(
        title,
        section.initiatives,
        PACK_ROWS_PER_PAGE.register,
        (rows) => <InitiativeRows rows={rows} />,
      );
    case 'pillar_initiatives':
      return paged(
        title,
        section.initiatives,
        PACK_ROWS_PER_PAGE.initiatives,
        (rows) => <InitiativeRows rows={rows} />,
      );
    case 'decisions':
      return [
        {
          title,
          body: section.decisions.length ? (
            <MiniTable
              headings={['Ref', 'Decision', 'From']}
              rows={section.decisions.map((d) => [
                d.reference,
                d.title,
                ROLE_LABELS[d.requiredFrom],
              ])}
            />
          ) : (
            <p>No decisions are waiting.</p>
          ),
        },
      ];
    case 'benefits': {
      const max = Math.max(
        1,
        ...section.quarters.flatMap((q) => [
          q.expected,
          q.realised ?? 0,
          q.forecast ?? 0,
        ]),
      );
      return [
        {
          title,
          body: (
            <>
              <div className="grid grid-cols-3 gap-1">
                <Tile
                  label={`Expected FY${section.year}`}
                  value={formatMoney(section.expected, section.currency)}
                />
                <Tile
                  label="Realised to date"
                  value={formatMoney(section.realisedToDate, section.currency)}
                />
                <Tile
                  label="Of YTD expectation"
                  value={formatPercent(section.realisedPctOfExpected)}
                />
              </div>
              <div
                className="mt-2 flex h-16 items-end gap-3"
                aria-hidden="true"
              >
                {section.quarters.map((q) => (
                  <div
                    key={q.label}
                    className="flex flex-1 items-end justify-center gap-0.5"
                  >
                    <span
                      className="w-2 bg-border-strong"
                      style={{ height: `${(q.expected / max) * 100}%` }}
                    />
                    <span
                      className={cn(
                        'w-2',
                        q.realised === null
                          ? 'border border-dashed border-impact'
                          : 'bg-impact',
                      )}
                      style={{
                        height: `${((q.realised ?? q.forecast ?? 0) / max) * 100}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </>
          ),
        },
      ];
    }
    case 'pillar_overview':
      return [
        {
          title,
          body: (
            <MiniTable
              headings={['Objective', 'Health', 'Execution', 'Impact']}
              rows={section.objectives.map((o) => [
                `${o.code} ${o.title}`,
                HEALTH_DISPLAY[o.health].label,
                formatPercent(o.executionScore),
                formatPercent(o.impactScore),
              ])}
            />
          ),
        },
      ];
    case 'pillar_kpis':
      return paged(title, section.kpis, PACK_ROWS_PER_PAGE.kpis, (rows) => (
        <MiniTable
          headings={['KPI', 'Objective', 'Trajectory']}
          rows={rows.map((k) => [
            `${k.code} ${k.name}`,
            k.objective,
            TRAJECTORY_DISPLAY[k.trajectory].label,
          ])}
        />
      ));
  }
}
