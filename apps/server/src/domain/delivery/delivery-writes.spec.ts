import { findDependencyCycle } from './dependencies.js';
import { activationGaps, canTransition, isBaselineLocked, transitionNeedsReason } from './lifecycle.js';
import {
  canChangeMilestonePlan,
  deniedFields,
  relationTo,
  suggestInitiativeCode,
} from './permissions.js';

describe('lifecycle', () => {
  it('follows the pipeline into delivery', () => {
    expect(canTransition('DRAFT', 'PROPOSED')).toBe(true);
    expect(canTransition('PROPOSED', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'ON_HOLD')).toBe(true);
    expect(canTransition('ON_HOLD', 'ACTIVE')).toBe(true);
    expect(canTransition('ACTIVE', 'CLOSED')).toBe(true);
  });

  it('refuses skips and anything after the end', () => {
    expect(canTransition('PROPOSED', 'ACTIVE')).toBe(false);
    expect(canTransition('CLOSED', 'ACTIVE')).toBe(false);
    expect(canTransition('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('asks for a reason when delivery stops or pauses', () => {
    expect(['ON_HOLD', 'CANCELLED', 'CLOSED'].every((s) => transitionNeedsReason(s as never))).toBe(true);
    expect(transitionNeedsReason('ACTIVE')).toBe(false);
  });

  it('locks the baseline once delivery starts', () => {
    expect(isBaselineLocked('APPROVED')).toBe(false);
    expect(isBaselineLocked('ACTIVE')).toBe(true);
  });

  it('lists what is missing before activation', () => {
    expect(
      activationGaps({
        ownerId: null,
        sponsorId: 's',
        baselineStart: new Date(),
        baselineEnd: null,
        hasPrimaryObjective: false,
        weightedMilestones: 0,
      }),
    ).toEqual([
      'Assign an initiative owner',
      'Set baseline start and end dates',
      'Link it to the objective it primarily delivers',
      'Add at least one milestone with a weight',
    ]);
  });
});

describe('permissions', () => {
  const initiative = { ownerId: 'owner', sponsorId: 'sponsor' };

  it('works out the caller’s relation', () => {
    expect(relationTo({ membershipId: 'x', roles: ['STRATEGY_OFFICE'] }, initiative)).toBe('OFFICE');
    expect(relationTo({ membershipId: 'sponsor', roles: ['EXECUTIVE_SPONSOR'] }, initiative)).toBe('SPONSOR');
    expect(relationTo({ membershipId: 'owner', roles: ['INITIATIVE_OWNER'] }, initiative)).toBe('OWNER');
    expect(relationTo({ membershipId: 'x', roles: ['EXECUTIVE_SPONSOR'] }, initiative)).toBe('NONE');
  });

  it('lets owners edit the narrative but not accountability or shape', () => {
    expect(deniedFields('OWNER', 'ACTIVE', ['description', 'forecastEnd'])).toEqual([]);
    expect(deniedFields('OWNER', 'ACTIVE', ['sponsorId', 'priority']).map((d) => d.field)).toEqual([
      'sponsorId',
      'priority',
    ]);
  });

  it('locks the baseline for everyone but the Strategy Office once active', () => {
    expect(deniedFields('SPONSOR', 'PROPOSED', ['baselineEnd'])).toEqual([]);
    expect(deniedFields('SPONSOR', 'ACTIVE', ['baselineEnd'])).toEqual([
      { field: 'baselineEnd', reason: 'BASELINE_LOCKED' },
    ]);
    expect(deniedFields('OFFICE', 'ACTIVE', ['baselineEnd'])).toEqual([]);
  });

  it('applies the same lock to the milestone plan', () => {
    expect(canChangeMilestonePlan('OWNER', 'APPROVED')).toBe(true);
    expect(canChangeMilestonePlan('OWNER', 'ACTIVE')).toBe(false);
    expect(canChangeMilestonePlan('OFFICE', 'ACTIVE')).toBe(true);
    expect(canChangeMilestonePlan('NONE', 'DRAFT')).toBe(false);
  });

  it('suggests codes from the pillar name', () => {
    expect(suggestInitiativeCode('Digital Transformation', ['DIG-004', 'DIG-015', 'REV-002'])).toBe('DIG-016');
    expect(suggestInitiativeCode('Customer Experience', [])).toBe('CUS-001');
    expect(suggestInitiativeCode(null, [])).toBe('INI-001');
    expect(suggestInitiativeCode('5G', [])).toBe('GXX-001');
  });
});

describe('findDependencyCycle', () => {
  const edges = [
    { fromId: 'DIG-007', toId: 'DIG-011' },
    { fromId: 'DIG-004', toId: 'DIG-011' },
    { fromId: 'REV-005', toId: 'DIG-004' },
  ];

  it('allows dependencies that do not loop', () => {
    expect(findDependencyCycle(edges, 'REV-005', 'DIG-011')).toBeNull();
  });

  it('finds a direct loop', () => {
    expect(findDependencyCycle(edges, 'DIG-011', 'DIG-007')).toEqual(['DIG-011', 'DIG-007', 'DIG-011']);
  });

  it('finds a loop through a chain', () => {
    expect(findDependencyCycle(edges, 'DIG-011', 'REV-005')).toEqual(['DIG-011', 'REV-005', 'DIG-004', 'DIG-011']);
  });

  it('treats depending on itself as a loop', () => {
    expect(findDependencyCycle([], 'A', 'A')).toEqual(['A', 'A']);
  });
});
