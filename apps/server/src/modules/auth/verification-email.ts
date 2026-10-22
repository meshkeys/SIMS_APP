import {
  escapeHtml,
  type MailMessage,
} from '../../infrastructure/mail/index.js';

const e = escapeHtml;

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

const button = (url: string, label: string) =>
  `<p style="margin:0 0 24px">
        <a href="${e(url)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">${e(label)}</a>
      </p>`;

export interface WelcomeEmailInput {
  name: string;
  organisationName: string;
  verifyUrl: string;
  appUrl: string;
  validDays: number;
}

/** Sent at sign-up: welcome, what to do next, and confirm the address. */
export function welcomeEmail(
  input: WelcomeEmailInput,
): Omit<MailMessage, 'to'> {
  const subject = `Welcome to SIMS: confirm your email for ${input.organisationName}`;
  const text = [
    `Welcome to SIMS, ${input.name}.`,
    '',
    `Your workspace for ${input.organisationName} is ready. Next, set it up: your strategy framework, vision and pillars, starting rules, and your team.`,
    '',
    'First, confirm your email address with this link:',
    input.verifyUrl,
    '',
    `The link works for ${input.validDays} days. Open SIMS at any time: ${input.appUrl}`,
    "If you didn't create this account, you can ignore this email.",
  ].join('\n');

  const html =
    frame(`      <p style="margin:0 0 16px;font-size:18px;font-weight:600">Welcome to SIMS, ${e(input.name)}.</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5">
        Your workspace for <strong>${e(input.organisationName)}</strong> is ready. Next, set it up:
        your strategy framework, vision and pillars, starting rules, and your team.
      </p>
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5">First, confirm your email address.</p>
      ${button(input.verifyUrl, 'Confirm my email')}
      <p style="margin:0 0 8px;font-size:13px;color:#5b6270">The link works for ${input.validDays} days. Open SIMS at any time: <a href="${e(input.appUrl)}" style="color:#1f3a5f">${e(input.appUrl)}</a></p>
      <p style="margin:0;font-size:13px;color:#5b6270">If you didn't create this account, you can ignore this email.</p>`);

  return { subject, text, html };
}

export interface VerifyEmailInput {
  name: string;
  verifyUrl: string;
  validDays: number;
}

/** Sent on request ("resend the link"). */
export function verifyEmail(input: VerifyEmailInput): Omit<MailMessage, 'to'> {
  const subject = 'Confirm your email for SIMS';
  const text = [
    `Hello ${input.name},`,
    '',
    'Confirm your email address for SIMS with this link:',
    input.verifyUrl,
    '',
    `The link works for ${input.validDays} days, and replaces any earlier one.`,
    "If you didn't ask for this, you can ignore this email.",
  ].join('\n');

  const html =
    frame(`      <p style="margin:0 0 16px;font-size:16px;line-height:1.5">Hello ${e(input.name)},</p>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.5">Confirm your email address for SIMS.</p>
      ${button(input.verifyUrl, 'Confirm my email')}
      <p style="margin:0 0 8px;font-size:13px;color:#5b6270">The link works for ${input.validDays} days, and replaces any earlier one.</p>
      <p style="margin:0;font-size:13px;color:#5b6270">If you didn't ask for this, you can ignore this email.</p>`);

  return { subject, text, html };
}
