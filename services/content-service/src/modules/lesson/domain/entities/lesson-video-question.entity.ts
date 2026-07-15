import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';

interface LessonVideoQuestionProps {
  lessonContentVariantId: string;
  exerciseId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLessonVideoQuestionProps {
  lessonContentVariantId: string;
  exerciseId: string;
}

export class LessonVideoQuestionEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: LessonVideoQuestionProps,
  ) {
    super(id);
  }

  get lessonContentVariantId(): string {
    return this.props.lessonContentVariantId;
  }
  get exerciseId(): string {
    return this.props.exerciseId;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(p: CreateLessonVideoQuestionProps, id?: string): LessonVideoQuestionEntity {
    const now = new Date();
    return new LessonVideoQuestionEntity(id ?? randomUUID(), {
      lessonContentVariantId: p.lessonContentVariantId,
      exerciseId: p.exerciseId,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(id: string, props: LessonVideoQuestionProps): LessonVideoQuestionEntity {
    return new LessonVideoQuestionEntity(id, props);
  }
}
