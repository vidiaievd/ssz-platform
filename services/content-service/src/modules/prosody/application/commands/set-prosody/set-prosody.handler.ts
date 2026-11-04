import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { checkProsodyNotation, prosodyIssues } from '@ssz/shared-kernel/prosody';
import type { ProsodyLayer } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ProsodyError } from '../../../domain/prosody-error.js';
import { PROSODY_LAYER_REPOSITORY } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import { PROSODY_TEXT_READER } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import { readLayerInput } from '../../../domain/services/layer-input.js';
import { isEmptyLayer } from '../../../domain/services/prosody-view.js';
import { LEXICON_STRESS_SOURCE } from '../../ports/lexicon-stress.source.js';
import type { ILexiconStressSource } from '../../ports/lexicon-stress.source.js';
import { authoringSubject, authoringView } from '../../authoring-text.js';
import type { ProsodyAuthoringView } from '../../authoring-text.js';
import type { ProsodyInput } from './set-prosody.command.js';
import { SetProsodyCommand } from './set-prosody.command.js';

/**
 * Replaces the authored layer with the one sent — as notation or, from the editor (step
 * 6h.2b), as the layer itself. What is sent is the whole authored state: orphans the author
 * did not put back are dropped, and a layer without marks removes the row. It must lie on the
 * current text — a notation whose text differs by a character, a layer whose anchors name
 * other words, is refused, never re-anchored.
 *
 * With `expectedUpdatedAt` the write is optimistic, like the exercise document's: the layer
 * is autosaved apart from the document, so two editors of one prompt would otherwise
 * overwrite each other silently.
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

    const parsed = layerFromInput(text, command.input);
    if (parsed.isFail) return Result.fail(parsed.error);
    const layer = parsed.value;
    const blockers = prosodyIssues(text, layer).filter((x) => x.level === 'blocker');
    if (blockers.length > 0) return Result.fail({ code: 'LAYER_INVALID', issues: blockers });

    if (command.expectedUpdatedAt !== undefined) {
      const current = (await this.layers.find(command.owner))?.updatedAt ?? null;
      const expected =
        command.expectedUpdatedAt === null ? null : new Date(command.expectedUpdatedAt).getTime();
      // Compared as instants: a client that reformats the timestamp is not out of date.
      if ((current?.getTime() ?? null) !== expected)
        return Result.fail({ code: 'LAYER_MODIFIED_ELSEWHERE', currentUpdatedAt: current });
    }

    const words = this.lexicon.wordsOf(language, text);
    if (isEmptyLayer(layer)) {
      await this.layers.remove(command.owner);
      return Result.ok(authoringView(text, layer, null, await words));
    }
    const stored = await this.layers.save(
      command.owner,
      { sourceText: text, layer },
      command.userId,
    );
    return Result.ok(authoringView(text, stored.layer, stored.updatedAt, await words));
  }
}

function layerFromInput(text: string, input: ProsodyInput): Result<ProsodyLayer, ProsodyError> {
  if ('notation' in input) {
    const parsed = checkProsodyNotation(text, input.notation);
    return parsed.issues.length > 0
      ? Result.fail({ code: 'NOTATION_INVALID', issues: parsed.issues })
      : Result.ok(parsed.layer);
  }
  const read = readLayerInput(input.layer);
  return read.ok
    ? Result.ok(read.layer)
    : Result.fail({ code: 'LAYER_MALFORMED', errors: read.errors });
}
