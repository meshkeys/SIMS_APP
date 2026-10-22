import { verifyEmail, welcomeEmail } from './verification-email.js';

describe('welcomeEmail', () => {
  const input = {
    name: 'Efua Asante',
    organisationName: 'Coastal Microfinance',
    verifyUrl: 'https://app.sims.app/verify-email?token=abc123',
    appUrl: 'https://app.sims.app',
    validDays: 7,
  };

  it('welcomes, names the workspace and links to confirm the address', () => {
    const email = welcomeEmail(input);

    expect(email.subject).toBe(
      'Welcome to SIMS: confirm your email for Coastal Microfinance',
    );
    expect(email.text).toContain('Your workspace for Coastal Microfinance');
    expect(email.text).toContain(input.verifyUrl);
    expect(email.text).toContain('works for 7 days');
    expect(email.html).toContain(`href="${input.verifyUrl}"`);
  });

  it('escapes the organisation name in the HTML part', () => {
    const email = welcomeEmail({
      ...input,
      organisationName: '<script>x</script> & Co',
    });

    expect(email.html).not.toContain('<script>x</script>');
    expect(email.html).toContain('&lt;script&gt;x&lt;/script&gt; &amp; Co');
  });
});

describe('verifyEmail', () => {
  it('links to confirm the address', () => {
    const email = verifyEmail({
      name: 'Efua Asante',
      verifyUrl: 'https://app.sims.app/verify-email?token=xyz',
      validDays: 7,
    });

    expect(email.subject).toBe('Confirm your email for SIMS');
    expect(email.text).toContain('https://app.sims.app/verify-email?token=xyz');
    expect(email.text).toContain('replaces any earlier one');
  });
});
