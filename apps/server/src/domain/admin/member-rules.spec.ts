import {
  canEditMember,
  deactivationProblem,
  roleChangeProblem,
  wouldCreateCycle,
} from './member-rules.js';

const admin = {
  membershipId: 'admin',
  roles: ['SYSTEM_ADMIN', 'STRATEGY_OFFICE'] as const,
};
const office = { membershipId: 'office', roles: ['STRATEGY_OFFICE'] as const };
const owner = {
  membershipId: 'owner',
  roles: ['INITIATIVE_OWNER'] as const,
  status: 'ACTIVE' as const,
};
const adminTarget = { ...admin, status: 'ACTIVE' as const };

describe('roleChangeProblem', () => {
  it('lets the Strategy Office change ordinary roles', () => {
    expect(
      roleChangeProblem(
        office,
        owner,
        ['INITIATIVE_OWNER', 'EXECUTIVE_SPONSOR'],
        1,
      ),
    ).toBeNull();
  });

  it('keeps the administrator role for administrators to give and take', () => {
    expect(roleChangeProblem(office, owner, ['SYSTEM_ADMIN'], 1)).toMatchObject(
      {
        code: 'ADMIN_ONLY',
      },
    );
    expect(
      roleChangeProblem(office, adminTarget, ['STRATEGY_OFFICE'], 2),
    ).toMatchObject({
      code: 'ADMIN_ONLY',
    });
    expect(roleChangeProblem(admin, owner, ['SYSTEM_ADMIN'], 1)).toBeNull();
  });

  it('never removes the last active administrator', () => {
    expect(
      roleChangeProblem(admin, adminTarget, ['STRATEGY_OFFICE'], 1),
    ).toMatchObject({
      code: 'LAST_ADMIN',
    });
    expect(
      roleChangeProblem(admin, adminTarget, ['STRATEGY_OFFICE'], 2),
    ).toBeNull();
  });
});

describe('deactivationProblem', () => {
  it('stops people deactivating themselves', () => {
    expect(
      deactivationProblem(office, { ...office, status: 'ACTIVE' }, 1),
    ).toMatchObject({
      code: 'CANNOT_DEACTIVATE_SELF',
    });
  });

  it('protects administrators and the last one', () => {
    const other = { ...adminTarget, membershipId: 'other-admin' };
    expect(deactivationProblem(office, other, 2)).toMatchObject({
      code: 'ADMIN_ONLY',
    });
    expect(deactivationProblem(admin, other, 1)).toMatchObject({
      code: 'LAST_ADMIN',
    });
    expect(deactivationProblem(admin, other, 2)).toBeNull();
    expect(deactivationProblem(office, owner, 1)).toBeNull();
  });
});

describe('canEditMember', () => {
  it('leaves administrators to administrators', () => {
    expect(canEditMember(office, owner)).toBe(true);
    expect(canEditMember(office, adminTarget)).toBe(false);
    expect(canEditMember(admin, adminTarget)).toBe(true);
  });
});

describe('wouldCreateCycle', () => {
  const tree = [
    { id: 'retail', parentId: null },
    { id: 'branches', parentId: 'retail' },
    { id: 'lagos', parentId: 'branches' },
  ];
  it('refuses to move a department inside itself', () => {
    expect(wouldCreateCycle(tree, 'retail', 'lagos')).toBe(true);
    expect(wouldCreateCycle(tree, 'branches', 'branches')).toBe(true);
    expect(wouldCreateCycle(tree, 'lagos', 'retail')).toBe(false);
    expect(wouldCreateCycle(tree, 'branches', null)).toBe(false);
  });
});
