import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ProsodyLayer } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import { LEXICON_STRESS_SOURCE } from '../../ports/lexicon-stress.source.js';
import type { ILexiconStressSource } from '../../ports/lexicon-stress.source.js';
import type { ProsodyError } from '../../../domain/prosody-error.js';
import { PROSODY_LAYER_REPOSITORY } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import { PROSODY_TEXT_READER } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import { layerForText, studentLayer } from '../../../domain/services/prosody-view.js';
import { GetExerciseProsodyQuery } from './get-exercise-prosody.query.js';

export interface ExerciseProsodyView {
  prompts: { promptId: string; text: string; layer: ProsodyLayer }[];
}

/**
 * The layer of every passage of a read_aloud exercise, in one request. Only the `read` mode
 * shows a passage to read; in the other modes the prompt text is material the student
 * speaks about, and the list is empty — the stored rows wait for a switch back. The lexicon's
 * word stresses (step 5b) are asked per passage, side by side.
 */
@QueryHandler(GetExerciseProsodyQuery)
export class GetExerciseProsodyHandler implements IQueryHandler<
  GetExerciseProsodyQuery,
  Result<ExerciseProsodyView, ProsodyError>
> {
  constructor(
    @Inject(PROSODY_TEXT_READER) private readonly texts: IProsodyTextReader,
    @Inject(PROSODY_LAYER_REPOSITORY) private readonly layers: IProsodyLayerRepository,
    @Inject(LEXICON_STRESS_SOURCE) private readonly lexicon: ILexiconStressSource,
  ) {}

  async execute(
    query: GetExerciseProsodyQuery,
  ): Promise<Result<ExerciseProsodyView, ProsodyError>> {
    const passages = await this.texts.readAloudPassages(query.exerciseId, query.scope);
    if (passages.isFail) return Result.fail(passages.error);
    if (passages.value.mode !== 'read') return Result.ok({ prompts: [] });

    const { language, prompts } = passages.value;
    const shown = prompts.filter((p) => p.text.trim() !== '');
    const [stored, words] = await Promise.all([
      this.layers.findForExercise(query.exerciseId),
      Promise.all(shown.map((p) => this.lexicon.stressesOf(language, p.text))),
    ]);
    return Result.ok({
      prompts: shown.map((p, k) => ({
        promptId: p.id,
        text: p.text,
        layer: studentLayer(p.text, layerForText(stored.get(p.id) ?? null, p.text), words[k]),
      })),
    });
  }
}
