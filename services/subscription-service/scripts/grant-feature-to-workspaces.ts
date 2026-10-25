// One-off: give every existing workspace a feature key for a test period (plan 80, R8).
//
// A new capability is switched on for the workspaces that exist on the test stand and off
// for the ones created later — the free workspace plan does not carry the key, so a grant
// with a term is the switch. Revoking it early is the admin API's ordinary grant revoke.
//
// Which workspaces: every id read from stdin (one per line) plus every workspace account
// this service already has. Accounts are only opened when a school is created after
// plan 78, so older schools are known to organization-service alone — pipe their ids in.
//
// Safe to run more than once: a workspace that already holds a running or scheduled grant
// of the key is skipped. Each grant bumps the account's revision, so the snapshot
// publisher announces the new entitlements like after an admin grant.
//
// Run (inside the container; dry-run unless --apply):
//   docker exec infrastructure-postgres-1 psql -U <user> -d organizations_db -Atc 'select id from schools' \
//     | docker exec -i <subscription-service container> npx tsx scripts/grant-feature-to-workspaces.ts \
//         --ends-at=2027-01-31T23:59:59Z [--key=school.review_ai_policy] [--reason=...] [--apply]
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { describeAccountError } from '../src/modules/accounts/domain/account-errors.js';
import { Grant } from '../src/modules/accounts/domain/grant.js';

const AUTHOR = 'script:grant-feature-to-workspaces';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const flag = (name: string): string | undefined =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const APPLY = process.argv.includes('--apply');
const KEY = flag('key') ?? 'school.review_ai_policy';
const REASON = flag('reason') ?? 'тестовый режим';
const ENDS_AT = flag('ends-at');

async function readStdinIds(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bad = lines.filter((l) => !UUID.test(l));
  if (bad.length > 0) throw new Error(`not workspace ids: ${bad.join(', ')}`);
  return lines.map((l) => l.toLowerCase());
}

async function main(): Promise<void> {
  if (!ENDS_AT || Number.isNaN(Date.parse(ENDS_AT))) throw new Error('--ends-at=<ISO 8601> is required');
  const endsAt = new Date(ENDS_AT);
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const known = await prisma.billingAccount.findMany({ where: { type: 'workspace' }, select: { externalId: true } });
    const ids = [...new Set([...(await readStdinIds()), ...known.map((a) => a.externalId)])].sort();
    const now = new Date();
    console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${KEY} until ${endsAt.toISOString()} for ${ids.length} workspace(s)`);

    let granted = 0;
    let skipped = 0;
    for (const externalId of ids) {
      const account = await prisma.billingAccount.findUnique({
        where: { type_externalId: { type: 'workspace', externalId } },
        include: { grants: { where: { featureKey: KEY, revokedAt: null, endsAt: { gt: now } } } },
      });
      if (account && account.grants.length > 0) {
        skipped++;
        console.log(`  skip   ${externalId} — already granted until ${account.grants[0]!.endsAt.toISOString()}`);
        continue;
      }

      // The same checks an admin grant passes: known key, no credits on a switch, a term.
      const issued = Grant.issue({
        id: randomUUID(),
        accountId: account?.id ?? 'pending',
        featureKey: KEY,
        monthlyCredits: null,
        limits: {},
        startsAt: now,
        endsAt,
        reason: REASON,
        by: AUTHOR,
        now,
      });
      if (issued.isFail) throw new Error(describeAccountError(issued.error));

      granted++;
      console.log(`  grant  ${externalId}${account ? '' : ' (opens the account)'}`);
      if (!APPLY) continue;

      const g = issued.value.snapshot;
      await prisma.$transaction(async (tx) => {
        // A missing account is simply on the free workspace plan, as the admin API's ensure().
        const row = await tx.billingAccount.upsert({
          where: { type_externalId: { type: 'workspace', externalId } },
          create: { type: 'workspace', externalId },
          update: {},
        });
        await tx.grant.create({
          data: {
            id: g.id,
            accountId: row.id,
            featureKey: g.featureKey,
            monthlyCredits: null,
            limits: {},
            startsAt: g.startsAt,
            endsAt: g.endsAt,
            reason: g.reason,
            createdBy: g.createdBy,
            createdAt: g.createdAt,
          },
        });
        await tx.billingAccount.update({ where: { id: row.id }, data: { revision: { increment: 1 } } });
      });
    }

    console.log(`${granted} to grant, ${skipped} already granted${APPLY ? '' : ' — nothing written, pass --apply'}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
