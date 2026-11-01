// The grammar atoms a course teaches or practises, as a model is shown them (plan 85, step 2).

export class GetGrammarAtomCatalogQuery {
  constructor(
    public readonly courseId: string,
    /** The school's explanation language; a missing variant falls back (see pickVariant). */
    public readonly language: string,
  ) {}
}
