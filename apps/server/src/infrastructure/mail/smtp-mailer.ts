import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { Mailer, MailMessage } from './mailer.js';

/** Sends email through any SMTP server (Mailpit locally; SES, SendGrid, Postmark… in production). */
@Injectable()
export class SmtpMailer implements Mailer, OnModuleDestroy {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(@Inject(ENV) env: Env) {
    const user = env.SMTP_USER?.trim();
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: user ? { user, pass: env.SMTP_PASSWORD ?? '' } : undefined,
      // Fail fast instead of tying up the request for minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      pool: true,
      maxConnections: 5,
    });
    this.from = env.MAIL_FROM;
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}
