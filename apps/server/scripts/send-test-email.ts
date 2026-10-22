/**
 * Sends one test email with the SMTP settings in .env, and explains any
 * failure in plain words. Use it after setting up an email provider:
 *
 *   npm run mail:test -- you@example.com
 */
import { loadEnv } from '../src/config/env.js';
import { SmtpMailer } from '../src/infrastructure/mail/smtp-mailer.js';

const to = process.argv[2]?.trim();
if (!to || !to.includes('@')) {
  console.error('Usage: npm run mail:test -- you@example.com');
  process.exit(1);
}

const env = loadEnv();
const mailpit = ['localhost', '127.0.0.1'].includes(env.SMTP_HOST);
console.log(
  `Sending a test email to ${to} through ${env.SMTP_HOST}:${env.SMTP_PORT}, from ${env.MAIL_FROM}…`,
);

/** What a failure most likely means, for nodemailer's error codes. */
function explain(error: { code?: string; responseCode?: number }): string {
  if (error.code === 'EAUTH') {
    return 'The provider refused the login. Check SMTP_USER (Brevo: your SMTP login) and SMTP_PASSWORD (Brevo: an SMTP key, not your account password).';
  }
  if (
    ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(error.code ?? '')
  ) {
    return mailpit
      ? 'Mailpit is not reachable. Start it with: npm run infra:up'
      : 'The SMTP server could not be reached. Check SMTP_HOST and SMTP_PORT (Brevo: smtp-relay.brevo.com and 587), and that your network allows outgoing SMTP.';
  }
  if (error.responseCode && [550, 551, 553, 554].includes(error.responseCode)) {
    return 'The provider refused the sender. MAIL_FROM must be a sender address you verified with the provider (Brevo: Senders, Domains & Dedicated IPs).';
  }
  return 'See the error above.';
}

const mailer = new SmtpMailer(env);
try {
  await mailer.send({
    to,
    subject: 'SIMS email test',
    text: 'This is a test email from SIMS. If you can read it, email delivery works.',
    html: '<p>This is a test email from <strong>SIMS</strong>. If you can read it, email delivery works.</p>',
  });
  console.log(
    mailpit
      ? 'Sent to Mailpit (local test inbox), not to a real mailbox. Open http://localhost:8025 to see it. To reach real inboxes, set up a provider (docs, chapter 8).'
      : `Sent. Check ${to}, including the spam folder.`,
  );
} catch (error) {
  console.error(`Sending failed: ${(error as Error).message}`);
  console.error(explain(error as { code?: string; responseCode?: number }));
  process.exitCode = 1;
} finally {
  mailer.onModuleDestroy();
}
