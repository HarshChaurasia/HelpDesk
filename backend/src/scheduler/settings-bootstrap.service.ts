import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Maps DB key names (DTO field names) → process.env key names
const ENV_KEY: Record<string, string> = {
  autoCloseDays: 'AUTO_CLOSE_DAYS',
  imapEnabled:   'IMAP_ENABLED',
  imapHost:      'IMAP_HOST',
  imapPort:      'IMAP_PORT',
  imapSecure:    'IMAP_SECURE',
  imapUser:      'IMAP_USER',
  imapPass:      'IMAP_PASS',
  smtpHost:      'SMTP_HOST',
  smtpPort:      'SMTP_PORT',
  smtpSecure:    'SMTP_SECURE',
  smtpUser:      'SMTP_USER',
  smtpPass:      'SMTP_PASS',
  mailFrom:      'MAIL_FROM',
};

@Injectable()
export class SettingsBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger('SettingsBootstrap');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      const rows = await this.prisma.setting.findMany();
      let applied = 0;
      for (const row of rows) {
        const envKey = ENV_KEY[row.key];
        if (envKey) {
          process.env[envKey] = row.value;
          applied++;
        }
      }
      if (applied > 0) {
        this.logger.log(`Loaded ${applied} setting(s) from DB into process.env`);
      }
    } catch {
      // DB not ready yet or setting table missing — no-op, use .env defaults
    }
  }
}
