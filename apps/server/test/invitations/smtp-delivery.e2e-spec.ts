import { loadEnv } from '../../src/config/env.js';
import { SmtpMailer } from '../../src/infrastructure/mail/smtp-mailer.js';

/**
 * Proves the real SMTP path end to end by sending to Mailpit (docker-compose)
 * and reading the message back through Mailpit's API. Skipped when Mailpit
 * is not running, e.g. in a CI job without it.
 */
const MAILPIT_API = 'http://localhost:8025/api/v1';
const mailpitUp = await fetch(`${MAILPIT_API}/info`)
  .then((response) => response.ok)
  .catch(() => false);

describe.runIf(mailpitUp)('SMTP delivery via Mailpit', () => {
  const mailer = new SmtpMailer(loadEnv());

  afterAll(() => mailer.onModuleDestroy());

  // Generous timeout: the first SMTP connection through Docker Desktop can take seconds.
  it(
    'delivers an email with both text and HTML parts',
    { timeout: 20_000 },
    async () => {
      const to = `smtp-check-${Date.now()}@example.com`;
      await mailer.send({
        to,
        subject: 'SIMS delivery check',
        text: 'Plain text body',
        html: '<p>HTML body</p>',
      });

      const search = await fetch(
        `${MAILPIT_API}/search?query=${encodeURIComponent(`to:"${to}"`)}`,
      );
      const result = (await search.json()) as {
        messages: { Subject: string; From: { Address: string } }[];
      };
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].Subject).toBe('SIMS delivery check');
      expect(result.messages[0].From.Address).toBe('no-reply@sims.local');
    },
  );
});
