import {
  applyChanges,
  type BaselineState,
  isEmptyChange,
} from './change-requests.js';
import { decideRight, isOpen, nextReference } from './decisions.js';
import { heatmap, severityFor } from './risks.js';

describe('risks', () => {
  it('scores severity from likelihood × impact', () => {
    expect(severityFor(3, 4)).toBe('HIGH'); // SEC approval risk
    expect(severityFor(3, 3)).toBe('MEDIUM'); // low adoption risk
    expect(severityFor(5, 3)).toBe('CRITICAL');
    expect(severityFor(1, 4)).toBe('LOW');
  });

  it('lays out the heatmap with high impact at the top', () => {
    const grid = heatmap([
      { likelihood: 5, impact: 5 },
      { likelihood: 1, impact: 1 },
      { likelihood: 3, impact: 4 },
      { likelihood: 3, impact: 4 },
      { likelihood: null, impact: null },
    ]);
    expect(grid[0][4]).toBe(1); // impact 5, likelihood 5
    expect(grid[1][2]).toBe(2); // impact 4, likelihood 3
    expect(grid[4][0]).toBe(1); // impact 1, likelihood 1
    expect(grid.flat().reduce((a, b) => a + b)).toBe(4);
  });
});

describe('decisions', () => {
  const ceoDecision = {
    requiredFrom: 'CEO' as const,
    requiredFromId: 'ceo',
    requestedById: 'owner',
    isChangeRequest: true,
  };

  it('lets the named approver decide a change request', () => {
    expect(
      decideRight({ membershipId: 'ceo', roles: ['CEO'] }, ceoDecision),
    ).toBe('DECIDER');
  });

  it('never lets the requester approve their own change', () => {
    expect(
      decideRight(
        { membershipId: 'owner', roles: ['CEO'] },
        { ...ceoDecision, requiredFromId: null },
      ),
    ).toBeNull();
  });

  it('keeps the Strategy Office out of change requests, but lets it record other decisions', () => {
    expect(
      decideRight(
        { membershipId: 'so', roles: ['STRATEGY_OFFICE'] },
        ceoDecision,
      ),
    ).toBeNull();
    expect(
      decideRight(
        { membershipId: 'so', roles: ['STRATEGY_OFFICE'] },
        { ...ceoDecision, isChangeRequest: false },
      ),
    ).toBe('ON_BEHALF');
  });

  it('lets any holder of the role decide when nobody is named', () => {
    expect(
      decideRight(
        { membershipId: 'x', roles: ['BOARD'] },
        {
          requiredFrom: 'BOARD',
          requiredFromId: null,
          requestedById: null,
          isChangeRequest: false,
        },
      ),
    ).toBe('DECIDER');
  });

  it('reopens deferred decisions when their date arrives', () => {
    const today = new Date('2026-11-15');
    expect(isOpen({ outcome: 'PENDING', deferredUntil: null }, today)).toBe(
      true,
    );
    expect(
      isOpen(
        { outcome: 'DEFERRED', deferredUntil: new Date('2026-11-15') },
        today,
      ),
    ).toBe(true);
    expect(
      isOpen(
        { outcome: 'DEFERRED', deferredUntil: new Date('2026-11-16') },
        today,
      ),
    ).toBe(false);
    expect(isOpen({ outcome: 'APPROVED', deferredUntil: null }, today)).toBe(
      false,
    );
  });

  it('continues reference series', () => {
    expect(nextReference('CR', ['CR-0142', 'CR-0139', 'GOV-031'])).toBe(
      'CR-0143',
    );
    expect(nextReference('DEC', [])).toBe('DEC-0001');
  });
});

describe('change requests', () => {
  const current: BaselineState = {
    baselineStart: '2026-01-05',
    baselineEnd: '2026-10-15',
    baselineBudget: 500,
    scope: null,
    milestones: [
      {
        id: 'a',
        title: 'Process redesigned',
        weight: 20,
        isCritical: false,
        baselineStartDate: '2026-01-05',
        baselineDate: '2026-03-31',
        hasProgress: true,
      },
      {
        id: 'b',
        title: 'Go-live',
        weight: 15,
        isCritical: true,
        baselineStartDate: '2026-09-01',
        baselineDate: '2026-10-15',
        hasProgress: false,
      },
    ],
  };

  it('applies a six-week extension', () => {
    const { result, problems } = applyChanges(current, {
      baselineEnd: '2026-11-26',
      milestones: [{ milestoneId: 'b', baselineDate: '2026-11-26' }],
    });
    expect(problems).toEqual([]);
    expect(result.baselineEnd).toBe('2026-11-26');
    expect(result.milestones.find((m) => m.id === 'b')?.baselineDate).toBe(
      '2026-11-26',
    );
  });

  it('adds and removes milestones, keeping those with progress', () => {
    const { result, problems } = applyChanges(current, {
      addMilestones: [
        { title: 'Pilot branch', weight: 10, baselineDate: '2026-11-15' },
      ],
      removeMilestoneIds: ['a', 'b'],
    });
    expect(problems).toEqual([
      {
        path: 'removeMilestoneIds.0',
        message: '"Process redesigned" has progress and is kept for the record',
      },
    ]);
    expect(result.milestones.map((m) => m.title)).toEqual([
      'Process redesigned',
      'Pilot branch',
    ]);
  });

  it('catches incoherent results', () => {
    const { problems } = applyChanges(current, {
      baselineEnd: '2025-12-31',
      milestones: [
        { milestoneId: 'b', baselineDate: '2026-08-01' },
        { milestoneId: 'zzz', weight: 5 },
      ],
    });
    expect(problems.map((p) => p.path)).toEqual([
      'milestones.1.milestoneId',
      'baselineEnd',
      'milestones.b',
    ]);
  });

  it('requires at least one change', () => {
    expect(isEmptyChange({})).toBe(true);
    expect(isEmptyChange({ baselineBudget: 600 })).toBe(false);
  });
});
