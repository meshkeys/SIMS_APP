import {
  escapeHtml,
  type MailMessage,
} from '../../infrastructure/mail/index.js';

const e = escapeHtml;

/** The shared frame of both emails: one white card with the message. */
const frame = (body: string) => `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f4f3ef;font-family:Segoe UI,Arial,sans-serif;color:#1c1f24">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e1da;border-radius:8px">
    <tr><td style="padding:32px">
${body}
    </td></tr>
  </table>
</body>
</html>`;

export interface PasswordResetEmailInput {
  name: string;
  resetUrl: string;
  /** How long the link works, e.g. 60. */
  validMinutes: number;
}

/** "Choose a new password": the one-time link. */
export function passwordResetEmail(
  input: PasswordResetEmailInput,
): Omit<MailMessage, 'to'> {
  const subject = 'Reset your SIMS password';
  const text = [
    `Hello ${input.name},`,
    '',
    'Someone asked to reset the password of your SIMS account. To choose a new password, open this link:',
    input.resetUrl,
    '',
    `The link works once, for ${input.validMinutes} minutes.`,
    "If you didn't ask for this, you can ignore this email: your password stays the same.",
  ].join('\n');

  const html =
    frame(`      <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hello ${e(input.name)},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">
        Someone asked to reset the password of your SIMS account. To choose a new password, use the button below.
      </p>
      <p style="margin:0 0 24px">
        <a href="${e(input.resetUrl)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Choose a new password</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6270">The link works once, for ${input.validMinutes} minutes.</p>
      <p style="margin:0;font-size:13px;color:#5b6270">If you didn't ask for this, you can ignore this email: your password stays the same.</p>`);

  return { subject, text, html };
}

export interface PasswordChangedEmailInput {
  name: string;
  changedAt: Date;
  signInUrl: string;
}

/** Sent after a reset, so an owner who did not ask for it finds out at once. */
export function passwordChangedEmail(
  input: PasswordChangedEmailInput,
): Omit<MailMessage, 'to'> {
  const when = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(input.changedAt);
  const subject = 'Your SIMS password was changed';
  const text = [
    `Hello ${input.name},`,
    '',
    `The password of your SIMS account was changed on ${when} UTC, and every device was signed out.`,
    '',
    'Sign in with your new password:',
    input.signInUrl,
    '',
    "If this wasn't you, reset your password straight away from the sign-in page and tell your organisation's administrator.",
  ].join('\n');

  const html =
    frame(`      <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hello ${e(input.name)},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">
        The password of your SIMS account was changed on ${e(when)} UTC, and every device was signed out.
      </p>
      <p style="margin:0 0 24px">
        <a href="${e(input.signInUrl)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Sign in</a>
      </p>
      <p style="margin:0;font-size:13px;color:#5b6270">If this wasn't you, reset your password straight away from the sign-in page and tell your organisation's administrator.</p>`);

  return { subject, text, html };
}
