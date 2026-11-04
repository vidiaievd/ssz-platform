import type { ProsodyOwner } from '../../../domain/prosody-owner.js';

export class SuggestProsodyCommand {
  constructor(
    /** The author who asked; the payer when the material has no owner school. */
    public readonly userId: string,
    public readonly owner: ProsodyOwner,
  ) {}
}
