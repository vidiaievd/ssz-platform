/**
 * Which grammar rules practise this exercise — the pool read from the exercise's side.
 *
 * Every other pool query starts from a rule, because that is how the pool is consumed:
 * the review queue asks a rule for something to practise. Authoring asks the opposite
 * question, and asking it by listing the pool of every rule in the course would be one
 * request per rule to answer something a single indexed lookup answers (plan 42, phase 7).
 */
export class GetExerciseRuleLinksQuery {
  constructor(public readonly exerciseId: string) {}
}
