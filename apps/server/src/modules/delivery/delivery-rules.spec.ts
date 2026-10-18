import { stableStringify } from '../../common/data/stable-json.js';
import { canOverrideHealth } from '../../domain/access/override-permission.js';
import { describeActivity } from './activity.js';

describe('canOverrideHealth (minimum role: Executive Sponsor)', () => {
  const initiative = { ownerId: 'owner', sponsorId: 'sponsor' };
  const can = (
    membershipId: string,
    roles: Parameters<typeof canOverrideHealth>[0]['roles'],
  ) =>
    canOverrideHealth({ membershipId, roles }, initiative, 'EXECUTIVE_SPONSOR');

  it('lets the initiative’s own sponsor override', () => {
    expect(can('sponsor', ['EXECUTIVE_SPONSOR'])).toBe(true);
  });

  it('stops a sponsor overriding someone else’s initiative', () => {
    expect(can('other', ['EXECUTIVE_SPONSOR'])).toBe(false);
  });

  it('lets the Strategy Office, CEO and Board override any initiative', () => {
    expect(can('x', ['STRATEGY_OFFICE'])).toBe(true);
    expect(can('x', ['CEO'])).toBe(true);
    expect(can('x', ['BOARD'])).toBe(true);
  });

  it('refuses owners below the minimum, and roles outside the delivery chain', () => {
    expect(can('owner', ['INITIATIVE_OWNER'])).toBe(false);
    expect(can('x', ['SYSTEM_ADMIN'])).toBe(false);
    expect(can('x', ['INTERNAL_AUDIT'])).toBe(false);
  });

  it('lets owners override their own initiatives when the minimum allows it', () => {
    expect(
      canOverrideHealth(
        { membershipId: 'owner', roles: ['INITIATIVE_OWNER'] },
        initiative,
        'INITIATIVE_OWNER',
      ),
    ).toBe(true);
    expect(
      canOverrideHealth(
        { membershipId: 'x', roles: ['INITIATIVE_OWNER'] },
        initiative,
        'INITIATIVE_OWNER',
      ),
    ).toBe(false);
  });

  it('honours a stricter minimum', () => {
    expect(
      canOverrideHealth(
        { membershipId: 'sponsor', roles: ['EXECUTIVE_SPONSOR'] },
        initiative,
        'CEO',
      ),
    ).toBe(false);
    expect(
      canOverrideHealth(
        { membershipId: 'x', roles: ['STRATEGY_OFFICE'] },
        initiative,
        'CEO',
      ),
    ).toBe(false);
  });
});

describe('describeActivity', () => {
  const titles = new Map([['m1', 'Vendor contract signed']]);
  const event = (
    action: string,
    before: unknown = null,
    after: unknown = null,
    entityId = 'i1',
  ) => ({
    action,
    entityType: 'Initiative',
    entityId,
    before,
    after,
  });

  it('writes the wireframe’s sentences', () => {
    expect(
      describeActivity(
        event('STATUS_OVERRIDE', { health: 'RED' }, { health: 'AMBER' }),
        titles,
      ),
    ).toBe('Status overridden Red → Amber with reason');
    expect(
      describeActivity(
        event(
          'MILESTONE_FORECAST_CHANGED',
          { forecastDate: '2026-10-07' },
          { forecastDate: '2026-10-22' },
          'm1',
        ),
        titles,
      ),
    ).toBe('Forecast for Vendor contract signed moved 7 Oct → 22 Oct');
    expect(
      describeActivity(
        event('UPDATE_SUBMITTED', null, {
          claimedProgress: 70,
          verifiedProgress: 65,
        }),
        titles,
      ),
    ).toBe('Update submitted: 65% (claimed 70%, 5 pp not verified)');
  });

  it('falls back to a readable name for new kinds of event', () => {
    expect(describeActivity(event('BUDGET_REFORECAST'), titles)).toBe(
      'Budget reforecast',
    );
    expect(
      describeActivity(event('MILESTONE_COMPLETED', null, null, 'm1'), titles),
    ).toBe('Milestone completed: Vendor contract signed');
  });
});

describe('stableStringify', () => {
  it('ignores key order, as jsonb does', () => {
    expect(stableStringify([{ rule: 'A', detail: 'x' }])).toBe(
      stableStringify([{ detail: 'x', rule: 'A' }]),
    );
    expect(stableStringify({ a: [{ b: 1, a: 2 }] })).toBe(
      '{"a":[{"a":2,"b":1}]}',
    );
  });

  it('keeps array order meaningful', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});
