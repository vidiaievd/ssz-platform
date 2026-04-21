import { Entity } from '../../../../shared/domain/entity.base.js';
import { MediaRefType } from '../value-objects/media-ref-type.vo.js';

export interface LessonVariantMediaRefProps {
  lessonContentVariantId: string;
  mediaId: string;
  mediaType: MediaRefType;
  positionInText: number;
  extractedAt: Date;
}

export class LessonVariantMediaRefEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: LessonVariantMediaRefProps,
  ) {
    super(id);
  }

  get lessonContentVariantId(): string {
    return this.props.lessonContentVariantId;
  }
  get mediaId(): string {
    return this.props.mediaId;
  }
  get mediaType(): MediaRefType {
    return this.props.mediaType;
  }
  get positionInText(): number {
    return this.props.positionInText;
  }
  get extractedAt(): Date {
    return this.props.extractedAt;
  }

  static reconstitute(id: string, props: LessonVariantMediaRefProps): LessonVariantMediaRefEntity {
    return new LessonVariantMediaRefEntity(id, props);
  }
}
