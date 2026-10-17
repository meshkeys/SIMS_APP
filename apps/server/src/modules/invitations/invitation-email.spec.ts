import { rolesCallerCannotGrant } from '../../domain/roles/roles.js';
import { invitationEmail } from './invitation-email.js';

describe('invitationEmail', () => {
  const base = {
    organisationName: 'Meridian Financial Group',
    inviterName: 'Amara Bello',
    roles: ['INITIATIVE_OWNER', 'BOARD'] as const,
    acceptUrl: 'https://app.sims.app/accept-invitation?token=abc123',
    expiresAt: new Date('2026-10-25T09:00:00Z'),
    timezone: 'Africa/Lagos',
  };

  it('names the inviter, organisation, roles, link and expiry', () => {
    const email = invitationEmail({ ...base, roles: [...base.roles] });

    expect(email.subject).toBe(
      'Amara Bello invited you to Meridian Financial Group on SIMS',
    );
    expect(email.text).toContain('Your role: Initiative owner, Board member');
    expect(email.text).toContain(base.acceptUrl);
    expect(email.text).toContain('expires on 25 October 2026');
    expect(email.html).toContain(`href="${base.acceptUrl}"`);
  });

  it('escapes user-controlled text in the HTML part', () => {
    const email = invitationEmail({
      ...base,
      roles: ['TASK_OWNER'],
      organisationName: 'Evil <a href="https://phish.example">Corp</a>',
      inviterName: `O'Brien & <script>`,
    });

    expect(email.html).not.toContain('<a href="https://phish.example">');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain(
      'Evil &lt;a href=&quot;https://phish.example&quot;&gt;Corp&lt;/a&gt;',
    );
    expect(email.html).toContain('O&#39;Brien &amp; &lt;script&gt;');
  });

  it('shows the expiry date in the organisation’s time zone', () => {
    const lateUtc = new Date('2026-10-25T23:30:00Z'); // already 26 Oct in Lagos
    expect(
      invitationEmail({ ...base, roles: ['TASK_OWNER'], expiresAt: lateUtc })
        .text,
    ).toContain('expires on 26 October 2026');
  });
});

describe('rolesCallerCannotGrant', () => {
  it('lets a System Admin grant anything', () => {
    expect(
      rolesCallerCannotGrant(['SYSTEM_ADMIN'], ['SYSTEM_ADMIN', 'CEO']),
    ).toEqual([]);
  });

  it('stops anyone else granting System Admin', () => {
    expect(
      rolesCallerCannotGrant(['STRATEGY_OFFICE'], ['SYSTEM_ADMIN', 'BOARD']),
    ).toEqual(['SYSTEM_ADMIN']);
  });
});
