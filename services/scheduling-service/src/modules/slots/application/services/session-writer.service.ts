import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  LESSON_REPOSITORY,
  type ILessonRepository,
  type LessonPatch,
} from '../../domain/repositories/lesson.repository.interface.js';
import {
  CURRICULUM_PLAN_READER,
  type ICurriculumPlanReader,
} from '../ports/curriculum-plan.reader.js';
import { SessionAccessService } from './session-access.service.js';
import { utcMidnight } from './session-plan.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { Lesson, LessonScore, LessonType } from '../../domain/entities/lesson.entity.js';

/** A change to a session, as the caller expressed it: absent means "leave alone". */
export interface SessionChanges {
  type?: LessonType;
  status?: Lesson['status'];
  date?: string;
  startTime?: string;
  endTime?: string;
  room?: string | null;
  teacherId?: string | null;
  contentUnitId?: string | null;
  contentLessonId?: string | null;
  curriculumUnitId?: string | null;
  attendance?: number | null;
  note?: string | null;
  passMark?: number | null;
}

export interface NewSessionInput {
  groupId: string;
  schoolId: string;
  date: string;
  startTime: string;
  endTime: string;
  type?: LessonType;
  room?: string | null;
  teacherId?: string | null;
  contentUnitId?: string | null;
  contentLessonId?: string | null;
  note?: string | null;
}

/**
 * Writes to a single session, and the rules that go with it. Lives here rather
 * than in a controller because two doors lead to it — the sessions API and the
 * older lesson API — and one set of rules has to answer both.
 */
@Injectable()
export class SessionWriterService {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    @Inject(CURRICULUM_PLAN_READER) private readonly plan: ICurriculumPlanReader,
    private readonly access: SessionAccessService,
  ) {}

  async find(sessionId: string): Promise<Lesson> {
    const session = await this.lessons.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async patch(
    sessionId: string,
    changes: SessionChanges,
    user: AuthenticatedUser,
  ): Promise<Lesson> {
    const session = await this.find(sessionId);
    await this.access.requireCanPatch(session, present(changes), user);

    const patch = await this.toPatch(session, changes);
    this.assertCoherent(session, patch);

    return this.lessons.update(sessionId, patch);
  }

  async create(input: NewSessionInput, user: AuthenticatedUser): Promise<Lesson> {
    const type = input.type ?? 'lesson';
    await this.access.requireCanCreate(input.schoolId, type, input.teacherId ?? null, user);
    this.assertTimes(input.startTime, input.endTime);

    const contentUnitId = input.contentUnitId ?? null;
    return this.lessons.create({
      groupId: input.groupId,
      schoolId: input.schoolId,
      // No slot: an extra session is by definition not an occurrence of one.
      slotId: null,
      date: new Date(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
      teacherId: input.teacherId ?? null,
      room: input.room ?? null,
      status: 'scheduled',
      type,
      curriculumUnitId: contentUnitId
        ? ((await this.stitchedUnit(input.groupId, contentUnitId)) ?? null)
        : null,
      contentUnitId,
      contentLessonId: input.contentLessonId ?? null,
      attendance: null,
      note: input.note ?? null,
      extra: true,
      // Absent from the generated plan, so it holds no position in it.
      planIndex: null,
      passMark: null,
    });
  }

  async remove(sessionId: string, user: AuthenticatedUser): Promise<void> {
    const session = await this.find(sessionId);
    await this.access.requireManager(session.schoolId, user);

    if (!session.extra) {
      throw new ConflictException(
        'This session belongs to the course plan. Cancel it instead of deleting it.',
      );
    }
    await this.lessons.delete(sessionId);
  }

  async putScores(
    sessionId: string,
    scores: LessonScore[],
    user: AuthenticatedUser,
  ): Promise<Lesson> {
    const session = await this.find(sessionId);
    await this.access.requireCanGrade(session, user);

    if (session.type !== 'exam') {
      throw new BadRequestException('Only an exam has results. Change the session type first.');
    }
    const seen = new Set<string>();
    for (const { studentId } of scores) {
      if (seen.has(studentId)) throw new BadRequestException(`Two marks for student ${studentId}`);
      seen.add(studentId);
    }

    return this.lessons.replaceScores(sessionId, scores);
  }

  /**
   * Translates the request into a patch. The plan unit follows the course unit
   * unless the caller names one: progress is counted per plan unit, so someone
   * who moves a session to another course unit means the progress to move too.
   */
  private async toPatch(session: Lesson, changes: SessionChanges): Promise<LessonPatch> {
    const patch: LessonPatch = {};

    if (changes.type !== undefined) patch.type = changes.type;
    if (changes.status !== undefined) patch.status = changes.status;
    if (changes.date !== undefined) patch.date = new Date(changes.date);
    if (changes.startTime !== undefined) patch.startTime = changes.startTime;
    if (changes.endTime !== undefined) patch.endTime = changes.endTime;
    if (changes.room !== undefined) patch.room = changes.room;
    if (changes.teacherId !== undefined) patch.teacherId = changes.teacherId;
    if (changes.contentLessonId !== undefined) patch.contentLessonId = changes.contentLessonId;
    if (changes.attendance !== undefined) patch.attendance = changes.attendance;
    if (changes.note !== undefined) patch.note = changes.note;
    if (changes.passMark !== undefined) patch.passMark = changes.passMark;

    if (changes.contentUnitId !== undefined) {
      patch.contentUnitId = changes.contentUnitId;
      if (changes.curriculumUnitId === undefined) {
        patch.curriculumUnitId = changes.contentUnitId
          ? ((await this.stitchedUnit(session.groupId, changes.contentUnitId)) ?? null)
          : null;
      }
    }
    if (changes.curriculumUnitId !== undefined) patch.curriculumUnitId = changes.curriculumUnitId;

    return patch;
  }

  private assertCoherent(session: Lesson, patch: LessonPatch): void {
    this.assertTimes(patch.startTime ?? session.startTime, patch.endTime ?? session.endTime);

    // A past date only means the slot went by. Whether it happened is a person's
    // to say — but not before the day itself is over.
    if (patch.status === 'held' && isInTheFuture(patch.date ?? session.date)) {
      throw new BadRequestException('A session cannot be held before it happens.');
    }

    const type = patch.type ?? session.type;
    const attendance = patch.attendance !== undefined ? patch.attendance : session.attendance;
    if (type === 'exam' && attendance !== null) {
      throw new BadRequestException(
        'An exam records results, not attendance. Clear attendance first.',
      );
    }
  }

  private assertTimes(startTime: string, endTime: string): void {
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      throw new BadRequestException('A session must end after it starts.');
    }
  }

  private async stitchedUnit(groupId: string, contentUnitId: string): Promise<string | undefined> {
    const units = await this.plan.unitsForGroup(groupId);
    return units.find((u) => u.contentUnitId === contentUnitId)?.id;
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** A session's own day counts as past — it is held after the last bell, not the next day. */
function isInTheFuture(date: Date): boolean {
  return utcMidnight(date) > utcMidnight(new Date());
}

/** Only the fields the caller actually sent. */
function present(changes: SessionChanges): Record<string, unknown> {
  return Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
}
