import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ProsodyError } from '../../../domain/prosody-error.js';
import { PROSODY_LAYER_REPOSITORY } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import { PROSODY_TEXT_READER } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import { layerForText } from '../../../domain/services/prosody-view.js';
import { authoringText, authoringView } from '../../authoring-text.js';
import type { ProsodyAuthoringView } from '../../authoring-text.js';
import { GetProsodyAuthoringQuery } from './get-prosody-authoring.query.js';

@QueryHandler(GetProsodyAuthoringQuery)
export class GetProsodyAuthoringHandler implements IQueryHandler<
  GetProsodyAuthoringQuery,
  Result<ProsodyAuthoringView, ProsodyError>
> {
  constructor(
    @Inject(PROSODY_TEXT_READER) private readonly texts: IProsodyTextReader,
    @Inject(PROSODY_LAYER_REPOSITORY) private readonly layers: IProsodyLayerRepository,
  ) {}

  async execute(
    query: GetProsodyAuthoringQuery,
  ): Promise<Result<ProsodyAuthoringView, ProsodyError>> {
    const text = await authoringText(this.texts, query.owner);
    if (text.isFail) return Result.fail(text.error);
    const stored = await this.layers.find(query.owner);
    return Result.ok(
      authoringView(text.value, layerForText(stored, text.value), stored?.updatedAt ?? null),
    );
  }
}
