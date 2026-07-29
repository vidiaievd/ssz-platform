import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';

export class CreateTextSpanCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly paragraphIndex: number,
    public readonly charStart: number,
    public readonly charEnd: number,
    public readonly kind: LessonSpanKind,
    public readonly refId: string | null,
    public readonly note: string | null,
  ) {}
}
