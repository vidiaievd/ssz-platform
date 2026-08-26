import {
  fromPersisted,
  isSentenceSchemaDocument,
  issues,
  type Issue,
} from '@ssz/shared-kernel/sentence-schema';

export interface SentenceSchemaPreflightViolation {
  ruleCode: string;
  severity: 'blocker' | 'warning';
  itemType: 'EXERCISE';
  itemId: string;
  detail: string;
}

/**
 * Editorial completeness of a `sentence_schema`, decided by the same engine the builder
 * runs. One implementation, so an author cannot be told the exercise is ready and then
 * have publication refused (README's "dots are driven by the single validation engine",
 * and IMPLEMENTATION.md's rule that the blockers run server-side too, not only in the
 * pre-assign gate).
 *
 * Two blockers earn this file. `ROW_UNPLACED` means the author left words outside the
 * schema: the sentence has no key, so it is silently dropped from the student projection
 * — an exercise that publishes clean and shows fewer sentences than it holds, or none.
 * And `ROW_NO_WHY` means a sentence with no rule written against it, which for this type
 * is not a missing nicety: `row.why` is shown on success, is the last-resort explanation
 * for a wrong placement, and is the escalating hint from the second attempt. Publishing
 * without it ships a board that says "wrong" and nothing else — exactly the hole audit 34
 * §5.4 records against this template.
 *
 * Documents of the old form are skipped rather than judged. Plan 52 §8 Q3 leaves six of
 * the seven live, and they have no rows, no chunks and no `why` — running these rules
 * over one would report three blockers on an exercise that works.
 */
export function sentenceSchemaViolations(exercise: {
  id: string;
  content: unknown;
  expectedAnswers: unknown;
}): SentenceSchemaPreflightViolation[] {
  if (!isSentenceSchemaDocument(exercise.content)) return [];

  const document = fromPersisted(exercise.content, exercise.expectedAnswers);

  // One violation per code, not per sentence or field. The builder puts each message on
  // the card it belongs to; a version report that did the same would bury the rest of the
  // container under a dozen lines about one exercise.
  const counted = new Map<string, { level: 'blocker' | 'warning'; count: number; first: Issue }>();
  // No `info` filter, unlike the other three: this kernel raises blockers and warnings
  // only, and a filter for a level the type cannot hold would not compile.
  for (const issue of issues(document)) {
    const seen = counted.get(issue.code);
    if (seen) seen.count += 1;
    else counted.set(issue.code, { level: issue.level, count: 1, first: issue });
  }

  return [...counted].map(([code, { level, count, first }]) => ({
    ruleCode: `SENTENCESCHEMA_${code}`,
    severity: level,
    itemType: 'EXERCISE' as const,
    itemId: exercise.id,
    detail: describeSentenceSchemaIssue(first, count),
  }));
}

/**
 * The English fallback the web shows for a rule code it has no copy for, and the
 * secondary line under the copy it does have. Deliberately concrete: "3 words left
 * outside the schema" is worth more to the author than a rule's name.
 */
export function describeSentenceSchemaIssue(issue: Issue, count: number): string {
  const sentences = (n: number) => `${n} sentence${n === 1 ? '' : 's'}`;

  switch (issue.code) {
    case 'NO_CLAUSE_ON':
      return 'No clause type is switched on, so no sentence can be written against a schema';
    case 'CLAUSE_NO_FIELDS':
      return `The «${issue.clause}» clause type is switched on but has no fields, so its board has no columns`;
    case 'ROW_CLAUSE_OFF':
      return `${sentences(count)} ${count === 1 ? 'is' : 'are'} written in a clause type that is switched off (the first is «${issue.clause}»); they keep working, but no new sentence can join them`;
    case 'NO_DELIVERABLE_ROWS':
      return 'No sentence is finished, so the student would be shown an empty board';
    case 'ROW_NO_TEXT':
      return `${sentences(count)} ${count === 1 ? 'has' : 'have'} no text`;
    case 'ROW_UNPLACED':
      return `${sentences(count)} ${count === 1 ? 'has' : 'have'} words left outside the schema (the first has ${issue.count}), so ${count === 1 ? 'it is' : 'they are'} dropped from what the student receives`;
    case 'ROW_REQUIRED_FIELD_EMPTY':
      return `${sentences(count)} leave a field empty that is not marked as optional`;
    case 'ROW_V2_VIOLATION':
      return `${sentences(count)} put ${issue.count} pieces in the first field of a main clause, which usually means two words were never joined into one element`;
    case 'EXTRAS_ON_BUT_NONE':
      return 'Distractors are switched on and no sentence has any, so the switch does nothing';
    case 'ROW_NO_WHY':
      return `${sentences(count)} ${count === 1 ? 'has' : 'have'} no rule written against ${count === 1 ? 'it' : 'them'}, so a wrong placement can only be told it is wrong`;
  }
}
