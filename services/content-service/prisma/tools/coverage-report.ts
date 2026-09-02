/**
 * Prints the coverage report for a container, module by module (plan 55 §3.7).
 *
 * The same query handler the HTTP endpoint runs, called straight against the database —
 * so the answer can be read without a token, a browser or a running service. Written for
 * phase 7.2, where the report is what decides which can-do descriptors a module may
 * honestly claim.
 *
 *   npx tsx prisma/tools/coverage-report.ts <containerId> [draft|published|both]
 */
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { GetContainerCoverageHandler } from '../../src/modules/container/application/queries/get-container-coverage/get-container-coverage.handler.js';
import { PrismaExerciseAxesService } from '../../src/shared/skills/infrastructure/prisma-exercise-axes.service.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
}) as never;

const [containerId, version = 'published'] = process.argv.slice(2);

const handler = new GetContainerCoverageHandler(prisma, new PrismaExerciseAxesService(prisma));

const result = await handler.execute({ containerId, version } as never);
if (result.isFail) {
  console.error(result.error);
  process.exit(1);
}
console.log(JSON.stringify(result.value, null, 2));
await (prisma as unknown as PrismaClient).$disconnect();
