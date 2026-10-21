import { TEMPLATE_CODE as READ_ALOUD } from '@ssz/shared-kernel/read-aloud';
import {
  readAnswers as readWritingTaskAnswers,
  readContent as readWritingTaskContent,
  TEMPLATE_CODE as WRITING_TASK,
  type PersistedAnswers as WritingTaskAnswers,
} from '@ssz/shared-kernel/writing-task';

/**
 * What a learner may hold of an exercise's answer key — `GET /exercises/:id/answers` for a
 * caller whose access is not staff (`isStaffGrant`).
 *
 * The key reaches learners on purpose. VoxOrd downloads it to grade exercises on the phone
 * without the network (offline plan, decided 11.10.2026), and the web reader takes it for the
 * templates the browser grades. Withholding it wholesale would break both; serving it whole
 * gave every logged-in user the key to every exercise. So this decides per template:
 *
 * - `read_aloud` — refused. A recording judged by a teacher has nothing to check on a device,
 *   and the phone never asks for it (its offline graders leave the template out).
 * - `writing_task` — served without what the template's own security rule keeps from the
 *   student until the teacher has graded: the model answer, the point keywords, and the
 *   rubric level descriptors unless `showRubric: 'always'` makes them a writing guide
 *   (shared-kernel `writing-task/projection.ts`). The phone still gets a key of the right
 *   shape: its offline grader only routes the text to review, the facts it computes are
 *   never shown, and the replay is graded again by the engine against the full key.
 * - every other template — served as stored. That is the price of offline grading, accepted
 *   when offline was decided; it is no wider than what the phone was already given.
 */
export type LearnerAnswerKey =
  | { readonly kind: 'refused' }
  | { readonly kind: 'served'; readonly expectedAnswers: unknown };

export function learnerAnswerKey(
  templateCode: string,
  content: unknown,
  expectedAnswers: unknown,
): LearnerAnswerKey {
  if (templateCode === READ_ALOUD) return { kind: 'refused' };
  if (templateCode === WRITING_TASK) {
    return { kind: 'served', expectedAnswers: writingTaskLearnerKey(content, expectedAnswers) };
  }
  return { kind: 'served', expectedAnswers };
}

function writingTaskLearnerKey(content: unknown, expectedAnswers: unknown): WritingTaskAnswers {
  const answers = readWritingTaskAnswers(expectedAnswers);
  const showRubric = readWritingTaskContent(content).settings.showRubric;

  const points: WritingTaskAnswers['points'] = {};
  for (const id of Object.keys(answers.points)) points[id] = { keywords: [] };

  return {
    points,
    rubric: showRubric === 'always' ? answers.rubric : {},
    model: '',
  };
}
