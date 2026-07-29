export interface UpdateTextSpanAnchor {
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
}

export class UpdateTextSpanCommand {
  constructor(
    public readonly userId: string,
    public readonly variantId: string,
    public readonly spanId: string,
    /** Undefined leaves the span where it is; present re-anchors it. */
    public readonly anchor: UpdateTextSpanAnchor | undefined,
    /** Undefined leaves the note alone; null clears it. */
    public readonly note: string | null | undefined,
  ) {}
}
