import { DEFAULT_RULESET_CONFIG } from '../rulesets/ruleset-config.js';
import {
  cycleDay,
  cycleDeadlines,
  workingDay,
  zonedInstant,
} from './calendar.js';
import { canPerform, owesUpdate } from './obligations.js';
import { evaluateUpdate, type UpdateLineFacts } from './update-checklist.js';

describe('calendar', () => {
  it('counts working days, skipping weekends', () => {
    // Tue 13 Oct 2026 → Day 8 is Thu 22 Oct (the wireframe's "Report issued · 22 Oct").
    expect(workingDay('2026-10-13', 1)).toBe('2026-10-13');
    expect(workingDay('2026-10-13', 5)).toBe('2026-10-19');
    expect(workingDay('2026-10-13', 8)).toBe('2026-10-22');
    // Opening on a Saturday starts on Monday.
    expect(workingDay('2026-10-10', 1)).toBe('2026-10-12');
  });

  it('closes stages at 17:00 in the organisation’s time zone', () => {
    expect(
      zonedInstant('2026-10-15', '17:00', 'Africa/Lagos').toISOString(),
    ).toBe('2026-10-15T16:00:00.000Z');
    expect(
      zonedInstant('2026-10-15', '17:00', 'Africa/Nairobi').toISOString(),
    ).toBe('2026-10-15T14:00:00.000Z');
    // London is on summer time in July (UTC+1) and not in December.
    expect(
      zonedInstant('2026-07-01', '17:00', 'Europe/London').toISOString(),
    ).toBe('2026-07-01T16:00:00.000Z');
    expect(
      zonedInstant('2026-12-01', '17:00', 'Europe/London').toISOString(),
    ).toBe('2026-12-01T17:00:00.000Z');
  });

  it('derives every deadline from the ruleset', () => {
    const deadlines = cycleDeadlines(
      '2026-10-13',
      DEFAULT_RULESET_CONFIG.reportingCycle,
      'Africa/Lagos',
    );
    expect(
      Object.fromEntries(
        Object.entries(deadlines).map(([k, v]) => [k, v.toISOString()]),
      ),
    ).toEqual({
      submissionOpensAt: '2026-10-13T07:00:00.000Z',
      submissionDueAt: '2026-10-15T16:00:00.000Z', // day 3
      strategyReviewDueAt: '2026-10-19T16:00:00.000Z', // day 5
      sponsorReviewDueAt: '2026-10-21T16:00:00.000Z', // day 7
      reportIssueDueAt: '2026-10-22T16:00:00.000Z', // day 8
    });
  });

  it('says which day of the cycle it is', () => {
    const opens = zonedInstant('2026-10-13', '08:00', 'Africa/Lagos');
    expect(
      cycleDay(new Date('2026-10-12T12:00:00Z'), opens, 8, 'Africa/Lagos'),
    ).toBe(0);
    expect(
      cycleDay(new Date('2026-10-13T12:00:00Z'), opens, 8, 'Africa/Lagos'),
    ).toBe(1);
    expect(
      cycleDay(new Date('2026-10-20T12:00:00Z'), opens, 8, 'Africa/Lagos'),
    ).toBe(6);
    // The weekend counts as the next working day.
    expect(
      cycleDay(new Date('2026-10-17T12:00:00Z'), opens, 8, 'Africa/Lagos'),
    ).toBe(5);
    expect(
      cycleDay(new Date('2026-11-30T12:00:00Z'), opens, 8, 'Africa/Lagos'),
    ).toBe(8);
  });
});

