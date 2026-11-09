import type { WordSounds } from "../../../pronunciation/application/passage-sounds.js";
import {
  assessedFamilies,
  type SoundFamily,
  type SpeechContext,
} from "../../../pronunciation/domain/sound-inventory.js";
import { soundAtomId } from "../../../pronunciation/domain/sound-remarks.js";
import { assessedSound } from "../../../pronunciation/domain/weak-sounds.js";
import type { PronouncedWord } from "../../../providers/domain/speech-result.js";
import {
  lexicalWord,
  lexicalWords,
} from "../../../providers/domain/lexical.js";

/**
 * The one sound a take of a pronunciation session is judged on (plan 86, step 13.3): a scored
 * family, the words of the sentence that carry it, and how they were said — a word in its
 * carrier frame (`word`) or a line of running speech (`fluent`). Only these words decide the
 * verdict; any other weak sound of the take is a remark, as in the sentence drill.
 */
export interface SoundTarget {
  family: SoundFamily;
  /** Lexical forms (`kjenne`), distinct, each in the sentence. */
  words: string[];
  context: SpeechContext;
  /** Keys of `weakest` already explained by the model on this element: the same miss is not explained twice (§5.5a). */
  explained: string[];
}

/** Why a target given by the caller cannot be judged at all — answered before the paid call. */
export type SoundTargetRefusal = "target_not_scored" | "target_not_in_sentence";

/** The target's sound that scored furthest under (or least over) its threshold. */
export interface TargetSound {
  word: string;
  /** NoFAbet symbols of the sound; two when the word's readings differ in it but not in family (*uten*). */
  symbols: string[];
  /** IPA of the sound; null when the readings differ in it. */
  ipa: string | null;
  accuracy: number;
  threshold: number;
  /** Null when it passed; `major` under half its threshold (kj said as k), else `minor`. */
  severity: "minor" | "major" | null;
  /**
   * What the miss is, to tell one miss from another across takes of an element (§5.5a): symbols
   * and severity (`KJ:major`); null when it passed. Azure does not say which sound was said
   * instead, so a «k» and a «sj» for kj are the same key unless their severity differs.
   */
  key: string | null;
}

/**
 * - `no_sounds` — no sound was named at all: Azure scored none, or the lexicon could not be read;
 * - `word_not_heard` — a target word is left out or not where the sentence puts it;
 * - `not_aligned` — a target word was heard but its sounds could not be named by the lexicon;
 * - `family_not_heard` — the words were named, but none of their sounds of the family is scored here.
 */
export type TargetUnmeasured =
  "no_sounds" | "word_not_heard" | "not_aligned" | "family_not_heard";

export type TargetVerdict =
  | { atomId: string; measured: true; passed: boolean; weakest: TargetSound }
  | {
      atomId: string;
      measured: false;
      reason: TargetUnmeasured;
      passed: false;
      weakest: null;
    };

/**
 * The target of a request, when it can be judged: an atom of this language whose family is
 * scored in the context, and words the sentence holds. Pure.
 */
export function soundTargetOf(
  language: string,
  sentence: string,
  ask: {
    atomId: string;
    words: readonly string[];
    context: SpeechContext;
    explained?: readonly string[];
  },
): SoundTarget | SoundTargetRefusal {
  const family = assessedFamilies(ask.context).find(
    (f) => soundAtomId(language, f) === ask.atomId,
  );
  if (!family) return "target_not_scored";
  const words = [
    ...new Set(ask.words.map(lexicalWord).filter((w) => w.length > 0)),
  ];
  const inSentence = new Set(lexicalWords(sentence));
  if (words.length === 0 || words.some((w) => !inSentence.has(w)))
    return "target_not_in_sentence";
  return {
    family,
    words,
    context: ask.context,
    explained: [...(ask.explained ?? [])],
  };
}

/**
 * Whether the target's sound was said as natives say it (§5.2): every occurrence of the target
 * words heard and named, at least one sound of the family scored among them, and none of those
 * under its native threshold. A word of a length pair whose vowel is short carries no scored
 * sound of the family and is passed over — the long one is judged (Azure does not judge short
 * vowels, plan 88 §0.5b).
 *
 * `sounds` stand beside `scored` (`PassageSounds.of`); null when none were measured. Pure.
 */
export function judgeSoundTarget(
  language: string,
  target: SoundTarget,
  scored: readonly PronouncedWord[],
  sounds: readonly WordSounds[] | null,
): TargetVerdict {
  const atomId = soundAtomId(language, target.family);
  const unmeasured = (reason: TargetUnmeasured): TargetVerdict => ({
    atomId,
    measured: false,
    reason,
    passed: false,
    weakest: null,
  });
  if (!sounds) return unmeasured("no_sounds");

  const candidates: TargetSound[] = [];
  for (const word of target.words) {
    const at = scored.flatMap((w, j) =>
      lexicalWord(w.text) === word ? [j] : [],
    );
    if (
      at.length === 0 ||
      at.some(
        (j) =>
          scored[j]!.error === "omission" || scored[j]!.error === "insertion",
      )
    ) {
      return unmeasured("word_not_heard");
    }
    for (const j of at) {
      const alignment = sounds[j]?.alignment;
      if (!alignment || alignment.status !== "aligned")
        return unmeasured("not_aligned");
      for (const sound of alignment.sounds) {
        const assessed = assessedSound(sound, target.context);
        if (!assessed || assessed.family !== target.family) continue;
        candidates.push(
          targetSound(
            scored[j]!.text,
            sound.symbols,
            sound.ipa,
            sound.accuracy,
            assessed.threshold,
          ),
        );
      }
    }
  }
  if (candidates.length === 0) return unmeasured("family_not_heard");

  const weakest = candidates.reduce((a, b) =>
    b.accuracy - b.threshold < a.accuracy - a.threshold ? b : a,
  );
  return { atomId, measured: true, passed: weakest.severity === null, weakest };
}

function targetSound(
  word: string,
  symbols: string[],
  ipa: string | null,
  accuracy: number,
  threshold: number,
): TargetSound {
  // The threshold itself is not a remark (nb-sounds.data.ts), so it passes.
  const severity =
    accuracy >= threshold ? null : accuracy < threshold / 2 ? "major" : "minor";
  return {
    word,
    symbols,
    ipa,
    accuracy,
    threshold,
    severity,
    key: severity === null ? null : `${symbols.join("/")}:${severity}`,
  };
}
