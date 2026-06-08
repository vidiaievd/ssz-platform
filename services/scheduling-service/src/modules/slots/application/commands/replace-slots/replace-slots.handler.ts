import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReplaceSlotsCommand } from './replace-slots.command.js';
import { SLOT_REPOSITORY, type ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';
import { LESSON_REPOSITORY, type ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import { LessonGeneratorService } from '../../services/lesson-generator.service.js';
import { OrgServiceHttpClient } from '../../../../../infrastructure/org/org-service.http-client.js';
import type { Slot } from '../../../domain/entities/slot.entity.js';

@CommandHandler(ReplaceSlotsCommand)
export class ReplaceSlotsHandler implements ICommandHandler<ReplaceSlotsCommand, Slot[]> {
  constructor(
    @Inject(SLOT_REPOSITORY) private readonly slots: ISlotRepository,
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    private readonly lessonGenerator: LessonGeneratorService,
    private readonly orgClient: OrgServiceHttpClient,
  ) {}

  async execute(cmd: ReplaceSlotsCommand): Promise<Slot[]> {
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

    // Regenerate lessons if group has term dates and a primary teacher
    const [group, teachers] = await Promise.all([
      this.orgClient.getGroup(cmd.schoolId, cmd.groupId),
      this.orgClient.getGroupTeachers(cmd.schoolId, cmd.groupId),
    ]);

    const primaryTeacher = teachers.find((t) => t.role === 'primary');
    if (group?.startDate && group.endDate && primaryTeacher) {
      await this.lessons.deleteFutureScheduled(cmd.groupId, new Date());
      await this.lessonGenerator.generate({
        groupId: cmd.groupId,
        schoolId: cmd.schoolId,
        teacherId: primaryTeacher.userId,
        slots: created,
        startDate: new Date(group.startDate),
        endDate: new Date(group.endDate),
      });
    }

    return created;
  }
}
