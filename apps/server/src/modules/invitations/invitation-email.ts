import { ROLE_LABELS } from '../../domain/roles/roles.js';
import type { Role } from '../../generated/prisma/enums.js';
import {
  escapeHtml,
  type MailMessage,
} from '../../infrastructure/mail/index.js';

export interface InvitationEmailInput {
  organisationName: string;
  inviterName: string;
  roles: readonly Role[];
  acceptUrl: string;
  expiresAt: Date;
  /** IANA zone used to show the expiry date, e.g. "Africa/Lagos". */
  timezone: string;
}

/** The invitation email: plain-text and HTML parts, all user input escaped. */
export function invitationEmail(
  input: InvitationEmailInput,
): Omit<MailMessage, 'to'> {
  const roles = input.roles.map((role) => ROLE_LABELS[role]).join(', ');
  const expires = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeZone: input.timezone,
  }).format(input.expiresAt);

  const subject = `${input.inviterName} invited you to ${input.organisationName} on SIMS`;

  const text = [
    `${input.inviterName} has invited you to join ${input.organisationName} on SIMS, the strategy execution platform.`,
    '',
    `Your role: ${roles}`,
    '',
    'Accept the invitation:',
    input.acceptUrl,
    '',
    `This link works once and expires on ${expires}.`,
    "If you weren't expecting this invitation, you can ignore this email.",
  ].join('\n');

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f4f3ef;font-family:Segoe UI,Arial,sans-serif;color:#1c1f24">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e3e1da;border-radius:8px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;line-height:1.5">
        <strong>${e(input.inviterName)}</strong> has invited you to join
        <strong>${e(input.organisationName)}</strong> on SIMS, the strategy execution platform.
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#5b6270">Your role: ${e(roles)}</p>
      <p style="margin:0 0 24px">
        <a href="${e(input.acceptUrl)}" style="display:inline-block;background:#1f3a5f;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600">Accept invitation</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6270">This link works once and expires on ${e(expires)}.</p>
      <p style="margin:0;font-size:13px;color:#5b6270">If you weren't expecting this invitation, you can ignore this email.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
