/** A reference clip of one word is wanted (plan 88, step 6b.2) — by media-service, for course material. */
export interface ReferenceClipRequest {
  /** The course language (`nb`). */
  language: string;
  /** One word as written; spoken in the language's carrier sentence. */
  word: string;
}

export class MakeReferenceClipCommand {
  constructor(public readonly request: ReferenceClipRequest) {}
}
