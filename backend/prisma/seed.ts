import { PrismaClient, Priority } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const pw = await argon2.hash('Passw0rd!');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@helpdesk.local' },
    update: {},
    create: {
      email: 'admin@helpdesk.local',
      fullName: 'Admin User',
      role: 'ADMIN',
      passwordHash: pw,
    },
  });
  const agent1 = await prisma.user.upsert({
    where: { email: 'agent1@helpdesk.local' },
    update: {},
    create: {
      email: 'agent1@helpdesk.local',
      fullName: 'Agent One',
      role: 'AGENT',
      passwordHash: pw,
    },
  });
  await prisma.user.upsert({
    where: { email: 'agent2@helpdesk.local' },
    update: {},
    create: {
      email: 'agent2@helpdesk.local',
      fullName: 'Agent Two',
      role: 'AGENT',
      passwordHash: pw,
    },
  });
  const cust1 = await prisma.user.upsert({
    where: { email: 'customer1@helpdesk.local' },
    update: {},
    create: {
      email: 'customer1@helpdesk.local',
      fullName: 'Customer One',
      role: 'CUSTOMER',
      passwordHash: pw,
    },
  });
  await prisma.user.upsert({
    where: { email: 'customer2@helpdesk.local' },
    update: {},
    create: {
      email: 'customer2@helpdesk.local',
      fullName: 'Customer Two',
      role: 'CUSTOMER',
      passwordHash: pw,
    },
  });

  const standard = await prisma.slaPolicy.upsert({
    where: { name: 'Standard' },
    update: {},
    create: {
      name: 'Standard',
      responseMins: { LOW: 480, MEDIUM: 240, HIGH: 120, URGENT: 30 },
      resolutionMins: { LOW: 4320, MEDIUM: 2880, HIGH: 1440, URGENT: 480 },
    },
  });
  const priority = await prisma.slaPolicy.upsert({
    where: { name: 'Priority' },
    update: {},
    create: {
      name: 'Priority',
      responseMins: { LOW: 240, MEDIUM: 120, HIGH: 60, URGENT: 15 },
      resolutionMins: { LOW: 2880, MEDIUM: 1440, HIGH: 480, URGENT: 240 },
    },
  });

  const cats = [
    { name: 'General', slaPolicyId: standard.id },
    { name: 'Billing', slaPolicyId: standard.id },
    { name: 'Technical', slaPolicyId: priority.id },
    { name: 'Account', slaPolicyId: standard.id },
  ];
  const catRecords: Record<string, string> = {};
  for (const c of cats) {
    const rec = await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
    catRecords[c.name] = rec.id;
  }

  await prisma.counter.upsert({
    where: { name: 'ticket' },
    update: {},
    create: { name: 'ticket', value: 0 },
  });

  const existing = await prisma.ticket.count();
  if (existing === 0) {
    const samples = [
      ['Cannot log in', 'Technical', 'HIGH', 'NEW'],
      ['Invoice question', 'Billing', 'MEDIUM', 'OPEN'],
      ['Feature request', 'General', 'LOW', 'IN_PROGRESS'],
      ['Password reset not working', 'Account', 'URGENT', 'PENDING_CUSTOMER'],
      ['App crashes on startup', 'Technical', 'HIGH', 'RESOLVED'],
    ] as const;
    let n = 0;
    for (const [subject, cat, prio, status] of samples) {
      n++;
      await prisma.ticket.create({
        data: {
          reference: `HD-${String(n).padStart(6, '0')}`,
          subject,
          priority: prio as Priority,
          status: status as any,
          categoryId: catRecords[cat],
          createdById: cust1.id,
          assignedToId: status === 'NEW' ? null : agent1.id,
          resolvedAt: status === 'RESOLVED' ? new Date() : null,
          messages: {
            create: {
              authorId: cust1.id,
              body: `Sample description for: ${subject}`,
            },
          },
          watchers: { create: { userId: cust1.id } },
        },
      });
    }
    await prisma.counter.update({
      where: { name: 'ticket' },
      data: { value: n },
    });
  }

  const defaultSettings = [
    { key: 'autoCloseDays', value: '5' },
    { key: 'imapEnabled', value: 'false' },
    { key: 'smtpHost', value: '' },
    { key: 'imapHost', value: '' },
  ];
  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete. Logins use password: Passw0rd!');
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
