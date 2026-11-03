import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ProsodyLayer } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import { MarkdownParagraphSplitterService } from '../../../../lesson/domain/services/markdown-paragraph-splitter.service.js';
import type { ProsodyError } from '../../../domain/prosody-error.js';
import { PROSODY_LAYER_REPOSITORY } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import { PROSODY_TEXT_READER } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import { layerForText, splitLayer, studentLayer } from '../../../domain/services/prosody-view.js';
import { GetLessonProsodyQuery } from './get-lesson-prosody.query.js';

export interface LessonProsodyView {
  /** One entry per paragraph of the reader (`MarkdownParagraphSplitterService`), anchors local to it. */
  paragraphs: { paragraphIndex: number; text: string; layer: ProsodyLayer }[];
}

/**
 * The reader's layer of a TEXT lesson, fetched only when the student turns a prosody
 * switch on (§4a, decision 3). The layer is stored over the whole body and cut into the
 * paragraphs the reader draws, so the client never counts tokens across paragraphs.
 */
@QueryHandler(GetLessonProsodyQuery)
export class GetLessonProsodyHandler implements IQueryHandler<
  GetLessonProsodyQuery,
  Result<LessonProsodyView, ProsodyError>
> {
  constructor(
    @Inject(PROSODY_TEXT_READER) private readonly texts: IProsodyTextReader,
    @Inject(PROSODY_LAYER_REPOSITORY) private readonly layers: IProsodyLayerRepository,
  ) {}

  async execute(query: GetLessonProsodyQuery): Promise<Result<LessonProsodyView, ProsodyError>> {
    const body = await this.texts.lessonBody(query.lessonId, query.variantId);
    if (body.isFail) return Result.fail(body.error);

    const stored = await this.layers.find({
      kind: 'lesson',
      lessonId: query.lessonId,
      variantId: query.variantId,
    });
    const whole = studentLayer(body.value, layerForText(stored, body.value));
    const paragraphs = MarkdownParagraphSplitterService.split(body.value);
    const layers = splitLayer(body.value, whole, paragraphs);

    return Result.ok({
      paragraphs: layers.map((layer, paragraphIndex) => ({
        paragraphIndex,
        text: paragraphs[paragraphIndex],
        layer,
      })),
    });
  }
}
