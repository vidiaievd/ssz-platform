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
import { authoringText, authoringView } from '../../authoring-text.js';
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
  ) {}

  async execute(command: SetProsodyCommand): Promise<Result<ProsodyAuthoringView, ProsodyError>> {
    const text = await authoringText(this.texts, command.owner);
    if (text.isFail) return Result.fail(text.error);

    const parsed = checkProsodyNotation(text.value, command.notation);
    if (parsed.issues.length > 0)
      return Result.fail({ code: 'NOTATION_INVALID', issues: parsed.issues });
    const blockers = prosodyIssues(text.value, parsed.layer).filter((x) => x.level === 'blocker');
    if (blockers.length > 0) return Result.fail({ code: 'LAYER_INVALID', issues: blockers });

    if (isEmptyLayer(parsed.layer)) {
      await this.layers.remove(command.owner);
      return Result.ok(authoringView(text.value, parsed.layer, null));
    }
    const stored = await this.layers.save(
      command.owner,
      { sourceText: text.value, layer: parsed.layer },
      command.userId,
    );
    return Result.ok(authoringView(text.value, stored.layer, stored.updatedAt));
  }
}
