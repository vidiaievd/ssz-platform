import type { ProsodyOwner } from '../../../domain/prosody-owner.js';

export class SetProsodyCommand {
  constructor(
    public readonly userId: string,
    public readonly owner: ProsodyOwner,
    /** The text with its marks (`Jeg '1heter ^'1Anna \ |`); the text alone clears the layer. */
    public readonly notation: string,
  ) {}
}
