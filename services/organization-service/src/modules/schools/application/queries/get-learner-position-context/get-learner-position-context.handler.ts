import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetLearnerReviewContextHandler } from '../get-learner-review-context/get-learner-review-context.handler.js';
import { GetLearnerReviewContextQuery } from '../get-learner-review-context/get-learner-review-context.query.js';
import { GetLearnerPositionContextQuery } from './get-learner-position-context.query.js';

export interface LearnerPositionContextResult {
  schoolId: string | null;
  groupId: string | null;
  groupName: string | null;
  /**
   * Whether this learner's school lets them be told where they stand.
   *
   * `true` for a learner in no school at all: there is no school to have an opinion, and
   * with no group there is no position to show either — the caller gets `groupId: null`
   * and stops there.
   */
  showGroupPositionToStudents: boolean;
}

/**
 * Which group a learner's "where do I stand" sentence is about, and whether their school
 * allows the sentence at all (plan 58, screen F).
 *
 * The group is chosen by the same rule that decides where their work goes for review —
 * literally the same handler, called rather than copied. A learner whose homework lands
 * in one group and whose position is read against another would be told about a class
 * they do not think of themselves as being in.
 */
@QueryHandler(GetLearnerPositionContextQuery)
@Injectable()
export class GetLearnerPositionContextHandler
  implements IQueryHandler<GetLearnerPositionContextQuery, LearnerPositionContextResult>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly reviewContext: GetLearnerReviewContextHandler,
  ) {}

  async execute(query: GetLearnerPositionContextQuery): Promise<LearnerPositionContextResult> {
    const context = await this.reviewContext.execute(
      new GetLearnerReviewContextQuery(query.userId, query.courseId),
    );

    if (context.schoolId === null) {
      return { ...context, showGroupPositionToStudents: true };
    }

    const school = await (this.prisma as any).school.findUnique({
      where: { id: context.schoolId },
      select: { showGroupPositionToStudents: true },
    });

    return {
      ...context,
      // A school the read could not find decides nothing; the caller still needs a group
      // before it shows anything, and the default is what every school starts with.
      showGroupPositionToStudents: school?.showGroupPositionToStudents ?? true,
    };
  }
}
