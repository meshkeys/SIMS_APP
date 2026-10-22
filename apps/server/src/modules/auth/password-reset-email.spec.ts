import {
  passwordChangedEmail,
  passwordResetEmail,
} from './password-reset-email.js';

describe('passwordResetEmail', () => {
  const input = {
    name: 'Amara Bello',
    resetUrl: 'https://app.sims.app/reset-password?token=abc123',
    validMinutes: 60,
  };

  it('gives the link and how long it works', () => {
    const email = passwordResetEmail(input);

    expect(email.subject).toBe('Reset your SIMS password');
    expect(email.text).toContain(input.resetUrl);
    expect(email.text).toContain('works once, for 60 minutes');
    expect(email.html).toContain(`href="${input.resetUrl}"`);
  });

  it('escapes the name in the HTML part', () => {
    const email = passwordResetEmail({ ...input, name: '<b>Eve</b> & co' });

    expect(email.html).not.toContain('<b>Eve</b>');
    expect(email.html).toContain('&lt;b&gt;Eve&lt;/b&gt; &amp; co');
  });
});

describe('passwordChangedEmail', () => {
  it('says when, and what to do if it was not them', () => {
    const email = passwordChangedEmail({
      name: 'Amara Bello',
      changedAt: new Date('2026-10-22T14:05:00Z'),
      signInUrl: 'https://app.sims.app/login',
    });

    expect(email.subject).toBe('Your SIMS password was changed');
    expect(email.text).toContain('22 October 2026 at 14:05 UTC');
    expect(email.text).toContain("If this wasn't you");
    expect(email.html).toContain('href="https://app.sims.app/login"');
  });
});
