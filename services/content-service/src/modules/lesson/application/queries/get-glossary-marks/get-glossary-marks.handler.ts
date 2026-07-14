import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetGlossaryMarksQuery } from './get-glossary-marks.query.js';
import { LESSON_GLOSSARY_MARK_REPOSITORY } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type {
  GlossaryMarkRow,
  ILessonGlossaryMarkRepository,
} from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';

@QueryHandler(GetGlossaryMarksQuery)
export class GetGlossaryMarksHandler implements IQueryHandler<
  GetGlossaryMarksQuery,
  GlossaryMarkRow[]
> {
  constructor(
    @Inject(LESSON_GLOSSARY_MARK_REPOSITORY)
    private readonly markRepo: ILessonGlossaryMarkRepository,
  ) {}

  async execute(query: GetGlossaryMarksQuery): Promise<GlossaryMarkRow[]> {
    return this.markRepo.findByVariantId(query.variantId);
  }
}
