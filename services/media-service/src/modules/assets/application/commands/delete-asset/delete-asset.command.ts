import { ICommand } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';

export type DeleteAssetResult = Result<void, 'ASSET_NOT_FOUND' | 'ASSET_ALREADY_DELETED'>;

export class DeleteAssetCommand implements ICommand {
  constructor(
    readonly assetId: string,
    readonly ownerId: string,
  ) {}
}
