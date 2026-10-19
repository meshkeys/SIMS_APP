import { DEFAULT_RULESET_CONFIG } from '../rulesets/ruleset-config.js';
import {
  autoSteps,
  daysToNextLevel,
  deciderFor,
  isDecider,
  startLevel,
} from './escalation-ladder.js';

const ladder = DEFAULT_RULESET_CONFIG.escalation; // 0 / 7 / 14 / manual, critical → 3
const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 9));
const raised = day(0);

describe('startLevel', () => {
  it('starts critical items at the shortcut level, others at level 1', () => {
    expect(startLevel('CRITICAL', ladder)).toEqual({
      level: 3,
      reason: 'CRITICAL_SEVERITY',
    });
    expect(startLevel('HIGH', ladder)).toEqual({ level: 1, reason: 'RAISED' });
    expect(
      startLevel('CRITICAL', { ...ladder, criticalStartsAtLevel: null }),
    ).toEqual({ level: 1, reason: 'RAISED' });
  });
});

describe('autoSteps', () => {
  it('owes every level whose time has come, dated when it fell due', () => {
    expect(
      autoSteps({ level: 1, levelChangedAt: raised }, ladder, day(16)),
    ).toEqual([
      { level: 2, dueAt: day(7) },
      { level: 3, dueAt: day(14) },
    ]);
  });

  it('owes nothing before the next deadline, or once it has been moved up', () => {
    expect(
      autoSteps({ level: 1, levelChangedAt: raised }, ladder, day(6)),
    ).toEqual([]);
    expect(
      autoSteps({ level: 3, levelChangedAt: raised }, ladder, day(40)),
    ).toEqual([]);
  });

  it('never climbs to a level reached only by decision', () => {
    // Level 4 (Board) is manual: 100 days later the item still waits at 3.
    expect(
      autoSteps({ level: 2, levelChangedAt: raised }, ladder, day(100)).map(
        (s) => s.level,
      ),
    ).toEqual([3]);
  });

  it('gives an item moved down by decision a fresh window', () => {
    // De-escalated to level 1 on day 10: level 2 is owed on day 17, not at once.
    const moved = { level: 1, levelChangedAt: day(10) };
    expect(autoSteps(moved, ladder, day(16))).toEqual([]);
    expect(autoSteps(moved, ladder, day(17))).toEqual([
      { level: 2, dueAt: day(17) },
    ]);
  });
});

describe('daysToNextLevel', () => {
  it('counts whole days to the next automatic move', () => {
    expect(
      daysToNextLevel({ level: 1, levelChangedAt: raised }, ladder, day(3)),
    ).toBe(4);
    expect(
      daysToNextLevel({ level: 2, levelChangedAt: day(7) }, ladder, day(13)),
    ).toBe(1);
    expect(
      daysToNextLevel({ level: 3, levelChangedAt: raised }, ladder, day(20)),
    ).toBeNull();
  });
});

describe('deciderFor and isDecider', () => {
  const initiative = { ownerId: 'owner', sponsorId: 'sponsor' };
  const holders = (role: string) => (role === 'CEO' ? ['ceo'] : ['a', 'b']);
  const [owner, sponsor, exco, board] = ladder.levels;

  it('names the initiative’s people or the role', () => {
    expect(deciderFor(owner!, initiative, holders)).toEqual({
      decisionFromId: 'owner',
      decisionFromRole: null,
    });
    expect(deciderFor(sponsor!, initiative, holders).decisionFromId).toBe(
      'sponsor',
    );
    expect(deciderFor(exco!, initiative, holders)).toEqual({
      decisionFromId: 'ceo',
      decisionFromRole: 'CEO',
    });
    // Two Board members: the role decides, nobody is named.
    expect(deciderFor(board!, initiative, holders)).toEqual({
      decisionFromId: null,
      decisionFromRole: 'BOARD',
    });
  });

  it('sends portfolio items at owner or sponsor levels to the Strategy Office', () => {
    expect(deciderFor(owner!, null, holders)).toEqual({
      decisionFromId: null,
      decisionFromRole: 'STRATEGY_OFFICE',
    });
  });

  it('recognises the named person or anyone holding the role', () => {
    const ceoLevel = {
      decisionFromId: 'ceo',
      decisionFromRole: 'CEO' as const,
    };
    expect(isDecider({ membershipId: 'ceo', roles: [] }, ceoLevel)).toBe(true);
    expect(
      isDecider({ membershipId: 'deputy', roles: ['CEO'] }, ceoLevel),
    ).toBe(true);
    expect(
      isDecider({ membershipId: 'x', roles: ['STRATEGY_OFFICE'] }, ceoLevel),
    ).toBe(false);
    expect(
      isDecider(
        { membershipId: 'sponsor', roles: [] },
        { decisionFromId: 'sponsor', decisionFromRole: null },
      ),
    ).toBe(true);
  });
});
