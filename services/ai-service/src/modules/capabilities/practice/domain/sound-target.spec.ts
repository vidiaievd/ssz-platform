import type { WordSounds } from "../../../pronunciation/application/passage-sounds.js";
import type {
  AlignedSound,
  WordAlignment,
} from "../../../pronunciation/domain/align-word.js";
import type { PronouncedWord } from "../../../providers/domain/speech-result.js";
import {
  judgeSoundTarget,
  soundTargetOf,
  type SoundTarget,
} from "./sound-target.js";

const CARRIER = "Nå sier jeg kjenne igjen.";

/** One named sound; `symbols` of one entry when named. */
const sound = (symbols: string[], accuracy: number): AlignedSound => ({
  symbol: symbols.length === 1 ? symbols[0]! : null,
  symbols,
  ipa: symbols.length === 1 ? symbols[0]!.toLowerCase() : null,
  family: null,
  stress: null,
  primary: false,
  startMs: 0,
  durationMs: 80,
  accuracy,
});

const aligned = (text: string, sounds: AlignedSound[]): WordSounds => ({
  alignment: {
    status: "aligned",
    text,
    sounds,
    primaryIndex: null,
    tone: null,
    variants: [],
  } as WordAlignment,
  weak: [],
});
const unaligned = (text: string): WordSounds => ({
  alignment: {
    status: "unaligned",
    text,
    reason: "count_mismatch",
    azureCount: 3,
    lexiconCounts: [4],
  },
  weak: [],
});
const word = (
  text: string,
  error: PronouncedWord["error"] = "none",
): PronouncedWord =>
  ({ text, accuracy: 80, error, phonemes: [] }) as unknown as PronouncedWord;

/** The carrier frame with *kjenne* in it, its kj scored `kj`. */
function carrier(
  kj: number,
  over: { kjenne?: WordSounds; error?: PronouncedWord["error"] } = {},
) {
  const scored = ["Nå", "sier", "jeg", "kjenne", "igjen"].map((t) =>
    word(t, t === "kjenne" ? over.error : "none"),
  );
  const sounds = scored.map((w) =>
    w.text === "kjenne"
      ? (over.kjenne ??
        aligned("kjenne", [
          sound(["KJ"], kj),
          sound(["EH"], 90),
          sound(["N"], 90),
          sound(["AX"], 90),
        ]))
      : aligned(w.text, [sound(["N"], 90)]),
  );
  return { scored, sounds };
}

const KJ: SoundTarget = {
  family: "kj",
  words: ["kjenne"],
  context: "word",
  explained: [],
};

describe("soundTargetOf (plan 86, step 13.3)", () => {
  it("takes a scored family of the language with words of the sentence, in lexical form", () => {
    expect(
      soundTargetOf("nb", CARRIER, {
        atomId: "nb:kj",
        words: ["Kjenne,"],
        context: "word",
      }),
    ).toEqual({
      family: "kj",
      words: ["kjenne"],
      context: "word",
      explained: [],
    });
  });

  it.each([
    ["the toneme (toneme-checks judge it)", "nb:tone", "word"],
    ["an unscored family", "nb:retroflex", "word"],
    ["vowel length in running speech", "nb:vowel_length", "fluent"],
    ["another language", "sv:kj", "word"],
    ["no atom at all", "kj", "word"],
  ] as const)("refuses %s", (_name, atomId, context) => {
    expect(
      soundTargetOf("nb", CARRIER, { atomId, words: ["kjenne"], context }),
    ).toBe("target_not_scored");
  });

  it("refuses words the sentence does not hold, or none", () => {
    expect(
      soundTargetOf("nb", CARRIER, {
        atomId: "nb:kj",
        words: ["kino"],
        context: "word",
      }),
    ).toBe("target_not_in_sentence");
    expect(
      soundTargetOf("nb", CARRIER, {
        atomId: "nb:kj",
        words: ["—"],
        context: "word",
      }),
    ).toBe("target_not_in_sentence");
  });
});

describe("judgeSoundTarget (plan 86, step 13.3)", () => {
  it.each([
    ["at the threshold", 53, true, null, null],
    ["well over", 95, true, null, null],
    ["just under", 40, false, "minor", "KJ:minor"],
    ["under half (kj said as k)", 12, false, "major", "KJ:major"],
  ] as const)("kj %s", (_name, kj, passed, severity, key) => {
    const { scored, sounds } = carrier(kj);
    const verdict = judgeSoundTarget("nb", KJ, scored, sounds);
    expect(verdict).toMatchObject({ atomId: "nb:kj", measured: true, passed });
    expect(verdict.weakest).toMatchObject({
      word: "kjenne",
      symbols: ["KJ"],
      accuracy: kj,
      threshold: 53,
      severity,
      key,
    });
  });

  it("judges only the target words: a weak kj elsewhere in the sentence does not fail it", () => {
    const scored = [word("Kjenner"), word("du"), word("kjenne")];
    const sounds = [
      aligned("Kjenner", [sound(["KJ"], 5)]),
      aligned("du", [sound(["D"], 90)]),
      aligned("kjenne", [sound(["KJ"], 80)]),
    ];
    expect(judgeSoundTarget("nb", KJ, scored, sounds)).toMatchObject({
      measured: true,
      passed: true,
    });
  });

  it("fails on the worst of several sounds of the family, by its margin under the threshold", () => {
    const target: SoundTarget = {
      family: "kj",
      words: ["kjenne", "kino"],
      context: "fluent",
      explained: [],
    };
    const scored = [word("kjenne"), word("kino")];
    const sounds = [
      aligned("kjenne", [sound(["KJ"], 60)]),
      aligned("kino", [sound(["KJ"], 30)]),
    ];
    expect(
      judgeSoundTarget("nb", target, scored, sounds).weakest,
    ).toMatchObject({ word: "kino", accuracy: 30 });
  });

  it("passes over the short member of a length pair and judges the long one", () => {
    const target: SoundTarget = {
      family: "vowel_length",
      words: ["tak", "takk"],
      context: "word",
      explained: [],
    };
    const scored = [word("tak"), word("takk")];
    const sounds = [
      aligned("tak", [sound(["T"], 90), sound(["AA"], 50), sound(["K"], 90)]),
      aligned("takk", [sound(["T"], 90), sound(["AH"], 20), sound(["K"], 90)]),
    ];
    expect(judgeSoundTarget("nb", target, scored, sounds)).toMatchObject({
      measured: true,
      passed: false,
      weakest: { word: "tak", symbols: ["AA"], threshold: 64, key: "AA:minor" },
    });
  });

  it.each([
    [
      "no sounds were measured",
      () => ({ ...carrier(90), sounds: null }),
      "no_sounds",
    ],
    [
      "the target word is left out",
      () => carrier(90, { error: "omission" }),
      "word_not_heard",
    ],
    [
      "the target word is not in the take",
      () => ({ scored: [word("Nå")], sounds: [aligned("Nå", [])] }),
      "word_not_heard",
    ],
    [
      "its sounds are not named",
      () => carrier(90, { kjenne: unaligned("kjenne") }),
      "not_aligned",
    ],
    [
      "it holds no sound of the family as named",
      () =>
        carrier(90, {
          kjenne: aligned("kjenne", [sound(["K"], 10), sound(["EH"], 90)]),
        }),
      "family_not_heard",
    ],
  ] as const)("is not measured when %s", (_name, take, reason) => {
    const { scored, sounds } = take();
    expect(judgeSoundTarget("nb", KJ, scored, sounds)).toEqual({
      atomId: "nb:kj",
      measured: false,
      reason,
      passed: false,
      weakest: null,
    });
  });
});
