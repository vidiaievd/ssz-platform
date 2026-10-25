import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { SchoolTermSummary, TermTally } from '../domain/attribution.js';
import { GetSchoolReviewTermsQuery, GetTeacherReviewTermsQuery } from './get-school-review-terms.query.js';
import { ReviewTermReader } from './review-term-reader.js';

export interface SchoolReviewTermsResult extends SchoolTermSummary {
  from: string;
  to: string;
}

export interface TeacherReviewTermsResult extends TermTally {
  from: string;
  to: string;
  teacherId: string;
}

/** The school's journal: totals, each work once, and the same work per answerable teacher. */
@QueryHandler(GetSchoolReviewTermsQuery)
@Injectable()
export class GetSchoolReviewTermsHandler
  implements IQueryHandler<GetSchoolReviewTermsQuery, SchoolReviewTermsResult>
{
  constructor(private readonly reader: ReviewTermReader) {}

  async execute(query: GetSchoolReviewTermsQuery): Promise<SchoolReviewTermsResult> {
    const summary = await this.reader.summarize(query.schoolId, query.from, query.to);
    return { from: query.from, to: query.to, ...summary };
  }
}

/**
 * One teacher's line: "counted at the term: N, of them you gave a verdict on: M" (R4).
 *
 * Unlike the school's, it has nothing to say without the assignments — a zero would read as
 * "none of it was yours" — so an unreachable organization is a 503 here.
 */
@QueryHandler(GetTeacherReviewTermsQuery)
@Injectable()
export class GetTeacherReviewTermsHandler
  implements IQueryHandler<GetTeacherReviewTermsQuery, TeacherReviewTermsResult>
{
  constructor(private readonly reader: ReviewTermReader) {}

  async execute(query: GetTeacherReviewTermsQuery): Promise<TeacherReviewTermsResult> {
    const { teachers } = await this.reader.summarize(query.schoolId, query.from, query.to);
    if (teachers === null) {
      throw new ServiceUnavailableException('Group teachers could not be read from organization-service');
    }
    const mine = teachers.find((t) => t.userId === query.teacherId);
    return {
      from: query.from,
      to: query.to,
      teacherId: query.teacherId,
      accepted: mine?.accepted ?? 0,
      revised: mine?.revised ?? 0,
      overturned: mine?.overturned ?? 0,
    };
  }
}
