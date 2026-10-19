// Runs every NestJS service's own config validation against the environment a compose
// file actually gives it — the check that found the production compose unable to start
// (plan 76, 7.3). Compose passes a service only its `environment:` block, so a key added
// to a service's envSchema and forgotten in compose surfaces here, not on deploy day.
//
// Prints key names and validation messages only, never values.
//
// Usage (from infrastructure/, Node 22.6+ for --experimental-strip-types):
//   docker compose --env-file .env.prod -f docker-compose.base.yml -f docker-compose.prod.yml \
//     config --format json > /tmp/prod.json
//   node --experimental-strip-types scripts/check-compose-env.mts /tmp/prod.json
// Exit code 1 when any service would refuse to start.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const composeJson = process.argv[2];
if (!composeJson) {
  console.error('usage: check-compose-env.mts <resolved-compose.json>');
  process.exit(2);
}

const servicesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../services');
const compose = JSON.parse(fs.readFileSync(composeJson, 'utf8'));
let failed = false;

for (const [name, service] of Object.entries<{ environment?: Record<string, string> }>(
  compose.services,
)) {
  const configFile = path.join(servicesDir, name, 'src/config/configuration.ts');
  if (!fs.existsSync(configFile)) continue; // infrastructure, auth-service (C#), nginx

  const env = service.environment ?? {};
  const config = await import(configFile);
  try {
    if (typeof config.validate === 'function') config.validate(env);
    else config.envSchema.parse(env);
    console.log(`ok    ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL  ${name}\n${(error as Error).message.replace(/^/gm, '      ')}`);
  }
}

process.exit(failed ? 1 : 0);
