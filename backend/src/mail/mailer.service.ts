import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');

  getConfig(): SmtpConfig {
    return {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1025', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
      from: process.env.MAIL_FROM || 'Help Desk <support@helpdesk.local>',
    };
  }

  private createTransport(cfg: SmtpConfig) {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  async send(msg: MailMessage): Promise<void> {
    const cfg = this.getConfig();
    const transport = this.createTransport(cfg);
    try {
      await transport.sendMail({
        from: cfg.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
    } catch (err) {
      this.logger.error(`Failed to send mail to ${msg.to}: ${err}`);
    }
  }

  async testConnection(to: string): Promise<{ ok: boolean; message: string }> {
    const cfg = this.getConfig();
    const transport = this.createTransport(cfg);
    try {
      await transport.verify();
      await transport.sendMail({
        from: cfg.from,
        to,
        subject: '[Help Desk] SMTP Test',
        text: `SMTP connection test successful.\n\nHost: ${cfg.host}:${cfg.port}\nSecure: ${cfg.secure}`,
      });
      return { ok: true, message: `Test email sent to ${to} via ${cfg.host}:${cfg.port}` };
    } catch (err: any) {
      return { ok: false, message: err?.message ?? String(err) };
    }
  }
}