describe('obligations', () => {
  const october = {
    submissionDueAt: new Date('2026-10-10T16:00:00Z'),
    endDate: new Date('2026-10-31'),
  };

  it('owes an update when active before the deadline and started by the period’s end', () => {
    expect(
      owesUpdate(
        {
          activatedAt: new Date('2026-03-01'),
          baselineStart: new Date('2026-03-01'),
        },
        october,
      ),
    ).toBe(true);
  });

  it('owes nothing for a cycle it was not part of', () => {
    expect(
      owesUpdate(
        {
          activatedAt: new Date('2026-10-16'),
          baselineStart: new Date('2026-09-01'),
        },
        october,
      ),
    ).toBe(false);
    expect(
      owesUpdate(
        {
          activatedAt: new Date('2026-10-01'),
          baselineStart: new Date('2026-11-01'),
        },
        october,
      ),
    ).toBe(false);
  });

  it('follows the update workflow', () => {
    expect(canPerform('SUBMIT', 'DRAFT')).toBe(true);
    expect(canPerform('SUBMIT', 'CHALLENGED')).toBe(true);
    expect(canPerform('VERIFY', 'SUBMITTED')).toBe(true);
    expect(canPerform('APPROVE', 'SUBMITTED')).toBe(false);
    expect(canPerform('EDIT', 'APPROVED')).toBe(false);
    expect(canPerform('CHALLENGE', 'REVIEWED')).toBe(true);
  });
});

describe('evaluateUpdate', () => {
  // DIG-004's October form from the wireframe.
  const lines: UpdateLineFacts[] = [
    {
      milestoneId: 'bc',
      title: 'Business case approved',
      weight: 20,
      lastVerified: 100,
      claimed: 100,
      evidenceRequired: true,
      evidenceCount: 2,
    },
    {
      milestoneId: 'tech',
      title: 'Technology development',
      weight: 40,
      lastVerified: 75,
      claimed: 85,
      evidenceRequired: true,
      evidenceCount: 1,
    },
    {
      milestoneId: 'test',
      title: 'Testing and deployment',
      weight: 25,
      lastVerified: 30,
      claimed: 44,
      evidenceRequired: true,
      evidenceCount: 0,
    },
    {
      milestoneId: 'launch',
      title: 'Commercial launch',
      weight: 15,
      lastVerified: 0,
      claimed: 0,
      evidenceRequired: true,
      evidenceCount: 0,
    },
  ];
  const noCommentary = {
    progressNarrative: null,
    varianceExplanation: null,
    recoveryAction: null,
  };

  it('reproduces the form: 65% claimed vs 74% planned, −9 pp', () => {
    const result = evaluateUpdate(
      lines,
      74,
      noCommentary,
      DEFAULT_RULESET_CONFIG,
    );
    expect(result).toMatchObject({
      claimedCompletion: 65,
      plannedCompletion: 74,
      variancePp: -9,
      needsEvidence: ['test'],
    });
  });

  it('requires a variance explanation and recovery action when behind', () => {
    const result = evaluateUpdate(
      lines,
      74,
      noCommentary,
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.checklist.filter((c) => !c.ok).map((c) => c.key)).toEqual([
      'EVIDENCE',
      'NARRATIVE',
      'VARIANCE_EXPLANATION',
      'RECOVERY_ACTION',
    ]);
    expect(result.canSubmit).toBe(false);

    const written = evaluateUpdate(
      lines,
      74,
      {
        progressNarrative: 'Technology build continued; UAT started.',
        varianceExplanation: 'Vendor contract signature slipped by two weeks.',
        recoveryAction: 'Parallel UAT with a second test team.',
      },
      DEFAULT_RULESET_CONFIG,
    );
    // Evidence is reported but not yet blocking.
    expect(written.canSubmit).toBe(true);
  });

  it('needs no variance explanation when on plan', () => {
    const result = evaluateUpdate(
      lines,
      66,
      { ...noCommentary, progressNarrative: 'All on track this month.' },
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.checklist.map((c) => c.key)).not.toContain(
      'VARIANCE_EXPLANATION',
    );
    expect(result.canSubmit).toBe(true);
  });

  it('blocks submission until every milestone has a value', () => {
    const result = evaluateUpdate(
      lines.map((l) =>
        l.milestoneId === 'launch' ? { ...l, claimed: null } : l,
      ),
      60,
      { ...noCommentary, progressNarrative: 'Progress described here.' },
      DEFAULT_RULESET_CONFIG,
    );
    expect(result.checklist[0]).toMatchObject({
      ok: false,
      message: 'Enter completion for: Commercial launch',
    });
    expect(result.canSubmit).toBe(false);
  });
});
