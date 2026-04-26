import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ASSIGNMENT_REPOSITORY, type IAssignmentRepository } from '../assignments/domain/repositories/assignment.repository.interface.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../shared/application/ports/clock.port.js';

export const MARK_OVERDUE_JOB = 'mark-overdue';

@Processor('assignments', { concurrency: 1 })
export class MarkOverdueAssignmentsWorker extends WorkerHost {
  private readonly logger = new Logger(MarkOverdueAssignmentsWorker.name);

  constructor(
    @Inject(ASSIGNMENT_REPOSITORY) private readonly repo: IAssignmentRepository,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== MARK_OVERDUE_JOB) return;

    const now = this.clock.now();
    const candidates = await this.repo.findOverdueCandidates(now);
    this.logger.log(`Found ${candidates.length} overdue candidate(s) at ${now.toISOString()}`);

    let marked = 0;
    for (const assignment of candidates) {
      const result = assignment.markOverdue();
      if (result.isOk) {
        await this.repo.save(assignment);
        for (const event of assignment.getDomainEvents()) {
          await this.publisher.publish(event.eventType, (event as any).payload);
        }
        assignment.clearDomainEvents();
        marked++;
      }
    }

    this.logger.log(`Marked ${marked} assignment(s) as OVERDUE`);
  }
}
