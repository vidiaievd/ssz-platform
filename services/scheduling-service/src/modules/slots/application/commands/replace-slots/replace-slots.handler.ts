import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { ReplaceSlotsCommand } from './replace-slots.command.js';
import { SLOT_REPOSITORY, type ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';
import { LessonGeneratorService } from '../../services/lesson-generator.service.js';
import { OrgServiceHttpClient } from '../../../../../infrastructure/org/org-service.http-client.js';
import type { Slot } from '../../../domain/entities/slot.entity.js';

@CommandHandler(ReplaceSlotsCommand)
export class ReplaceSlotsHandler implements ICommandHandler<ReplaceSlotsCommand, Slot[]> {
  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slots: ISlotRepository,
    private readonly lessonGenerator: LessonGeneratorService,
    private readonly orgClient: OrgServiceHttpClient,
  ) {}

  async execute(cmd: ReplaceSlotsCommand): Promise<Slot[]> {
    const [group, teachers] = await Promise.all([
      this.orgClient.getGroup(cmd.schoolId, cmd.groupId),
      this.orgClient.getGroupTeachers(cmd.schoolId, cmd.groupId),
    ]);
    if (!group) throw new NotFoundException(`Group ${cmd.groupId} not found in school ${cmd.schoolId}`);

    await this.slots.deleteByGroup(cmd.groupId);

    const created = await this.slots.createMany(
      cmd.slots.map((s) => ({
        groupId: cmd.groupId,
        schoolId: cmd.schoolId,
        weekday: s.weekday,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room ?? null,
      })),
    );

    // The pattern changed, so the part of the plan that has not happened yet is
    // re-laid over the new slots. What the group already lived through — lessons
    // held, cancelled, or added by hand — is left alone, and a teacher is no
    // longer required: an unassigned session is a legal one.
    const primaryTeacher = teachers.find((t) => t.role === 'primary');
    if (group.startDate) {
      await this.lessonGenerator.regenerateTail({
        groupId: cmd.groupId,
        schoolId: cmd.schoolId,
        teacherId: primaryTeacher?.userId ?? null,
        slots: created,
        courseId: group.courseId ?? null,
        startDate: new Date(group.startDate),
      });
    }

    return created;
  }
}
