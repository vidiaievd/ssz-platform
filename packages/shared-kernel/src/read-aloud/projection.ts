// What a student is allowed to see before recording (plan 70 §3.2).
//
// Per prompt: its id, label, the three numbers and the material of the current mode only — the
// passage, the picture and the non-empty plan points, or the situation and the partner's line.
// Never the listening note, the focus words, the pass mark or the AI stage (RA-M5, RA-M6).
//
// The rubric reaches the student before the verdict in one case only: `showRubric: 'always'`,
// where the author chose to show it as a guide while recording (DECISIONS §3). Then the
// criteria the student may see travel with their descriptors — which live on the key side, so
// this projection reads `expected_answers` too (the caveat of plan 50 §5: a projection written
// from `content` alone silently loses this).
//
// The audio block is not here: the content service adds the layer's own projection beside it.

import type { CarriedPrompt } from './carry.js';
import { planOf } from './derive.js';
import type { Mode, Recording, RevisionPolicy, ShowModelPolicy, ShowRubricPolicy } from './model.js';
import { fromPersisted } from './persistence.js';

export interface ProjectedPrompt {
  id: string;
  label: string;
  minSeconds: number;
  maxSeconds: number;
  prepSeconds: number;
  /** `read`. */
  text?: string;
  /** `monologue`, when a picture is attached. */
  image?: { assetId: string; caption: string; alt: string };
  /** `monologue`, the points that say something. */
  plan?: { id: string; text: string; required: boolean }[];
  /** `dialogue`. */
  turn?: { situation: string; partner: string };
}

export interface ProjectedCriterion {
  id: string;
  name: string;
  desc: string;
  levels: [string, string, string, string];
}

export interface StudentProjection {
  title: string;
  instruction: string;
  language: string;
  mode: Mode;
  prompts: ProjectedPrompt[];
  recording: Recording;
  /** What changes what the runner draws. The pass mark is not among them. */
  settings: { showRubric: ShowRubricPolicy; showModel: ShowModelPolicy; revision: RevisionPolicy };
  /** Only under `showRubric: 'always'`, and only the criteria the student may see. */
  rubric?: ProjectedCriterion[];
  /**
   * The prompts passed in an earlier try, which this one does not record again (phase 11b).
   * Set by the engine on a try that follows a return — the attempt knows it, the document does
   * not. Absent on a first try.
   */
  carried?: CarriedPrompt[];
}

export function toStudentProjection(content: unknown, expectedAnswers: unknown): StudentProjection {
  const ex = fromPersisted(content, expectedAnswers);

  const prompts = ex.prompts.map((p): ProjectedPrompt => {
    const out: ProjectedPrompt = {
      id: p.id,
      label: p.label,
      minSeconds: p.minSeconds,
      maxSeconds: p.maxSeconds,
      prepSeconds: p.prepSeconds,
    };
    if (ex.mode === 'read') out.text = p.text;
    if (ex.mode === 'monologue') {
      if (p.image.assetId.trim() !== '') out.image = { ...p.image };
      out.plan = planOf(p).map((x) => ({ id: x.id, text: x.text, required: x.required }));
    }
    if (ex.mode === 'dialogue') out.turn = { ...p.turn };
    return out;
  });

  const projection: StudentProjection = {
    title: ex.title,
    instruction: ex.instruction,
    language: ex.language,
    mode: ex.mode,
    prompts,
    recording: { ...ex.recording },
    settings: {
      showRubric: ex.settings.showRubric,
      showModel: ex.settings.showModel,
      revision: ex.settings.revision,
    },
  };

  if (ex.settings.showRubric === 'always') {
    projection.rubric = ex.rubric
      .filter((c) => c.studentVisible)
      .map((c) => ({
        id: c.id,
        name: c.name,
        desc: c.desc,
        levels: [...c.levels] as [string, string, string, string],
      }));
  }

  return projection;
}
