import { describeRulesetChanges } from '@sims/contracts';
import { DEFAULT_RULESET_CONFIG } from './ruleset-config.js';

const base = DEFAULT_RULESET_CONFIG;

describe('describeRulesetChanges', () => {
  it('says nothing when nothing changed', () => {
    expect(describeRulesetChanges(base, structuredClone(base))).toEqual([]);
  });

  it('lists each changed setting in plain words', () => {
    const after = structuredClone(base);
    after.rag.greenMaxPpBehind = 6;
    after.healthModifiers.missedUpdateMakesUnknown = false;
    after.overrides.expiryDays = 45;
    after.overrides.minimumRole = 'CEO';
    after.impact.lowValueThresholdPct = 40;

    expect(describeRulesetChanges(base, after)).toEqual([
      'Green up to: 5 pp → 6 pp',
      'Missed update makes health Unknown: on → off',
      'Overrides expire after: 30 days → 45 days',
      'Who can override: Executive sponsor or above → MD/CEO or above',
      'Low-value threshold: 50% → 40%',
    ]);
  });

  it('describes ladder and cycle changes as a whole', () => {
    const after = structuredClone(base);
    after.escalation.levels[1]!.autoEscalateAfterDays = 10;
    after.reportingCycle.reminderDaysBeforeDue = [];
    const lines = describeRulesetChanges(base, after);
    expect(lines[0]).toMatch(
      /^Escalation ladder: .*L2 Executive sponsor \(Initiative sponsor, after 7 days\).* → .*L2 Executive sponsor \(Initiative sponsor, after 10 days\)/,
    );
    expect(lines[1]).toBe('Reminders (working days before the deadline): 2, 0 → none');
  });
});
