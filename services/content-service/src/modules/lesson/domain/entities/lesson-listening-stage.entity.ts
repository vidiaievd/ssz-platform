import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { LessonDomainError } from '../exceptions/lesson-domain.exceptions.js';
import { ListeningStageType } from '../value-objects/listening-stage-type.vo.js';

interface LessonListeningStageProps {
  lessonContentVariantId: string;
  exerciseId: string;
  position: number;
  stageType: ListeningStageType;
  createdAt: Date;
}

export interface CreateLessonListeningStageProps {
  lessonContentVariantId: string;
  exerciseId: string;
  position: number;
  stageType: ListeningStageType;
}

export class LessonListeningStageEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: LessonListeningStageProps,
  ) {
    super(id);
  }

  get lessonContentVariantId(): string {
    return this.props.lessonContentVariantId;
  }
  get exerciseId(): string {
    return this.props.exerciseId;
  }
  get position(): number {
    return this.props.position;
  }
  get stageType(): ListeningStageType {
    return this.props.stageType;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  static create(
    p: CreateLessonListeningStageProps,
    id?: string,
  ): Result<LessonListeningStageEntity, LessonDomainError> {
    if (p.position < 0) {
      return Result.fail(LessonDomainError.INVALID_STAGE_DATA);
    }

    const entity = new LessonListeningStageEntity(id ?? randomUUID(), {
      lessonContentVariantId: p.lessonContentVariantId,
      exerciseId: p.exerciseId,
      position: p.position,
      stageType: p.stageType,
      createdAt: new Date(),
    });

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: LessonListeningStageProps): LessonListeningStageEntity {
    return new LessonListeningStageEntity(id, props);
  }
}
