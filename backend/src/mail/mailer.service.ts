import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: parseInt(process.env.SMTP_PORT ?? '1025', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  async send(msg: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? 'support@helpdesk.local',
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
    } catch (err) {
      this.logger.error(`Failed to send mail to ${msg.to}: ${err}`);
    }
  }
}
