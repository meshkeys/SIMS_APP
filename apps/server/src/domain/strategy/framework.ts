import { MAX_FRAMEWORK_LEVELS } from '@sims/contracts';
import type { FrameworkTemplate } from '../../generated/prisma/enums.js';

/** Hard ceiling on strategy levels (part of the API contract); mirrored by a CHECK constraint. */
export { MAX_FRAMEWORK_LEVELS };

export interface LevelDefinition {
  label: string;
  pluralLabel: string;
  codePrefix: string;
  allowsKpis: boolean;
}

export interface FrameworkTemplateDefinition {
  name: string;
  description: string;
  levels: LevelDefinition[];
  /** Top-level elements created with the plan (e.g. the four BSC perspectives). */
  starterElements: string[];
}

/**
 * Starting points offered at onboarding. Every one is fully editable
 * afterwards: rename, add or remove levels and elements.
 */
export const FRAMEWORK_TEMPLATES: Record<
  FrameworkTemplate,
  FrameworkTemplateDefinition
> = {
  STRATEGIC_PILLARS: {
    name: 'Strategic pillars',
    description:
      'Pillars, objectives and KPIs. Common in banks and corporates.',
    levels: [
      {
        label: 'Strategic pillar',
        pluralLabel: 'Strategic pillars',
        codePrefix: 'P',
        allowsKpis: false,
      },
      {
        label: 'Strategic objective',
        pluralLabel: 'Strategic objectives',
        codePrefix: 'O',
        allowsKpis: true,
      },
    ],
    starterElements: [],
  },
  BALANCED_SCORECARD: {
    name: 'Balanced Scorecard',
    description: 'Financial, customer, process and learning perspectives.',
    levels: [
      {
        label: 'Perspective',
        pluralLabel: 'Perspectives',
        codePrefix: 'P',
        allowsKpis: false,
      },
      {
        label: 'Strategic objective',
        pluralLabel: 'Strategic objectives',
        codePrefix: 'O',
        allowsKpis: true,
      },
    ],
    starterElements: [
      'Financial',
      'Customer',
      'Internal process',
      'Learning and growth',
    ],
  },
  OKR: {
    name: 'OKRs',
    description: 'Objectives and key results. Suits fast-moving teams.',
    levels: [
      {
        label: 'Objective',
        pluralLabel: 'Objectives',
        codePrefix: 'O',
        allowsKpis: true,
      },
    ],
    starterElements: [],
  },
  PUBLIC_SECTOR_RESULTS: {
    name: 'Public sector results',
    description: 'Goals, outcomes and programmes for ministries and agencies.',
    levels: [
      {
        label: 'National goal',
        pluralLabel: 'National goals',
        codePrefix: 'G',
        allowsKpis: false,
      },
      {
        label: 'Sector outcome',
        pluralLabel: 'Sector outcomes',
        codePrefix: 'SO',
        allowsKpis: true,
      },
      {
        label: 'Programme',
        pluralLabel: 'Programmes',
        codePrefix: 'PR',
        allowsKpis: true,
      },
    ],
    starterElements: [],
  },
  CUSTOM: {
    name: 'Start from scratch',
    description: 'Name every level yourself.',
    levels: [
      {
        label: 'Goal',
        pluralLabel: 'Goals',
        codePrefix: 'G',
        allowsKpis: true,
      },
    ],
    starterElements: [],
  },
};

// ---------------------------------------------------------------------------
// Changing a plan's levels
// ---------------------------------------------------------------------------

export interface ExistingLevel {
  id: string;
  depth: number;
  label: string;
  /** Strategy elements at this level. */
  elementCount: number;
  /** KPIs attached to elements at this level. */
  kpiCount: number;
}

export interface DesiredLevel extends LevelDefinition {
  /** Present for levels that already exist; absent for new ones. */
  id?: string;
}

export interface LevelChangeProblem {
  path: string;
  code:
    | 'LEVEL_IN_USE'
    | 'UNKNOWN_LEVEL'
    | 'DUPLICATE_LEVEL'
    | 'DUPLICATE_LABEL'
    | 'DUPLICATE_PREFIX';
  message: string;
}

