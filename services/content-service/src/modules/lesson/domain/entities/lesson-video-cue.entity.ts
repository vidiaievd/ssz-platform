import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { LessonDomainError } from '../exceptions/lesson-domain.exceptions.js';

interface LessonVideoCueProps {
  lessonContentVariantId: string;
  position: number;
  startSeconds: number;
  targetLine: string;
  translationLine: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLessonVideoCueProps {
  lessonContentVariantId: string;
  position: number;
  startSeconds: number;
  targetLine: string;
  translationLine?: string;
}

export class LessonVideoCueEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: LessonVideoCueProps,
  ) {
    super(id);
  }

  get lessonContentVariantId(): string {
    return this.props.lessonContentVariantId;
  }
  get position(): number {
    return this.props.position;
  }
  get startSeconds(): number {
    return this.props.startSeconds;
  }
  get targetLine(): string {
    return this.props.targetLine;
  }
  get translationLine(): string | null {
    return this.props.translationLine;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create(
    p: CreateLessonVideoCueProps,
    id?: string,
  ): Result<LessonVideoCueEntity, LessonDomainError> {
    if (!p.targetLine?.trim()) {
      return Result.fail(LessonDomainError.INVALID_CUE_DATA);
    }
    if (p.position < 0 || p.startSeconds < 0) {
      return Result.fail(LessonDomainError.INVALID_CUE_DATA);
    }

    const now = new Date();
    const entity = new LessonVideoCueEntity(id ?? randomUUID(), {
      lessonContentVariantId: p.lessonContentVariantId,
      position: p.position,
      startSeconds: p.startSeconds,
      targetLine: p.targetLine,
      translationLine: p.translationLine ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return Result.ok(entity);
  }

  static reconstitute(id: string, props: LessonVideoCueProps): LessonVideoCueEntity {
    return new LessonVideoCueEntity(id, props);
  }
}
