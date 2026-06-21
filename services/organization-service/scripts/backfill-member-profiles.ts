// One-off backfill: populate SchoolMember.name/avatarUrl for members created
// before the profile.created/profile.updated event consumer existed.
// Run once: node --env-file=.env -r ts-node/register scripts/backfill-member-profiles.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const PROFILE_SERVICE_URL = process.env['PROFILE_SERVICE_URL'];
const INTERNAL_SERVICE_TOKEN = process.env['INTERNAL_SERVICE_TOKEN'];

async function getDisplayName(userId: string): Promise<{ name: string | null; avatarUrl: string | null }> {
  if (!PROFILE_SERVICE_URL) return { name: null, avatarUrl: null };

  const res = await fetch(`${PROFILE_SERVICE_URL}/api/v1/internal/profiles/${userId}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(INTERNAL_SERVICE_TOKEN ? { 'x-service-token': INTERNAL_SERVICE_TOKEN } : {}),
    },
  });

  if (!res.ok) return { name: null, avatarUrl: null };
  const body = (await res.json()) as { displayName?: string; avatarUrl?: string };
  return { name: body.displayName ?? null, avatarUrl: body.avatarUrl ?? null };
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] as string });
  const prisma = new PrismaClient({ adapter });
  try {
    const members = await prisma.schoolMember.findMany({
      where: { name: null },
      select: { id: true, userId: true },
    });

    console.log(`Backfilling ${members.length} member(s)...`);

    for (const member of members) {
      const { name, avatarUrl } = await getDisplayName(member.userId);
      if (!name) {
        console.warn(`  skip ${member.userId} — profile-service returned no displayName`);
        continue;
      }
      await prisma.schoolMember.update({
        where: { id: member.id },
        data: { name, avatarUrl },
      });
      console.log(`  updated ${member.userId} -> "${name}"`);
    }

    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
