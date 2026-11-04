import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { checkProsodyNotation, prosodyIssues } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ProsodyError } from '../../../domain/prosody-error.js';
import { PROSODY_LAYER_REPOSITORY } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import { PROSODY_TEXT_READER } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import { isEmptyLayer } from '../../../domain/services/prosody-view.js';
import { LEXICON_STRESS_SOURCE } from '../../ports/lexicon-stress.source.js';
import type { ILexiconStressSource } from '../../ports/lexicon-stress.source.js';
import { authoringSubject, authoringView } from '../../authoring-text.js';
import type { ProsodyAuthoringView } from '../../authoring-text.js';
import { SetProsodyCommand } from './set-prosody.command.js';

/**
 * Replaces the authored layer with the one the notation spells out. The notation is the
 * whole authored state: orphans the author did not put back are dropped, and a notation
 * without marks removes the row. Its text must be the current text character for character —
 * a notation written for an older text is refused, never re-anchored.
 */
@CommandHandler(SetProsodyCommand)
export class SetProsodyHandler implements ICommandHandler<
  SetProsodyCommand,
  Result<ProsodyAuthoringView, ProsodyError>
> {
  constructor(
    @Inject(PROSODY_TEXT_READER) private readonly texts: IProsodyTextReader,
    @Inject(PROSODY_LAYER_REPOSITORY) private readonly layers: IProsodyLayerRepository,
    @Inject(LEXICON_STRESS_SOURCE) private readonly lexicon: ILexiconStressSource,
  ) {}

  async execute(command: SetProsodyCommand): Promise<Result<ProsodyAuthoringView, ProsodyError>> {
    const subject = await authoringSubject(this.texts, command.owner);
    if (subject.isFail) return Result.fail(subject.error);
    const { text, language } = subject.value;

    const parsed = checkProsodyNotation(text, command.notation);
    if (parsed.issues.length > 0)
      return Result.fail({ code: 'NOTATION_INVALID', issues: parsed.issues });
    const blockers = prosodyIssues(text, parsed.layer).filter((x) => x.level === 'blocker');
    if (blockers.length > 0) return Result.fail({ code: 'LAYER_INVALID', issues: blockers });

    const words = this.lexicon.wordsOf(language, text);
    if (isEmptyLayer(parsed.layer)) {
      await this.layers.remove(command.owner);
      return Result.ok(authoringView(text, parsed.layer, null, await words));
    }
    const stored = await this.layers.save(
      command.owner,
      { sourceText: text, layer: parsed.layer },
      command.userId,
    );
    return Result.ok(authoringView(text, stored.layer, stored.updatedAt, await words));
  }
}
