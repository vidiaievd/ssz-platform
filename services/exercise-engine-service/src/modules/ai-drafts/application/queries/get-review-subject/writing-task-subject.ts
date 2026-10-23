import { analyse, fromPersisted, usablePoints, type LetterRegister, type Mode } from '@ssz/shared-kernel/writing-task';

/** One must-cover point of the task, and what the engine and the learner say of it. */
export interface WritingTaskSubjectPoint {
  text: string;
  required: boolean;
  /** The author's phrasings — what `phrased` was looked for with. */
  keywords: string[];
  /** A keyword was phrased somewhere in the text — the same `analyse` the queue shows. */
  phrased: boolean;
  /** The learner ticked it off on their checklist. */
  ticked: boolean;
}

/** What ai-service reviews a `writing_task` submission from (plan 79, step 1.7b). */
export interface WritingTaskSubject {
  template: 'writing_task';
  /** The language learnt, as the attempt records it (`nb`). The template carries no labels. */
  targetLanguage: string;
  mode: Mode;
  instruction: string;
  /** The situation the learner writes about. */
  prompt: string;
  /** `retell`: the text being retold. Empty otherwise. */
  source: string;
  /** `letter`: who it is to and in what register. Null otherwise. */
  letter: { register: LetterRegister; recipient: string } | null;
  /** `picture`: the caption of the image, the only part of it a model can read. Empty otherwise. */
  imageCaption: string;
  points: WritingTaskSubjectPoint[];
  /** The author's example answer; empty when there is none. */
  example: string;
  length: { words: number; paragraphs: number; minWords: number; maxWords: number };
  /** The author's AI stage as stored: `aiStage` and its switches — ai-service decides what it allows. */
  ai: { on: boolean; checks: { grammar: boolean; task: boolean; structure: boolean; lexis: boolean } };
  /** The learner's text, as submitted. */
  text: string;
}

/**
 * The essay beside the task it answers. There is no key to compare a text against, so what
 * goes with it is the task itself and the engine's measurements of the text — the same
 * `analyse` the validator stored on the attempt and the queue shows the teacher.
 */
export function writingTaskSubject(
  content: unknown,
  expectedAnswers: unknown,
  submittedAnswer: unknown,
  targetLanguage: string,
): WritingTaskSubject {
  const document = fromPersisted(
    // The envelope is the exercise row's business; the review needs none of it.
    { id: '', moduleId: '', title: '', updatedAt: '' },
    content,
    expectedAnswers,
  );
  const { text, ticked } = readSubmittedText(submittedAnswer);
  const analysis = analyse(document, text);
  const phrased = new Map(analysis.cover.map((point) => [point.id, point.hit]));
  const { settings } = document;

  return {
    template: 'writing_task',
    targetLanguage,
    mode: document.mode,
    instruction: document.instruction,
    prompt: document.prompt,
    source: document.mode === 'retell' ? document.source : '',
    letter: document.mode === 'letter' ? { register: document.letter.register, recipient: document.letter.recipient } : null,
    imageCaption: document.mode === 'picture' ? document.image.caption : '',
    points: usablePoints(document).map((point) => ({
      text: point.text,
      required: point.required,
      keywords: point.keywords.filter((keyword) => keyword.trim() !== ''),
      phrased: phrased.get(point.id) ?? false,
      ticked: ticked.has(point.id),
    })),
    example: document.model,
    length: {
      words: analysis.words,
      paragraphs: analysis.paragraphs,
      minWords: settings.minWords,
      maxWords: settings.maxWords,
    },
    ai: {
      on: settings.aiStage,
      checks: {
        grammar: settings.ai.grammar,
        task: settings.ai.task,
        structure: settings.ai.structure,
        lexis: settings.ai.lexis,
      },
    },
    text,
  };
}

/** `{ text, ticked }`, as the validator reads it; anything else is an empty text. */
function readSubmittedText(submitted: unknown): { text: string; ticked: Set<string> } {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) {
    return { text: '', ticked: new Set() };
  }
  const { text, ticked } = submitted as { text?: unknown; ticked?: unknown };
  return {
    text: typeof text === 'string' ? text : '',
    ticked: new Set(Array.isArray(ticked) ? ticked.filter((id): id is string => typeof id === 'string') : []),
  };
}
