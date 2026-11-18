import { randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { adminAuditEntry, type AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import { SchoolNotFoundException } from '../../../schools/domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../schools/domain/exceptions/forbidden-operation.exception.js';
import { SchoolLifecycleChangedEvent } from '../../domain/events/school-lifecycle-changed.event.js';
import {
  SCHOOL_LIFECYCLE_REPOSITORY,
  type ISchoolLifecycleRepository,
} from '../../domain/school-lifecycle.repository.js';
import {
  auditSnapshot,
  changeSchoolStatus,
  SCHOOL_TRANSITION_RULES,
  type LifecycleTerms,
  type SchoolLifecycleState,
  type SchoolStatusChange,
} from '../../domain/school-lifecycle.js';
import { SchoolTransitionNotAllowedException } from '../../domain/school-transition-not-allowed.exception.js';
import { ChangeSchoolStatusCommand } from './change-school-status.command.js';

export const LIFECYCLE_TERMS = Symbol('LifecycleTerms');

/** Clock port, so tests pin `now`. */
export const LIFECYCLE_CLOCK = Symbol('LifecycleClock');
export type LifecycleClock = () => Date;

@CommandHandler(ChangeSchoolStatusCommand)
export class ChangeSchoolStatusHandler implements ICommandHandler<ChangeSchoolStatusCommand, SchoolLifecycleState> {
  constructor(
    @Inject(SCHOOL_LIFECYCLE_REPOSITORY) private readonly repository: ISchoolLifecycleRepository,
    @Inject(LIFECYCLE_TERMS) private readonly terms: LifecycleTerms,
    @Inject(LIFECYCLE_CLOCK) private readonly clock: LifecycleClock,
  ) {}

  async execute(command: ChangeSchoolStatusCommand): Promise<SchoolLifecycleState> {
    const { schoolId, transition, actor } = command;
    const reason = command.reason?.trim() || null;
    if (actor.kind === 'admin' && !reason) {
      // The DTO refuses an empty reason first; this keeps any other caller honest.
      throw new Error('An admin move needs a reason');
    }

    const state = await this.repository.find(schoolId);
    if (!state) throw new SchoolNotFoundException(schoolId);

    const result = changeSchoolStatus(state, transition, actor, reason, this.clock(), this.terms);
    if (result.isErr) {
      const error = result.error;
      if (error instanceof SchoolTransitionNotAllowedException) throw error;
      // The route's guard admits only the level the table names, and only the owner reaches the
      // owner's path — getting here means a caller skipped its own check.
      throw new ForbiddenOperationException(
        actor.kind === 'owner' ? 'Only the owner can delete the school' : error.message,
      );
    }

    const change = result.value;
    const events = change.eventType ? [new SchoolLifecycleChangedEvent(randomUUID(), change.eventType, change)] : [];
    const audit = actor.kind === 'admin' ? auditOf(change, reason!) : null;

    const applied = await this.repository.apply(change, events, audit);
    if (!applied) {
      // Moved by someone else between our read and our write: answer with where it stands now.
      const now = await this.repository.find(schoolId);
      if (!now) throw new SchoolNotFoundException(schoolId);
      throw new SchoolTransitionNotAllowedException(schoolId, transition, now.status);
    }
    return change.after;
  }
}

function auditOf(change: SchoolStatusChange, reason: string): AdminAuditEntry {
  if (change.actor.kind !== 'admin') throw new Error('Only an admin move is audited');
  return adminAuditEntry({
    actor: { userId: change.actor.userId, level: change.actor.level },
    action: SCHOOL_TRANSITION_RULES[change.transition].action,
    targetType: 'school',
    targetId: change.after.schoolId,
    reason,
    before: auditSnapshot(change.before),
    after: auditSnapshot(change.after),
    now: change.at,
  });
}
