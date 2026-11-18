/** A word spoken alone by a named voice is wanted (plan 86, step 4z.2) — by media-service, for an exercise clip. */
export interface WordClipRequest {
  /** The course language (`nb`). */
  language: string;
  /** One word as written. */
  word: string;
  /** One of the bound synthesis model's voices for the language (`nb-NO-FinnNeural`). */
  voice: string;
}

export class MakeWordClipCommand {
  constructor(public readonly request: WordClipRequest) {}
}
