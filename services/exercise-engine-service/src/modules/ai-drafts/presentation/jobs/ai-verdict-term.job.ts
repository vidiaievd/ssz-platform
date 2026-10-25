import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus } from '@nestjs/cqrs';
import { IntervalJob } from '../../../../common/jobs/interval-job.js';
import type { AppConfig } from '../../../../config/configuration.js';
import { AcceptAiVerdictsAtTermCommand } from '../../application/commands/accept-ai-verdicts-at-term/accept-ai-verdicts-at-term.command.js';

/**
 * Closes school work whose model verdict ran out of term (plan 80, step 4). A timer rather
 * than something a request triggers: the term runs out while nobody is asking, which is the
 * whole point of having one.
 */
@Injectable()
export class AiVerdictTermJob extends IntervalJob {
  private readonly batch: number;

  constructor(
    private readonly commandBus: CommandBus,
    config: ConfigService<AppConfig>,
  ) {
    const terms = config.get<AppConfig['reviewTerms']>('reviewTerms')!;
    super(terms.intervalMs);
    this.batch = terms.batch;
  }

  protected async tick(): Promise<void> {
    await this.commandBus.execute(new AcceptAiVerdictsAtTermCommand(new Date(), this.batch));
  }
}
