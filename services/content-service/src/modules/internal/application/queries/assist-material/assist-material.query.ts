// What ai-service's student assistant reads of a course (plan 83, step 2). Every
// query names the course: the material must be published in it, or it is not found.

export class GetAssistUnitMaterialQuery {
  constructor(
    public readonly courseId: string,
    public readonly unitId: string,
    /** Explanation / translation language; a missing variant falls back (see pickVariant). */
    public readonly language: string,
  ) {}
}

export class GetAssistGrammarRuleQuery {
  constructor(
    public readonly courseId: string,
    public readonly ruleId: string,
    public readonly language: string,
  ) {}
}

export class LookupAssistWordQuery {
  constructor(
    public readonly lemma: string,
    public readonly userId: string,
    public readonly language: string,
    /** Absent: only the learner's own words are searched. */
    public readonly courseId: string | null,
  ) {}
}
