import type {
  Mailer,
  MailMessage,
} from '../../src/infrastructure/mail/index.js';

/** Records outgoing mail instead of sending it; can simulate an outage. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failing = false;

  async send(message: MailMessage): Promise<void> {
    if (this.failing) throw new Error('SMTP server unavailable');
    this.sent.push(message);
  }

  /** The most recent message to `to`. */
  lastTo(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === to);
  }

  /** The invitation token from the most recent email to `to`. */
  tokenSentTo(to: string): string {
    const text = this.lastTo(to)?.text ?? '';
    const match = text.match(/accept-invitation\?token=([\w%-]+)/);
    if (!match) throw new Error(`No invitation link was emailed to ${to}`);
    return decodeURIComponent(match[1]);
  }
}
