import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import type {
  LessonReaderContent,
  ReaderGlossaryEntry,
  ReaderListeningStage,
  ReaderParagraph,
  ReaderVideoCue,
  ReaderLiveInfo,
} from '../../../application/queries/get-lesson-reader-content/get-lesson-reader-content.handler.js';

export class LessonReaderContentResponseDto {
  @ApiProperty({ example: 'uuid-of-lesson' })
  lessonId: string;

  @ApiProperty({ enum: LessonKind })
  kind: LessonKind;

  @ApiProperty({ example: 'Å bo i Norge' })
  title: string;

  @ApiPropertyOptional()
  displayTitle: string | null;

  @ApiPropertyOptional({ description: 'Full markdown body, present for TEXT lessons only.' })
  bodyMarkdown: string | null;

  @ApiProperty({ type: [String] })
  mediaIds: string[];

  @ApiPropertyOptional({ description: 'Bilingual paragraphs, present for TEXT lessons only.' })
  paragraphs: ReaderParagraph[] | null;

  @ApiPropertyOptional({ description: 'Transcript cues, present for VIDEO lessons only.' })
  cues: ReaderVideoCue[] | null;

  @ApiPropertyOptional({ description: 'Listening transcript, present for AUDIO lessons only.' })
  transcript: string | null;

  @ApiPropertyOptional({
    description: 'Staged gap-fill/comprehension exercises, AUDIO lessons only.',
  })
  listeningStages: ReaderListeningStage[] | null;

  @ApiProperty({ description: 'Author-marked words resolved to translations, TEXT/VIDEO lessons.' })
  glossary: ReaderGlossaryEntry[];

  @ApiPropertyOptional({
    description: 'Externally-scheduled session reference, LIVE lessons only.',
  })
  live: ReaderLiveInfo | null;

  static from(content: LessonReaderContent): LessonReaderContentResponseDto {
    const dto = new LessonReaderContentResponseDto();
    dto.lessonId = content.lessonId;
    dto.kind = content.kind;
    dto.title = content.title;
    dto.displayTitle = content.displayTitle;
    dto.bodyMarkdown = content.bodyMarkdown;
    dto.mediaIds = content.mediaIds;
    dto.paragraphs = content.paragraphs;
    dto.cues = content.cues;
    dto.transcript = content.transcript;
    dto.listeningStages = content.listeningStages;
    dto.glossary = content.glossary;
    dto.live = content.live;
    return dto;
  }
}
