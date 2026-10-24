import type { GatewayRequest } from '../../../gateway/application/model-router.js';
import { reviewSchema, verifyReview } from '../domain/review-remarks.js';
import { marksSchema, verifyMarks, type RubricCriterion } from '../domain/rubric-marks.js';
import type { WritingTaskReviewInput } from '../domain/writing-task-review.js';
import { systemPromptV1, userMessageV1, writingTaskRequestV1 } from './writing-task.v1.js';

/**
 * `review_draft@2`, template `writing_task` (plan 79, step 1.7c): the remarks of v1 and, when
 * the author's `draft` switch is on, a suggested mark per rubric criterion. The teacher sees
 * each mark beside their own control and sets the mark themselves — nothing is pre-filled.
 *
 * Without a rubric to mark (switch off) the request is v1's, byte for byte: moving a binding
 * to v2 changes nothing for those drafts.
 */

function marksRules(input: WritingTaskReviewInput): string {
  return [
    '',
    'Suggested marks. The teacher marks the text by the `rubric` of the task; you suggest a mark for',
    'each criterion, which the teacher sees beside their own and compares with it. Rules:',
    '- For every criterion, exactly once: `criterionIndex` its number, `mark` the level 0-3 whose',
    '  descriptor in `levels` is most true of this text, and `reason` — one sentence in',
    `  ${input.commentLanguage}, addressed to the teacher, naming what in the text decides the level.`,
    '- Mark the text that is there against the descriptor — not the effort, not what the learner',
    '  probably meant. Do not round up to be kind or down to be safe; when two levels fit, take the',
    '  one whose descriptor is fully true.',
    '- `weight` says how much a criterion counts in the total. It never changes which level fits.',
    '- Marks do not follow from the number of remarks: the remarks are capped and skip matters of',
    '  taste, a mark reads the whole text.',
  ].join('\n');
}

export function rubricOf(rubric: readonly RubricCriterion[]) {
  return rubric.map((criterion, index) => ({
    criterion: index + 1,
    name: criterion.name,
    ...(criterion.desc.trim() ? { about: criterion.desc } : {}),
    weight: criterion.weight,
    levels: Object.fromEntries(criterion.levels.map((descriptor, level) => [String(level), descriptor.trim() || '—'])),
  }));
}

export function writingTaskRequestV2(input: WritingTaskReviewInput): GatewayRequest {
  const rubric = input.rubric;
  if (!rubric || rubric.length === 0) return writingTaskRequestV1(input);

  const remarks = reviewSchema(input) as { required: string[]; properties: Record<string, unknown> };
  const verifyRemarks = verifyReview(input);
  // The rubric goes before the text, so the text is still the last thing the model reads.
  const { learnerText, ...task } = JSON.parse(userMessageV1(input)) as Record<string, unknown>;

  return {
    system: systemPromptV1(input) + '\n' + marksRules(input),
    messages: [
      { role: 'user', parts: [{ type: 'text', text: JSON.stringify({ ...task, rubric: rubricOf(rubric), learnerText }, null, 2) }] },
    ],
    responseSchema: {
      name: 'writing_task_review',
      schema: {
        ...remarks,
        required: [...remarks.required, 'marks'],
        properties: { ...remarks.properties, marks: marksSchema(rubric) },
      },
      verify: (data) => verifyRemarks(data) ?? verifyMarks(rubric, (data as { marks?: unknown }).marks),
    },
  };
}
