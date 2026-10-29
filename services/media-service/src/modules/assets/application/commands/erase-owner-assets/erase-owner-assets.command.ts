import { ICommand } from '@nestjs/cqrs';

/** How many assets the erase removed, for the log; zeros on a replay. */
export interface EraseOwnerAssetsResult {
  assets: number;
  objects: number;
}

/** The account is gone from auth for good (`auth.user.deleted`); its files go with it. */
export class EraseOwnerAssetsCommand implements ICommand {
  constructor(readonly ownerId: string) {}
}
