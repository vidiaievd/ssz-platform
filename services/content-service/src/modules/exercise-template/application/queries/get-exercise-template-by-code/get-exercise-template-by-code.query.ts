/**
 * One template, by the code a document names it with rather than by its id.
 *
 * The id is what a builder holds, having listed the templates; the code is what a
 * *document* carries, and a caller holding only a document has no way to reach the id.
 * The Exercise Engine is the first such caller: a disposable task (plan 63 phase 9) is
 * assembled around a template code, and its answer schema and default check settings have
 * to come from the same place every catalogue exercise's do, or the two would drift.
 */
export class GetExerciseTemplateByCodeQuery {
  constructor(public readonly code: string) {}
}
