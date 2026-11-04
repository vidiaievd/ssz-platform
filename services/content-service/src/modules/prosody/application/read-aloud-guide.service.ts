import { Inject, Injectable } from '@nestjs/common';
import type { GuidePrompt } from '@ssz/shared-kernel/read-aloud';
import { PROSODY_LAYER_REPOSITORY } from '../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyLayerRepository } from '../domain/repositories/prosody-layer.repository.interface.js';
import { layerForText } from '../domain/services/prosody-view.js';
import { LEXICON_STRESS_SOURCE } from './ports/lexicon-stress.source.js';
import type { ILexiconStressSource } from './ports/lexicon-stress.source.js';
import type { IReadAloudGuideSource } from './ports/read-aloud-guide.source.js';

/**
 * One read of the exercise's layers and one lexicon request per passage (ai-service caches
 * by text, so a preflight right after editing is cheap). The layer is followed to the text
 * as the student's route follows it, orphans kept — `guideIssues` warns about them.
 */
@Injectable()
export class ReadAloudGuideService implements IReadAloudGuideSource {
  constructor(
    @Inject(PROSODY_LAYER_REPOSITORY) private readonly layers: IProsodyLayerRepository,
    @Inject(LEXICON_STRESS_SOURCE) private readonly lexicon: ILexiconStressSource,
  ) {}

  async guideOf(
    exerciseId: string,
    language: string,
    prompts: readonly { id: string; text: string }[],
  ): Promise<Record<string, GuidePrompt>> {
    const shown = prompts.filter((p) => p.text.trim() !== '');
    if (shown.length === 0) return {};
    const [stored, words] = await Promise.all([
      this.layers.findForExercise(exerciseId),
      Promise.all(shown.map((p) => this.lexicon.wordsOf(language, p.text))),
    ]);
    return Object.fromEntries(
      shown.map((p, k) => [
        p.id,
        {
          layer: layerForText(stored.get(p.id) ?? null, p.text),
          unresolved: words[k]?.unresolved ?? [],
        },
      ]),
    );
  }
}
