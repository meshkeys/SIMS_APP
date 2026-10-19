import {
  type PackContent,
  type PackDefinition,
  type PackInitiativeRow,
  type PackSection,
  REPORT_SECTIONS,
  REPORT_TEMPLATES,
  type ReportSectionKey,
} from '@sims/contracts';
import { valueQuadrant } from '../strategy/rollup.js';
import type { SnapshotDataV2, SnapshotInitiative } from './snapshot-data.js';

/** Rows per printed page, by kind of list. */
const ROWS_PER_PAGE = {
  exceptions: 8,
  register: 20,
  kpis: 12,
  initiatives: 12,
};
const pagesFor = (rows: number, perPage: number) =>
  Math.max(1, Math.ceil(rows / perPage));

const HEALTH_ORDER = { RED: 0, AMBER: 1, UNKNOWN: 2, GREEN: 3 } as const;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "September 2026" ending 2026-09-30 → "Q3 2026"; null if not a quarter's last month. */
export function quarterOf(periodEnd: string): string | null {
  const month = Number(periodEnd.slice(5, 7));
  return month % 3 === 0 ? `Q${month / 3} ${periodEnd.slice(0, 4)}` : null;
}

/** The title a pack gets when none is given. */
export function defaultPackTitle(
  template: PackDefinition['template'],
  data: Pick<SnapshotDataV2, 'period'>,
  pillarTitle: string | null,
): string {
  const quarter = quarterOf(data.period.endDate);
  if (template === 'QUARTERLY_BOARD')
    return `${quarter ?? data.period.name} Board pack`;
  if (template === 'PILLAR_DEEP_DIVE')
    return `${pillarTitle ?? 'Pillar'} deep dive, ${data.period.name}`;
  return `${data.period.name} management report`;
}

/** "1.0" → "1.1"; none yet → "1.0". */
export function nextVersion(existing: readonly string[]): string {
  const minors = existing
    .map((v) => /^1\.(\d+)$/.exec(v)?.[1])
    .filter((m): m is string => m !== undefined)
    .map(Number);
  return minors.length ? `1.${Math.max(...minors) + 1}` : '1.0';
}

/**
 * Builds a pack's content from a locked snapshot: the builder's preview
 * shows it and the renderers print it, so both always agree.
 *
 * Audience rule: for the Board, sensitive initiatives are summarised at
 * pillar level, so they count in every total and pillar row but are left
 * out of named lists (exceptions, matrix, register). EXCO sees them in full.
 */
