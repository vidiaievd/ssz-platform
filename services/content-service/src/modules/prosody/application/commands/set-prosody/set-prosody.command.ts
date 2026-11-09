import type { ProsodyOwner } from '../../../domain/prosody-owner.js';

/**
 * What an author sends: the notation (`Jeg '1heter ^'1Anna \ |`; the text alone clears the
 * layer, every mark becomes the teacher's), or the layer itself (plan 86, step 6h.2b) — the
 * editor's form, which keeps each mark's source (`teacher` / `ai`) and «no stress».
 */
export type ProsodyInput = { notation: string } | { layer: unknown };

export class SetProsodyCommand {
  constructor(
    public readonly userId: string,
    public readonly owner: ProsodyOwner,
    public readonly input: ProsodyInput,
    /**
     * The `updatedAt` the editor last read — null when it read no stored layer. Absent: the
     * write is unconditional, as every write was before step 6h.2b.
     */
    public readonly expectedUpdatedAt?: string | null,
  ) {}
}
