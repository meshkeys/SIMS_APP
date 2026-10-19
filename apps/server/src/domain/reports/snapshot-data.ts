import type {
  Health,
  InitiativeStatus,
  Role,
  Trajectory,
} from '../../generated/prisma/enums.js';
import type { BenefitYear } from '../performance/benefits.js';

/**
 * What a locked cycle freezes for reporting (`ReportSnapshot.data`, kind
 * PERIOD_LOCK, version 2). Board packs are assembled from this alone, so a
 * pack always matches what management approved, however the live data has
 * moved since. Version 1 snapshots (initiatives only) cannot build packs.
 */
export interface SnapshotDataV2 {
  version: 2;
  period: { id: string; name: string; startDate: string; endDate: string };
  lockedAt: string;
  plan: { name: string };
  thresholds: { lowValueThresholdPct: number };
  totals: {
    initiatives: number;
    byHealth: Record<Health, number>;
  };
  initiatives: SnapshotInitiative[];
  /** The whole strategy tree with its rolled-up scores. */
  elements: SnapshotElement[];
  kpis: SnapshotKpi[];
  /** Decisions still open when the cycle locked. */
  decisions: SnapshotDecision[];
  escalations: { byLevel: { level: number; name: string; open: number }[] };
  benefits: { currency: string; year: number } & Pick<
    BenefitYear,
    'expected' | 'expectedToDate' | 'realisedToDate' | 'realisedPctOfExpected'
  > & {
      quarters: {
        label: string;
        expected: number;
        realised: number | null;
        forecast: number | null;
      }[];
    };
}

export interface SnapshotInitiative {
  initiativeId: string;
  code: string;
  title: string;
  status: InitiativeStatus;
  isSensitive: boolean;
  /** Primary objective, and the top-level element (pillar) above it. */
  homeElementId: string | null;
  pillarId: string | null;
  owner: string | null;
  health: Health;
  calculatedHealth: Health;
  overridden: boolean;
  verifiedProgress: number;
  plannedProgress: number;
  impactScore: number | null;
  impactSummary: string | null;
}

export interface SnapshotElement {
  id: string;
  parentId: string | null;
  code: string;
  title: string;
  health: Health;
  executionScore: number | null;
  impactScore: number | null;
}

export interface SnapshotKpi {
  code: string;
  name: string;
  unit: string;
  elementId: string;
  baseline: number | null;
  target: number | null;
  latestValue: number | null;
  trajectory: Trajectory;
}

export interface SnapshotDecision {
  reference: string;
  title: string;
  requiredFrom: Role;
  initiativeId: string | null;
  dueDate: string | null;
}

/** True for snapshots that hold everything a pack needs. */
export function isPackReady(data: unknown): data is SnapshotDataV2 {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { version?: unknown }).version === 2
  );
}
