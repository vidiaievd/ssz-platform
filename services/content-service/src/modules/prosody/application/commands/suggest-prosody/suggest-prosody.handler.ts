import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ProsodyError } from '../../../domain/prosody-error.js';
import { PROSODY_LAYER_REPOSITORY } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import { PROSODY_TEXT_READER } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import { layerForText, withSuggestedPhrases } from '../../../domain/services/prosody-view.js';
import { PHRASE_MARKS_SUGGESTER } from '../../ports/phrase-marks.suggester.js';
import type { IPhraseMarksSuggester } from '../../ports/phrase-marks.suggester.js';
import { authoringSubject, authoringView } from '../../authoring-text.js';
import type { ProsodyAuthoringView } from '../../authoring-text.js';
import { SuggestProsodyCommand } from './suggest-prosody.command.js';

/**
 * The authoring agent's phrase marks over the stored layer, for the editor to show (plan 86,
 * step 5c.2). A command, not a query: the call spends the payer's `ai.authoring` credits — the
 * material's owner school, or the author without one. Nothing is stored: the teacher fixes
 * the draft and saves it with `PUT …/prosody`, where it becomes the teacher's own.
 *
 * A lesson goes in one call over the whole body; the agent never runs a group across a line
 * break, so paragraphs stay apart.
 */
@CommandHandler(SuggestProsodyCommand)
export class SuggestProsodyHandler implements ICommandHandler<
  SuggestProsodyCommand,
  Result<ProsodyAuthoringView, ProsodyError>
> {
  constructor(
    @Inject(PROSODY_TEXT_READER) private readonly texts: IProsodyTextReader,
    @Inject(PROSODY_LAYER_REPOSITORY) private readonly layers: IProsodyLayerRepository,
    @Inject(PHRASE_MARKS_SUGGESTER) private readonly suggester: IPhraseMarksSuggester,
  ) {}

  async execute(
    command: SuggestProsodyCommand,
  ): Promise<Result<ProsodyAuthoringView, ProsodyError>> {
    const subject = await authoringSubject(this.texts, command.owner);
    if (subject.isFail) return Result.fail(subject.error);
    const { text, language, ownerSchoolId } = subject.value;

    const suggestion = await this.suggester.suggest({
      schoolId: ownerSchoolId,
      userId: command.userId,
      language,
      text,
    });
    if (suggestion.status === 'refused')
      return Result.fail({ code: 'SUGGESTION_REFUSED', reason: suggestion.reason });
    if (suggestion.status === 'failed')
      return Result.fail({ code: 'SUGGESTION_FAILED', errorCode: suggestion.errorCode });

    const stored = await this.layers.find(command.owner);
    const layer = withSuggestedPhrases(layerForText(stored, text), suggestion.marks);
    return Result.ok(authoringView(text, layer, stored?.updatedAt ?? null));
  }
}
