import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { LookupSchoolUserQuery } from './lookup-school-user.query.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { UserLookupRateLimitedException } from '../../../domain/exceptions/user-lookup-rate-limited.exception.js';
import { mayLookUpUsers, schoolUserLookupOf, type SchoolUserLookup } from '../../../domain/school-user-lookup.policy.js';
import { USER_EMAIL_LOOKUP, type IUserEmailLookup } from '../../ports/user-email-lookup.port.js';
import { LOOKUP_RATE_LIMITER, type ILookupRateLimiter } from '../../ports/lookup-rate-limiter.port.js';

/**
 * "Does this address have an account" — asked by a school's own people while adding someone
 * (enrol a student, add a teacher, invite). The school must be active (adding is a write), the
 * asker one of `mayLookUpUsers`, and each lookup counts against the asker's limit. The answer
 * carries what the dialogs branch on, not the account's roles (plan 90, session 16 remark 4).
 */
@QueryHandler(LookupSchoolUserQuery)
export class LookupSchoolUserHandler implements IQueryHandler<LookupSchoolUserQuery, SchoolUserLookup> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
    @Inject(USER_EMAIL_LOOKUP) private readonly lookup: IUserEmailLookup,
    @Inject(LOOKUP_RATE_LIMITER) private readonly rateLimiter: ILookupRateLimiter,
  ) {}

  async execute({ schoolId, actorId, email }: LookupSchoolUserQuery): Promise<SchoolUserLookup> {
    const school = await this.schools.findById(schoolId);
    if (!school || !school.isReadableBy(actorId)) throw new SchoolNotFoundException(schoolId);
    if (!mayLookUpUsers(school.roleOf(actorId))) {
      throw new ForbiddenOperationException('Only the school owner, admins, managers and teachers can look up users');
    }
    school.assertWritable();

    const quota = await this.rateLimiter.consume(actorId);
    if (!quota.allowed) throw new UserLookupRateLimitedException(quota.retryAfterMs);

    return schoolUserLookupOf(await this.lookup.findByEmail(email.trim()));
  }
}
