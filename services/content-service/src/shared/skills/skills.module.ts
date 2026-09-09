import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { EXERCISE_AXES } from './domain/exercise-axes.port.js';
import { PrismaExerciseAxesService } from './infrastructure/prisma-exercise-axes.service.js';

/**
 * The skill and focus axes of plan 55, resolved against the database.
 *
 * The rules themselves live in `@ssz/shared-kernel/skills` and are shared with the web
 * client; what this module adds is the part only the content database knows — where an
 * exercise is placed, which atoms it practises, what its author overruled. Marked
 * @Global for the same reason DiscoveryModule is: three feature modules read the axes,
 * and none of them owns them.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [{ provide: EXERCISE_AXES, useClass: PrismaExerciseAxesService }],
  exports: [EXERCISE_AXES],
})
export class SkillsModule {}
