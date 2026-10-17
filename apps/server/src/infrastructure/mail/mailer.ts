/** An outgoing email. Always send both parts: some clients show only text. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Port for sending email. Feature code depends on this interface (injected
 * with `@Inject(MAILER)`), never on SMTP, so tests can swap in a fake and
 * the transport can change (SMTP today, a provider API or a queue later).
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');
