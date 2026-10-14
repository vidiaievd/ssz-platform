/** A voice a speaker can be given — the catalog entry's id and gender are all this needs. */
export interface SpeakerVoiceCandidate {
  id: string;
  gender: 'female' | 'male';
}

/**
 * Which voice each speaker of a narration speaks with (plan 74, phase 8).
 *
 * The author's choice stands wherever it names a voice of the language. Everyone else is
 * given a voice of their own: never the narrator's, none given twice while one is left, and
 * male and female in turn — a name says nothing to a machine about who carries it, and two
 * people in a dialogue are told apart best by voices far apart. The author corrects a wrong
 * guess in the narration panel, and that correction is kept from then on.
 *
 * The narrator is not in the map: a speaker missing from it speaks with the narrator's voice.
 */
export function assignSpeakerVoices(
  speakers: readonly string[],
  narratorId: string,
  voices: readonly SpeakerVoiceCandidate[],
  chosen: Readonly<Record<string, string>> | null,
): Record<string, string> {
  const known = new Set(voices.map((v) => v.id));
  const map: Record<string, string> = {};

  for (const speaker of speakers) {
    const pick = chosen?.[speaker];
    if (pick && known.has(pick)) map[speaker] = pick;
  }

  const free = voices.filter((v) => v.id !== narratorId);
  if (free.length === 0) return map;
  const byGender = {
    male: free.filter((v) => v.gender === 'male'),
    female: free.filter((v) => v.gender === 'female'),
  };
  const used = new Set(Object.values(map));
  let turn: 'male' | 'female' = 'male';

  for (const speaker of speakers) {
    if (map[speaker]) continue;
    const pool = byGender[turn].length > 0 ? byGender[turn] : free;
    // A voice nobody has yet; with every voice taken, the pool starts over.
    const pick = pool.find((v) => !used.has(v.id)) ?? free.find((v) => !used.has(v.id)) ?? pool[0]!;
    map[speaker] = pick.id;
    used.add(pick.id);
    turn = turn === 'male' ? 'female' : 'male';
  }
  return map;
}

/**
 * The speaker map out of a request body: string names to string ids, at most a few dozen.
 * `@IsObject` checks the shape's outside only; what reaches the command is checked here.
 */
export function speakerVoicesOf(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const map: Record<string, string> = {};
  for (const [speaker, voiceId] of Object.entries(value).slice(0, 50)) {
    if (typeof voiceId === 'string' && speaker.trim() !== '' && speaker.length <= 80 && voiceId.length <= 40) {
      map[speaker] = voiceId;
    }
  }
  return map;
}
