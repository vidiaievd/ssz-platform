import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject } from "@nestjs/common";
import { GetReviewEffortMinutesQuery } from "./get-review-effort-minutes.query.js";
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from "../../../domain/repositories/school.repository.interface.js";
import { SchoolNotFoundException } from "../../../domain/exceptions/school-not-found.exception.js";
import type {
  ReviewEffortMinutes,
  ReviewEffortMinutesEntry,
  ReviewEffortMinutesSource,
} from "../../../domain/value-objects/review-effort-minutes.vo.js";

export interface ReviewEffortMinutesDto {
  /** Every factory template plus every one the school set, sorted by code. */
  templates: ReviewEffortMinutesEntry[];
  /** For a template on neither list. */
  other: { minutes: number; source: ReviewEffortMinutesSource };
}

export function toReviewEffortMinutesDto(
  minutes: ReviewEffortMinutes,
): ReviewEffortMinutesDto {
  return { templates: minutes.entries, other: minutes.otherEntry };
}

/**
 * The whole table, factory values filled in, each figure saying whose it is — so neither
 * the settings screen nor exercise-engine needs a copy of the factory values.
 *
 * No authorisation of its own, like the response promise: a school's guess at how long
 * marking takes is no secret from its own staff, and the engine reads it to forecast.
 */
@QueryHandler(GetReviewEffortMinutesQuery)
export class GetReviewEffortMinutesHandler implements IQueryHandler<GetReviewEffortMinutesQuery> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
  ) {}

  async execute(
    query: GetReviewEffortMinutesQuery,
  ): Promise<ReviewEffortMinutesDto> {
    const minutes = await this.schools.findReviewEffortMinutes(query.schoolId);
    if (!minutes) throw new SchoolNotFoundException(query.schoolId);
    return toReviewEffortMinutesDto(minutes);
  }
}
