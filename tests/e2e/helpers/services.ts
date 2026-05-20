import { execSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const SERVICES_DIR = path.join(REPO_ROOT, 'services');

export interface ServiceEnv {
  databaseUrl: string;
  rabbitmqUrl: string;
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  redisDb: number;
  jwtPublicKey: string;
  contentServiceUrl: string;
  orgServiceUrl: string;
  internalServiceToken?: string;
  /** Extra env vars passed through verbatim. */
  extra?: Record<string, string>;
}

/**
 * Runs a NestJS service as a Node.js child process against real infra containers.
 * Requires `dist/` to be pre-built (`npm run build` inside the service directory).
 */
export class ServiceProcess {
  private proc?: ChildProcess;

  async start(serviceName: string, port: number, env: ServiceEnv): Promise<string> {
    const dir = path.join(SERVICES_DIR, serviceName);
    const resolved = buildEnv(env, port);

    // Run Prisma migrations before booting so the schema is in place.
    execSync('npx prisma migrate deploy', {
      cwd: dir,
      env: resolved,
      stdio: 'pipe',
    });

    this.proc = spawn('node', ['dist/main.js'], {
      cwd: dir,
      env: resolved,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (process.env['E2E_SERVICE_LOGS']) {
      this.proc.stdout?.on('data', (d: Buffer) => process.stdout.write(d));
    }
    this.proc.stderr?.on('data', (d: Buffer) => process.stderr.write(d));

    const baseUrl = `http://127.0.0.1:${port}`;
    await waitHealthy(`${baseUrl}/health/live`, 90_000);
    return baseUrl;
  }

  stop(): void {
    this.proc?.kill('SIGTERM');
    this.proc = undefined;
  }
}

function buildEnv(env: ServiceEnv, port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DATABASE_URL: env.databaseUrl,
    RABBITMQ_URL: env.rabbitmqUrl,
    RABBITMQ_EXCHANGE: 'ssz.events',
    REDIS_HOST: env.redisHost,
    REDIS_PORT: String(env.redisPort),
    REDIS_PASSWORD: env.redisPassword,
    REDIS_DB: String(env.redisDb),
    // Inline PEM newlines so the service config can parse them.
    JWT_PUBLIC_KEY: env.jwtPublicKey.replace(/\n/g, '\\n'),
    CONTENT_SERVICE_URL: env.contentServiceUrl,
    ORGANIZATION_SERVICE_URL: env.orgServiceUrl,
    INTERNAL_SERVICE_TOKEN: env.internalServiceToken ?? 'e2e-internal-token',
    ...env.extra,
  };
}

async function waitHealthy(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const { status } = await axios.get(url, {
        timeout: 2_000,
        validateStatus: () => true,
      });
      if (status < 500) return;
    } catch {
      // Not up yet — swallow and retry.
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Service at ${url} did not become healthy within ${timeoutMs}ms`);
}