export function assemblePack(
  data: SnapshotDataV2,
  definition: Pick<
    PackDefinition,
    'template' | 'audience' | 'sections' | 'scopeElementId' | 'narrative'
  >,
  context: { organisation: string; title: string },
): PackContent {
  const hideSensitive = definition.audience === 'BOARD';
  const named = data.initiatives.filter(
    (i) => !(hideSensitive && i.isSensitive),
  );
  const sensitiveSummarised = data.initiatives.length - named.length;
  const elementById = new Map(data.elements.map((e) => [e.id, e]));
  const pillars = data.elements.filter((e) => e.parentId === null);
  const pillarTitle = (id: string | null) =>
    (id && elementById.get(id)?.title) ?? null;
  const row = (i: SnapshotInitiative): PackInitiativeRow => ({
    code: i.code,
    title: i.title,
    pillar: pillarTitle(i.pillarId),
    owner: i.owner,
    health: i.health,
    verifiedProgress: i.verifiedProgress,
    plannedProgress: i.plannedProgress,
    gapPp: round1(i.verifiedProgress - i.plannedProgress),
    impactScore: i.impactScore,
    impactSummary: i.impactSummary,
  });
  const pillarRow = (pillar: (typeof pillars)[number]) => {
    const under = data.initiatives.filter((i) => i.pillarId === pillar.id);
    return {
      code: pillar.code,
      title: pillar.title,
      health: pillar.health,
      executionScore: pillar.executionScore,
      impactScore: pillar.impactScore,
      initiatives: under.length,
      atRisk: under.filter((i) => i.health === 'AMBER').length,
      delayed: under.filter((i) => i.health === 'RED').length,
    };
  };
  const scope = definition.scopeElementId
    ? elementById.get(definition.scopeElementId)
    : undefined;
  const initiativeCode = (id: string | null) =>
    data.initiatives.find((i) => i.initiativeId === id)?.code ?? null;
  const sensitiveIds = new Set(
    data.initiatives.filter((i) => i.isSensitive).map((i) => i.initiativeId),
  );

  const build = (key: ReportSectionKey): PackSection => {
    const title =
      key === 'decisions' && definition.audience === 'BOARD'
        ? 'Decisions required from the Board'
        : REPORT_SECTIONS[key];
    switch (key) {
      case 'executive_summary': {
        const { byHealth } = data.totals;
        return {
          key,
          title,
          pages: 1,
          narrative: definition.narrative,
          headline: {
            initiatives: data.totals.initiatives,
            onTrack: byHealth.GREEN,
            atRisk: byHealth.AMBER,
            delayed: byHealth.RED,
            unknown: byHealth.UNKNOWN,
            kpisOnTrajectory: data.kpis.filter(
              (k) => k.trajectory === 'ON_TRAJECTORY',
            ).length,
            kpisTotal: data.kpis.length,
            benefitsRealised: data.benefits.realisedToDate,
            benefitsRealisedPct: data.benefits.realisedPctOfExpected,
            openEscalations: data.escalations.byLevel.reduce(
              (sum, l) => sum + l.open,
              0,
            ),
            decisionsPending: data.decisions.length,
          },
        };
      }
      case 'pillar_performance':
        return { key, title, pages: 1, pillars: pillars.map(pillarRow) };
      case 'delivery_vs_value': {
        const threshold = data.thresholds.lowValueThresholdPct;
        const quadrants = {
          ON_PLAN_VALUE_OK: [] as string[],
          ON_PLAN_VALUE_LOW: [] as string[],
          BEHIND_VALUE_OK: [] as string[],
          BEHIND_VALUE_LOW: [] as string[],
          NOT_MEASURABLE: [] as string[],
        };
        for (const i of named.filter((i) => i.status === 'ACTIVE'))
          quadrants[valueQuadrant(i.health, i.impactScore, threshold)].push(
            i.code,
          );
        return { key, title, pages: 1, thresholdPct: threshold, quadrants };
      }
      case 'exceptions': {
        const exceptions = named
          .filter((i) => i.health !== 'GREEN')
          .sort(
            (a, b) =>
              HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] ||
              a.verifiedProgress -
                a.plannedProgress -
                (b.verifiedProgress - b.plannedProgress) ||
              a.code.localeCompare(b.code),
          )
          .map(row);
        return {
          key,
          title,
          pages: pagesFor(exceptions.length, ROWS_PER_PAGE.exceptions),
          initiatives: exceptions,
        };
      }
      case 'decisions': {
        const decisions = data.decisions
          .filter(
            (d) =>
              !(
                hideSensitive &&
                d.initiativeId &&
                sensitiveIds.has(d.initiativeId)
              ) &&
              (!scope ||
                data.initiatives.find((i) => i.initiativeId === d.initiativeId)
                  ?.pillarId === scope.id),
          )
          // The Board's own decisions first.
          .sort(
            (a, b) =>
              Number(b.requiredFrom === 'BOARD') -
              Number(a.requiredFrom === 'BOARD'),
          )
          .map((d) => ({
            reference: d.reference,
            title: d.title,
            requiredFrom: d.requiredFrom,
            initiative: initiativeCode(d.initiativeId),
            dueDate: d.dueDate,
          }));
        return { key, title, pages: 1, decisions };
      }
      case 'benefits':
        return {
          key,
          title,
          pages: 1,
          currency: data.benefits.currency,
          year: data.benefits.year,
          expected: data.benefits.expected,
          expectedToDate: data.benefits.expectedToDate,
          realisedToDate: data.benefits.realisedToDate,
          realisedPctOfExpected: data.benefits.realisedPctOfExpected,
          quarters: data.benefits.quarters,
        };
      case 'register': {
        const rows = named.map(row);
        return {
          key,
          title,
          pages: pagesFor(rows.length, ROWS_PER_PAGE.register),
          initiatives: rows,
        };
      }
      case 'pillar_overview': {
        const pillar = scope ?? pillars[0]!;
        return {
          key,
          title: `${pillar.title}: overview and objectives`,
          pages: 1,
          pillar: pillarRow(pillar),
          objectives: data.elements
            .filter((e) => e.parentId === pillar.id)
            .map((e) => ({
              code: e.code,
              title: e.title,
              health: e.health,
              executionScore: e.executionScore,
              impactScore: e.impactScore,
            })),
        };
      }
      case 'pillar_kpis': {
        const pillarId = scope?.id ?? pillars[0]?.id;
        const inPillar = (elementId: string) => {
          for (let node: string | null = elementId; node;) {
            if (node === pillarId) return true;
            node = elementById.get(node)?.parentId ?? null;
          }
          return false;
        };
        const kpis = data.kpis
          .filter((k) => inPillar(k.elementId))
          .map((k) => ({
            code: k.code,
            name: k.name,
            unit: k.unit,
            objective: elementById.get(k.elementId)?.code ?? '',
            baseline: k.baseline,
            target: k.target,
            latestValue: k.latestValue,
            trajectory: k.trajectory,
          }));
        return {
          key,
          title,
          pages: pagesFor(kpis.length, ROWS_PER_PAGE.kpis),
          kpis,
        };
      }
      case 'pillar_initiatives': {
        const pillarId = scope?.id ?? pillars[0]?.id;
        const rows = named.filter((i) => i.pillarId === pillarId).map(row);
        return {
          key,
          title,
          pages: pagesFor(rows.length, ROWS_PER_PAGE.initiatives),
          initiatives: rows,
        };
      }
    }
  };

  // Sections print in the template's order, whatever order they were chosen in.
  const order = REPORT_TEMPLATES[definition.template].sections.map(
    (s) => s.key,
  );
  const sections = [...definition.sections]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map(build);

  return {
    title: context.title,
    template: definition.template,
    audience: definition.audience,
    period: data.period.name,
    lockedAt: data.lockedAt,
    organisation: context.organisation,
    pageCount: 1 + sections.reduce((sum, s) => sum + s.pages, 0),
    sensitiveSummarised: hideSensitive ? sensitiveSummarised : 0,
    sections,
  };
}
