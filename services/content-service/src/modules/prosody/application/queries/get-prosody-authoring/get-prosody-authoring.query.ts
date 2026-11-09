import type { ProsodyOwner } from '../../../domain/prosody-owner.js';

export class GetProsodyAuthoringQuery {
  constructor(public readonly owner: ProsodyOwner) {}
}