export interface LevelChangePlan {
  problems: LevelChangeProblem[];
  /** Levels to delete (removed, or empty levels moving depth — recreated with the same id). */
  deleteIds: string[];
  /** Existing levels updated in place (same depth). */
  updates: { id: string; depth: number; definition: LevelDefinition }[];
  /** Levels to insert (new, or moved empty levels keeping their id). */
  creates: { id?: string; depth: number; definition: LevelDefinition }[];
}

const definitionOf = ({
  label,
  pluralLabel,
  codePrefix,
  allowsKpis,
}: LevelDefinition) => ({
  label,
  pluralLabel,
  codePrefix,
  allowsKpis,
});

/**
 * Works out how to turn the current levels into the desired ordered list,
 * refusing anything that would corrupt the strategy tree:
 * - a level that holds elements cannot be removed or change depth
 *   (its elements' parents are one level up);
 * - KPIs cannot be switched off on a level that already has KPIs.
 * Empty levels can be added, removed and reordered freely.
 */
export function planLevelChanges(
  existing: readonly ExistingLevel[],
  desired: readonly DesiredLevel[],
): LevelChangePlan {
  const plan: LevelChangePlan = {
    problems: [],
    deleteIds: [],
    updates: [],
    creates: [],
  };
  const byId = new Map(existing.map((level) => [level.id, level]));
  const seenIds = new Set<string>();
  const seenLabels = new Map<string, number>();
  const seenPrefixes = new Map<string, number>();

  desired.forEach((level, index) => {
    const path = `levels.${index}`;
    const label = level.label.trim().toLowerCase();
    const prefix = level.codePrefix.toUpperCase();
    if (seenLabels.has(label)) {
      plan.problems.push({
        path: `${path}.label`,
        code: 'DUPLICATE_LABEL',
        message: 'Each level needs a different name',
      });
    }
    seenLabels.set(label, index);
    if (seenPrefixes.has(prefix)) {
      plan.problems.push({
        path: `${path}.codePrefix`,
        code: 'DUPLICATE_PREFIX',
        message: 'Each level needs a different code prefix',
      });
    }
    seenPrefixes.set(prefix, index);

    const depth = index + 1;
    if (!level.id) {
      plan.creates.push({ depth, definition: definitionOf(level) });
      return;
    }
    if (seenIds.has(level.id)) {
      plan.problems.push({
        path,
        code: 'DUPLICATE_LEVEL',
        message: 'This level is listed twice',
      });
      return;
    }
    seenIds.add(level.id);

    const current = byId.get(level.id);
    if (!current) {
      plan.problems.push({
        path,
        code: 'UNKNOWN_LEVEL',
        message: 'This level does not belong to the plan',
      });
      return;
    }
    if (!level.allowsKpis && current.kpiCount > 0) {
      plan.problems.push({
        path: `${path}.allowsKpis`,
        code: 'LEVEL_IN_USE',
        message: `${current.label} already has ${current.kpiCount} KPI(s); move or delete them first`,
      });
    }
    if (current.depth === depth) {
      plan.updates.push({
        id: current.id,
        depth,
        definition: definitionOf(level),
      });
    } else if (current.elementCount > 0) {
      plan.problems.push({
        path,
        code: 'LEVEL_IN_USE',
        message: `${current.label} has ${current.elementCount} item(s) and cannot change position`,
      });
    } else {
      plan.deleteIds.push(current.id);
      plan.creates.push({
        id: current.id,
        depth,
        definition: definitionOf(level),
      });
    }
  });

  for (const level of existing) {
    if (seenIds.has(level.id)) continue;
    if (level.elementCount > 0) {
      plan.problems.push({
        path: 'levels',
        code: 'LEVEL_IN_USE',
        message: `${level.label} has ${level.elementCount} item(s) and cannot be removed`,
      });
    } else {
      plan.deleteIds.push(level.id);
    }
  }

  return plan;
}
