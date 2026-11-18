import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../domain/repositories/school.repository.interface.js';
import { assertSchoolWritable } from '../../domain/school-access.policy.js';

export const ALLOW_INACTIVE_SCHOOL_KEY = 'allowInactiveSchool';

/**
 * Marks a write route that a school which is not `active` still answers — the owner's
 * "delete school" archives a suspended school too (plan 90, phase 5).
 */
export const AllowInactiveSchool = () => SetMetadata(ALLOW_INACTIVE_SCHOOL_KEY, true);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read only for a school that is not `active` (plan 90, phase 5, step 3): every write route of a
 * school-scoped controller (`schools/:schoolId/…`, `schools/:id/…`) is refused with 409
 * `SCHOOL_NOT_ACTIVE { status }` before its handler runs. Reads pass; so does a school that
 * does not exist (the handler answers 404) and a malformed id (the route's pipe answers 400).
 *
 * Writes that reach a school without its id in the path — an invitation accepted by token, a
 * tutor's invitations to their own workspace — are refused by the aggregate itself
 * (`School.assertWritable`). The seat claim checks the status inside its own transaction.
 */
@Injectable()
export class ActiveSchoolGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (READ_METHODS.has(request.method.toUpperCase())) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_SCHOOL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    const schoolId = request.params?.schoolId ?? request.params?.id;
    if (typeof schoolId !== 'string' || !UUID.test(schoolId)) return true;

    const status = await this.schools.findStatus(schoolId);
    if (status !== null) assertSchoolWritable(schoolId, status);
    return true;
  }
}
