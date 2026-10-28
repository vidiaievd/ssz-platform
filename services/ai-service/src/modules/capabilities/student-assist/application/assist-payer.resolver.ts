import { Inject, Injectable } from '@nestjs/common';
import type { Payer } from '../../../access/domain/payer.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { AssistContext } from '../domain/assist-answer.js';
import {
  ATTEMPT_SCOPE_READER,
  CLASS_SESSION_READER,
  ENROLLMENT_READER,
  GROUP_ROSTER_READER,
  STUDENT_STANDING_READER,
  type IAttemptScopeReader,
  type IClassSessionReader,
  type IEnrollmentReader,
  type IGroupRosterReader,
  type IStudentStandingReader,
} from './ports/assist-readers.js';

export interface AssistTurnRequest {
  userId: string;
  context: AssistContext;
}

/**
 * What a turn may read and who pays for it. `context` is the client's, with the course
 * pinned by the server: a submission's course is its attempt's, whatever the client sent.
 */
export interface AssistAccess {
  payer: Payer;
  context: AssistContext;
}

/**
 * Why a turn is not started — the learner's request, not an outage:
 * - `invalid_context` — the context lacks what its kind needs (422);
 * - `not_found` — no such submission or class of this learner; someone else's reads the same (404);
 * - `not_enrolled` — the learner does not hold the course (403): no free reading of others' material.
 */
export type AssistAccessError =
  | { code: 'invalid_context'; message: string }
  | { code: 'not_found' }
  | { code: 'not_enrolled' };

/**
 * Settles who pays for a turn of `student_assist` and whether the learner may ask in this
 * context at all (plan 83, step 3; 48 §3). The tools read only within what this lets
 * through, so every check the tools do not make is made here:
 *
 * - a course in the context → the learner must hold it (active or completed). The workspace
 *   (school or tutor) pays only for an **active** enrolment filed under it, of a learner who
 *   is still its **active student**; anything else — self-study, a finished course, a former
 *   student, staff — goes to the learner's own plan, and the gate refuses there if that plan
 *   lacks the key. Learning-service files a public course under no workspace;
 * - a submission → it must be the learner's, and its course is the attempt's;
 * - a class → the learner must be in the session's group, and the session's workspace pays —
 *   the class is that workspace's work, even when the course came to the learner otherwise;
 * - no course (a free question, a word outside a course) → the learner's own plan (Q3 = A),
 *   never a school's: a school pays only for work in its course.
 *
 * Not a `PayerResolver`: it can refuse. A reader that could not be asked throws, and the
 * caller answers 503 rather than guessing a payer.
 */
@Injectable()
export class AssistPayerResolver {
  constructor(
    @Inject(ENROLLMENT_READER) private readonly enrollments: IEnrollmentReader,
    @Inject(ATTEMPT_SCOPE_READER) private readonly attempts: IAttemptScopeReader,
    @Inject(CLASS_SESSION_READER) private readonly classes: IClassSessionReader,
    @Inject(GROUP_ROSTER_READER) private readonly rosters: IGroupRosterReader,
    @Inject(STUDENT_STANDING_READER) private readonly standing: IStudentStandingReader,
  ) {}

  async resolve(request: AssistTurnRequest): Promise<Result<AssistAccess, AssistAccessError>> {
    const { userId } = request;
    const invalid = missing(request.context);
    if (invalid) return Result.fail({ code: 'invalid_context', message: invalid });

    let context = request.context;
    if (context.kind === 'submission') {
      const scope = await this.attempts.attemptScope(context.attemptId!, userId);
      if (!scope) return Result.fail({ code: 'not_found' });
      context = withCourse(context, scope.courseId);
    }

    if (context.kind === 'class') {
      const session = await this.classes.session(context.lessonId!);
      if (!session) return Result.fail({ code: 'not_found' });
      const members = await this.rosters.members(session.schoolId, session.groupId);
      if (!members?.includes(userId)) return Result.fail({ code: 'not_found' });
      if (context.courseId && !(await this.enrollments.enrollment(userId, context.courseId))) {
        return Result.fail({ code: 'not_enrolled' });
      }
      return Result.ok({ payer: { type: 'workspace', id: session.schoolId }, context });
    }

    if (!context.courseId) return Result.ok({ payer: { type: 'user', id: userId }, context });

    const enrollment = await this.enrollments.enrollment(userId, context.courseId);
    if (!enrollment) return Result.fail({ code: 'not_enrolled' });
    const schoolId = enrollment.status === 'active' ? enrollment.schoolId : null;
    const schoolPays = schoolId !== null && (await this.standing.isActiveStudent(schoolId, userId));
    const payer: Payer = schoolPays ? { type: 'workspace', id: schoolId } : { type: 'user', id: userId };
    return Result.ok({ payer, context });
  }
}

/** What a context of its kind cannot do without; null when it is whole. */
function missing(context: AssistContext): string | null {
  switch (context.kind) {
    case 'unit':
      return context.courseId && context.unitId ? null : 'A unit context needs courseId and unitId';
    case 'submission':
      return context.attemptId ? null : 'A submission context needs attemptId';
    case 'class':
      return context.lessonId ? null : 'A class context needs lessonId';
    case 'word':
      return context.lemma ? null : 'A word context needs lemma';
    case 'free':
      return null;
    default:
      return 'Unknown context kind';
  }
}

function withCourse(context: AssistContext, courseId: string | null): AssistContext {
  const { courseId: _sent, ...rest } = context;
  return courseId ? { ...rest, courseId } : rest;
}
