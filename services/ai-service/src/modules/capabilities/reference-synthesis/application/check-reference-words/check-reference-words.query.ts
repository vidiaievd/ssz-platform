export interface CheckReferenceWordsRequest {
  language: string;
  words: readonly string[];
}

/** Which words could get a reference clip, by the checks made before any synthesis (plan 86, step 13.2c). */
export class CheckReferenceWordsQuery {
  constructor(readonly request: CheckReferenceWordsRequest) {}
}
