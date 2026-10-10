// A probe as the student is handed it, and as it is revealed when it closes (plan 72 §3.6).
//
// Before it closes a probe carries the clip to play and the buttons — with their spelling only
// when the author shows spelling «always», their meaning only when meaning is shown «always»,
// and IPA only beside a spelling the student can already see (the condition of the prototype's
// buttons). After it closes, the key and everything the feedback is allowed to show.
//
// The clip goes out by asset id; the engine turns it into a playable link. Which word it is
// does not go out — that is the answer.

import { findWord } from './derive.js';
import type { MinimalPairsContent, Provenance } from './model.js';
import { probeQuestionId } from './model.js';
import type { DealtProbe } from './sampler.js';

export interface ProbeOption {
  id: string;
  text?: string;
  gloss?: string;
  ipa?: string;
}

export interface ProbeView {
  n: number;
  total: number;
  questionId: string;
  clip: { assetId: string; durationMs: number; provenance: Provenance; dialect: string };
  options: ProbeOption[];
}

export function toProbeView(ex: MinimalPairsContent, probe: DealtProbe, total: number): ProbeView | null {
  const target = findWord(ex, probe.wordId);
  if (!target) return null;
  const f = ex.feedback;
  const spelled = f.showSpelling === 'always';
  const options = probe.optionIds.flatMap((id): ProbeOption[] => {
    const w = findWord(ex, id);
    if (!w) return [];
    const o: ProbeOption = { id };
    if (spelled) o.text = w.text;
    if (f.showGloss === 'always' && w.gloss.trim() !== '') o.gloss = w.gloss;
    if (f.showIpa && spelled && w.ipa.trim() !== '') o.ipa = w.ipa;
    return [o];
  });
  return {
    n: probe.n,
    total,
    questionId: probeQuestionId(probe.n),
    clip: {
      assetId: target.clip.assetId,
      durationMs: target.clip.durationMs,
      provenance: target.clip.provenance,
      dialect: target.clip.dialect,
    },
    options,
  };
}

export interface RevealedOption {
  id: string;
  text: string;
  gloss?: string;
  ipa?: string;
}

export interface ProbeReveal {
  keyOptionId: string;
  /** Every button, now spelled; meaning unless it is never shown; IPA when it is on. */
  options: RevealedOption[];
  /** On a miss with A/B on: the asset of what was chosen and of what was said. */
  compare?: { chosenAssetId: string; targetAssetId: string };
}

export function revealOf(
  ex: MinimalPairsContent,
  probe: DealtProbe,
  lastPick: string | null,
): ProbeReveal {
  const f = ex.feedback;
  const options = probe.optionIds.flatMap((id): RevealedOption[] => {
    const w = findWord(ex, id);
    if (!w) return [];
    const o: RevealedOption = { id, text: w.text };
    if (f.showGloss !== 'never' && w.gloss.trim() !== '') o.gloss = w.gloss;
    if (f.showIpa && w.ipa.trim() !== '') o.ipa = w.ipa;
    return [o];
  });
  const reveal: ProbeReveal = { keyOptionId: probe.wordId, options };
  if (f.abCompare && lastPick !== null && lastPick !== probe.wordId) {
    const chosen = findWord(ex, lastPick);
    const target = findWord(ex, probe.wordId);
    if (chosen && target) {
      reveal.compare = { chosenAssetId: chosen.clip.assetId, targetAssetId: target.clip.assetId };
    }
  }
  return reveal;
}
