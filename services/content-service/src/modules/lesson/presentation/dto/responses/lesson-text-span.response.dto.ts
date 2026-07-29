import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';
import type { LessonTextSpanEntity } from '../../../domain/entities/lesson-text-span.entity.js';
import type { TextSpanView } from '../../../application/queries/get-text-spans/get-text-spans.handler.js';

export class SpanAnchorCandidateDto {
  @ApiProperty({ example: 2 })
  paragraphIndex: number;

  @ApiProperty({ example: 41 })
  charStart: number;

  @ApiProperty({ example: 53 })
  charEnd: number;
}

export class LessonTextSpanResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  id: string;

  @ApiProperty({ example: 3 })
  paragraphIndex: number;

  @ApiProperty({ example: 12 })
  charStart: number;

  @ApiProperty({ example: 24 })
  charEnd: number;

  @ApiProperty({ enum: LessonSpanKind, example: LessonSpanKind.VOCAB })
  kind: LessonSpanKind;

  @ApiPropertyOptional({ example: 'uuid-of-vocabulary-item', nullable: true })
  refId: string | null;

  @ApiProperty({
    example: 'sykepleieren',
    description: 'The text the author selected, as it read at that moment',
  })
  textSnapshot: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  note: string | null;

  @ApiProperty({
    example: false,
    description:
      'True when the anchor no longer holds; broken spans are never rendered to students',
  })
  broken: boolean;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    enum: ['offset', 'ref'],
    description:
      "'offset' — the body moved under it; 'ref' — its vocabulary item or grammar rule is gone",
  })
  brokenReason: 'offset' | 'ref' | null;

  @ApiProperty({
    type: [SpanAnchorCandidateDto],
    description:
      'Where the snapshot text occurs in the current body. Empty unless broken; a one-click repair is only safe when there is exactly one.',
  })
  reanchorCandidates: SpanAnchorCandidateDto[];

  static from(view: TextSpanView): LessonTextSpanResponseDto {
    const dto = LessonTextSpanResponseDto.fromEntity(view.span);
    dto.broken = view.brokenReason !== null;
    dto.brokenReason = view.brokenReason;
    dto.reanchorCandidates = view.reanchorCandidates;
    return dto;
  }

  /** Write responses return a span that was just validated against the body. */
  static fromEntity(span: LessonTextSpanEntity): LessonTextSpanResponseDto {
    const dto = new LessonTextSpanResponseDto();
    dto.id = span.id;
    dto.paragraphIndex = span.paragraphIndex;
    dto.charStart = span.charStart;
    dto.charEnd = span.charEnd;
    dto.kind = span.kind;
    dto.refId = span.refId;
    dto.textSnapshot = span.textSnapshot;
    dto.note = span.note;
    dto.broken = false;
    dto.brokenReason = null;
    dto.reanchorCandidates = [];
    return dto;
  }
}
