import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

// Infrastructure — Prisma repositories
import { PrismaGrammarRuleRepository } from './infrastructure/persistence/prisma-grammar-rule.repository.js';
import { PrismaGrammarRuleExplanationRepository } from './infrastructure/persistence/prisma-grammar-rule-explanation.repository.js';
import { PrismaGrammarRuleExercisePoolRepository } from './infrastructure/persistence/prisma-grammar-rule-exercise-pool.repository.js';
import { PrismaExerciseRepository } from '../exercise/infrastructure/persistence/prisma-exercise.repository.js';

// DI tokens
import { GRAMMAR_RULE_REPOSITORY } from './domain/repositories/grammar-rule.repository.interface.js';
import { GRAMMAR_RULE_EXPLANATION_REPOSITORY } from './domain/repositories/grammar-rule-explanation.repository.interface.js';
import { GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY } from './domain/repositories/grammar-rule-exercise-pool.repository.interface.js';
import { EXERCISE_REPOSITORY } from '../exercise/domain/repositories/exercise.repository.interface.js';

// Command handlers
import { CreateGrammarRuleHandler } from './application/commands/create-grammar-rule/create-grammar-rule.handler.js';
import { UpdateGrammarRuleHandler } from './application/commands/update-grammar-rule/update-grammar-rule.handler.js';
import { DeleteGrammarRuleHandler } from './application/commands/delete-grammar-rule/delete-grammar-rule.handler.js';
import { CreateExplanationHandler } from './application/commands/create-explanation/create-explanation.handler.js';
import { UpdateExplanationHandler } from './application/commands/update-explanation/update-explanation.handler.js';
import { PublishExplanationHandler } from './application/commands/publish-explanation/publish-explanation.handler.js';
import { DeleteExplanationHandler } from './application/commands/delete-explanation/delete-explanation.handler.js';
import { AddPoolEntryHandler } from './application/commands/add-pool-entry/add-pool-entry.handler.js';
import { UpdatePoolEntryHandler } from './application/commands/update-pool-entry/update-pool-entry.handler.js';
import { RemovePoolEntryHandler } from './application/commands/remove-pool-entry/remove-pool-entry.handler.js';
import { ReorderPoolHandler } from './application/commands/reorder-pool/reorder-pool.handler.js';

// Query handlers
import { GetGrammarRulesHandler } from './application/queries/get-grammar-rules/get-grammar-rules.handler.js';
import { GetGrammarRuleHandler } from './application/queries/get-grammar-rule/get-grammar-rule.handler.js';
import { GetGrammarRuleExplanationsHandler } from './application/queries/get-grammar-rule-explanations/get-grammar-rule-explanations.handler.js';
import { GetGrammarRuleExplanationHandler } from './application/queries/get-grammar-rule-explanation/get-grammar-rule-explanation.handler.js';
import { GetBestExplanationHandler } from './application/queries/get-best-explanation/get-best-explanation.handler.js';
import { GetPoolEntriesHandler } from './application/queries/get-pool-entries/get-pool-entries.handler.js';
import { GetRandomPoolExerciseHandler } from './application/queries/get-random-pool-exercise/get-random-pool-exercise.handler.js';

// Controller
import { GrammarRuleController } from './presentation/controllers/grammar-rule.controller.js';

const CommandHandlers = [
  CreateGrammarRuleHandler,
  UpdateGrammarRuleHandler,
  DeleteGrammarRuleHandler,
  CreateExplanationHandler,
  UpdateExplanationHandler,
  PublishExplanationHandler,
  DeleteExplanationHandler,
  AddPoolEntryHandler,
  UpdatePoolEntryHandler,
  RemovePoolEntryHandler,
  ReorderPoolHandler,
];

const QueryHandlers = [
  GetGrammarRulesHandler,
  GetGrammarRuleHandler,
  GetGrammarRuleExplanationsHandler,
  GetGrammarRuleExplanationHandler,
  GetBestExplanationHandler,
  GetPoolEntriesHandler,
  GetRandomPoolExerciseHandler,
];

@Module({
  imports: [CqrsModule],
  controllers: [GrammarRuleController],
  providers: [
    // Repository bindings
    { provide: GRAMMAR_RULE_REPOSITORY, useClass: PrismaGrammarRuleRepository },
    {
      provide: GRAMMAR_RULE_EXPLANATION_REPOSITORY,
      useClass: PrismaGrammarRuleExplanationRepository,
    },
    {
      provide: GRAMMAR_RULE_EXERCISE_POOL_REPOSITORY,
      useClass: PrismaGrammarRuleExercisePoolRepository,
    },
    { provide: EXERCISE_REPOSITORY, useClass: PrismaExerciseRepository },

    // CQRS handlers
    ...CommandHandlers,
    ...QueryHandlers,
  ],
})
export class GrammarRuleModule {}
