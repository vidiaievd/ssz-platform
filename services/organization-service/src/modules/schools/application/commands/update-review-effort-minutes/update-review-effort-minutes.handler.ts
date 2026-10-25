import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { Inject } from "@nestjs/common";
import { UpdateReviewEffortMinutesCommand } from "./update-review-effort-minutes.command.js";
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from "../../../domain/repositories/school.repository.interface.js";
import { SchoolNotFoundException } from "../../../domain/exceptions/school-not-found.exception.js";
import { ForbiddenOperationException } from "../../../domain/exceptions/forbidden-operation.exception.js";
import { MemberRole } from "../../../domain/value-objects/member-role.vo.js";
import { ReviewEffortMinutes } from "../../../domain/value-objects/review-effort-minutes.vo.js";
import {
  toReviewEffortMinutesDto,
  type ReviewEffortMinutesDto,
} from "../../queries/get-review-effort-minutes/get-review-effort-minutes.handler.js";

/**
 * Sets the school's minutes per submission, on the owner's or an administrator's word —
 * the people who set the rest of the review policy (plan 81, Q5). A teacher does not set
 * their own: the figure is what the school's forecast of their load is built on.
 */
@CommandHandler(UpdateReviewEffortMinutesCommand)
export class UpdateReviewEffortMinutesHandler implements ICommandHandler<UpdateReviewEffortMinutesCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schools: ISchoolRepository,
  ) {}

  async execute(
    command: UpdateReviewEffortMinutesCommand,
  ): Promise<ReviewEffortMinutesDto> {
    const school = await this.schools.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const canSet =
      command.actorId === school.ownerId || actorRole === MemberRole.ADMIN;
    if (!canSet) {
      throw new ForbiddenOperationException(
        "Only owner or admin can set review minutes",
      );
    }

    const minutes = ReviewEffortMinutes.create({
      templates: command.templates,
      other: command.other,
    });
    await this.schools.saveReviewEffortMinutes(school.id, minutes);
    return toReviewEffortMinutesDto(minutes);
  }
}
