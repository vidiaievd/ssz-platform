// Seeds the model registry from prisma/seed-data/registry.json (plan 77, step 3).
//
// Idempotent and conservative, because after the first run the admin owns these rows:
//  - a provider or model that exists keeps its `enabled` / `status`; only descriptive
//    fields (names, URLs, credentialRef, region, modality, features) follow the file;
//  - a price is immutable: an existing (model, effectiveFrom) is never rewritten, and a
//    file entry that disagrees with it is reported, not applied;
//  - a binding is created only when its capability has none; an existing one is the admin's;
//  - nothing absent from the file is deleted.
//
// Run: npx prisma db seed   (inside the container: docker compose ... exec ai-service npx prisma db seed)
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

interface SeedPrice {
  effectiveFrom: string;
  inputPerMtok: string;
  outputPerMtok: string;
  cacheReadPerMtok: string;
  cacheWritePerMtok: string;
  /** Speech models; absent = 0. */
  audioPerHour?: string;
  currency?: string;
}

interface SeedModel {
  providerModelId: string;
  displayName: string;
  /** Absent = `llm`. */
  modality?: 'llm' | 'speech';
  /** Applied on create only; absent = active. */
  status?: 'active' | 'disabled';
  features: Record<string, unknown>;
  prices: SeedPrice[];
}

interface SeedProvider {
  code: string;
  kind: 'anthropic' | 'openai' | 'openai_compatible' | 'azure_openai' | 'google' | 'whisper_local' | 'azure_speech' | 'fake';
  displayName: string;
  baseUrl?: string | null;
  apiVersion?: string | null;
  credentialRef: string | null;
  region: 'eu' | 'us' | 'global' | 'local';
  enabled: boolean;
  models: SeedModel[];
}

interface SeedBinding {
  capability: string;
  /** `<provider code>/<providerModelId>` */
  primary: string;
  fallback: string | null;
  maxOutputTokens: number;
  timeoutMs: number;
  promptVersion: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, 'seed-data/registry.json'), 'utf8')) as {
  providers: SeedProvider[];
  bindings?: SeedBinding[];
};

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const PRICE_FIELDS = ['inputPerMtok', 'outputPerMtok', 'cacheReadPerMtok', 'cacheWritePerMtok', 'audioPerHour'] as const;

async function main(): Promise<void> {
  for (const p of data.providers) {
    const descriptive = {
      kind: p.kind,
      displayName: p.displayName,
      baseUrl: p.baseUrl ?? null,
      apiVersion: p.apiVersion ?? null,
      credentialRef: p.credentialRef,
      region: p.region,
    };
    const provider = await prisma.aiProvider.upsert({
      where: { code: p.code },
      create: { code: p.code, enabled: p.enabled, ...descriptive },
      update: descriptive,
    });
    console.log(`provider ${p.code} (enabled=${provider.enabled})`);

    for (const m of p.models) {
      const model = await prisma.aiModel.upsert({
        where: { providerId_providerModelId: { providerId: provider.id, providerModelId: m.providerModelId } },
        create: {
          providerId: provider.id,
          providerModelId: m.providerModelId,
          displayName: m.displayName,
          modality: m.modality ?? 'llm',
          ...(m.status ? { status: m.status } : {}),
          features: m.features as Prisma.InputJsonValue,
        },
        update: { displayName: m.displayName, modality: m.modality ?? 'llm', features: m.features as Prisma.InputJsonValue },
      });
      console.log(`  model ${m.providerModelId} (status=${model.status})`);

      for (const price of m.prices) {
        const effectiveFrom = new Date(`${price.effectiveFrom}T00:00:00.000Z`);
        const existing = await prisma.aiModelPrice.findUnique({
          where: { modelId_effectiveFrom: { modelId: model.id, effectiveFrom } },
        });
        if (!existing) {
          await prisma.aiModelPrice.create({
            data: {
              modelId: model.id,
              effectiveFrom,
              inputPerMtok: price.inputPerMtok,
              outputPerMtok: price.outputPerMtok,
              cacheReadPerMtok: price.cacheReadPerMtok,
              cacheWritePerMtok: price.cacheWritePerMtok,
              audioPerHour: price.audioPerHour ?? '0',
              currency: price.currency ?? 'USD',
            },
          });
          console.log(`    price from ${price.effectiveFrom} added`);
          continue;
        }
        const differs = PRICE_FIELDS.filter((f) => !existing[f].equals(new Prisma.Decimal(price[f] ?? '0')));
        if (differs.length > 0) {
          console.warn(
            `    price from ${price.effectiveFrom} differs from the stored one in ${differs.join(', ')} — ` +
              'left as stored; add an entry with a later effectiveFrom to change it',
          );
        }
      }
    }
  }

  await seedBindings(data.bindings ?? []);
}

async function modelIdOf(ref: string): Promise<string> {
  const [code, ...rest] = ref.split('/');
  const model = await prisma.aiModel.findFirst({
    where: { providerModelId: rest.join('/'), provider: { code } },
  });
  if (!model) throw new Error(`binding refers to an unknown model ${ref}`);
  return model.id;
}

async function seedBindings(bindings: SeedBinding[]): Promise<void> {
  for (const b of bindings) {
    if (await prisma.aiBinding.findUnique({ where: { capability: b.capability } })) {
      console.log(`binding ${b.capability} exists — left as it is`);
      continue;
    }
    const settings = {
      primaryModelId: await modelIdOf(b.primary),
      fallbackModelId: b.fallback ? await modelIdOf(b.fallback) : null,
      maxOutputTokens: b.maxOutputTokens,
      temperature: null,
      timeoutMs: b.timeoutMs,
      promptVersion: b.promptVersion,
      enabled: true,
    };
    // Same shape as PrismaBindingRepository.save: the row and its history entry together.
    await prisma.$transaction([
      prisma.aiBinding.create({ data: { capability: b.capability, ...settings, version: 1, updatedBy: 'seed' } }),
      prisma.aiBindingChange.create({
        data: { capability: b.capability, version: 1, changedBy: 'seed', before: Prisma.DbNull, after: settings },
      }),
    ]);
    console.log(`binding ${b.capability} created (${b.primary})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
