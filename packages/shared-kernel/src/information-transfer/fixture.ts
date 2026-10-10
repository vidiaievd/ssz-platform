// The handoff's sample (`INF_SAMPLE`) as a fixture — shared by the kernel's tests, the engine's and
// the web's, so the three agree about one document. Ids are fixed; the texts are content of a
// Norwegian course, which is exactly why they live here and not in a default.

import type { Field, FieldType, InformationTransferContent } from './model.js';
import { DEFAULT_ANSWERING, DEFAULT_GRADING, DEFAULT_SCORING, emptyAudio } from './model.js';

export const SAMPLE_FIELD_IDS = ['f1dato', 'f2klok', 'f3rom0', 'f4pris', 'f5tlf0', 'f6navn'] as const;

export const SAMPLE_TRANSCRIPT =
  'Hei, du har ringt Tøyen bibliotek. Norskkurset for nybegynnere starter tirsdag 3. mars klokka ' +
  'halv seks, på rom 204 i andre etasje. Kurset koster 450 kroner for ti kvelder. Meld deg på hos ' +
  'Anne Lise Berg på telefon 22 45 67 89, innen fredag denne uka.';

export const SAMPLE_PASSAGE =
  'NORSKKURS VÅREN 2026\n\n' +
  'Nybegynnere (A1)  tirsdager  kl. 17.30–19.00  rom 204  450 kr / 10 kvelder\n' +
  'Mellomnivå (A2)   torsdager  kl. 18.00–19.30  rom 108  450 kr / 10 kvelder\n\n' +
  'Påmelding: Anne Lise Berg, tlf. 22 45 67 89. Frist: fredag 28. februar.';

function field(
  id: string,
  label: string,
  type: FieldType,
  expected: string[],
  why: string,
  hint = '',
  unit = '',
): Field {
  return { id, label, hint, type, unit, required: true, audio: null, expected, why };
}

/** `INF_SAMPLE`: the answering machine of Tøyen library, six cells. */
export function sampleContent(sourceKind: 'audio' | 'text' = 'audio'): InformationTransferContent {
  const [d, k, r, p, t, n] = SAMPLE_FIELD_IDS;
  const fields: Field[] = [
    field(d, 'Dato', 'date', ['3. mars'], 'Datoen sies rett etter «starter tirsdag». Ukedagen er ikke svaret — den er der for å gjøre datoen lettere å høre.', 'Dag og måned'),
    field(k, 'Klokkeslett', 'time', ['17:30'], '«Halv seks» er 17:30, ikke 18:30: halv + tallet betyr en halvtime FØR den timen. Dette er det eneste virkelige lyttefellen i klippet.', 'kl.'),
    field(r, 'Rom', 'number', ['204'], 'Romnummeret kommer i samme setning som etasjen. Mange skriver «2» — det er etasjen, ikke rommet.'),
    field(p, 'Pris', 'money', ['450'], '450 kroner for hele kurset, ikke per kveld. Beløpet og «for ti kvelder» sies i samme åndedrag.', 'kr', 'kr'),
    field(t, 'Telefon', 'phone', ['22 45 67 89'], 'Nummeret leses i par. Alle skrivemåter godtas — mellomrom og landkode betyr ingenting.'),
    field(n, 'Kontaktperson', 'name', ['Anne Lise Berg', 'Anne Lise'], 'Fornavnet er dobbelt: «Anne Lise». Etternavnet godtas med eller uten.'),
  ];
  (fields[1] as Field).audio = { start: 12, end: 22 };
  (fields[3] as Field).audio = { start: 23, end: 32 };

  const audio = emptyAudio();
  Object.assign(audio, {
    enabled: sourceKind === 'audio',
    source: 'asset',
    assetId: 'as_telefonsvarer',
    fileName: 'telefonsvarer-toyen-bibliotek.mp3',
    title: 'Telefonsvarer: Tøyen bibliotek',
    duration: 52,
    useSegments: true,
    transcript: SAMPLE_TRANSCRIPT,
  });
  audio.settings = { ...audio.settings, layout: 'top', plays: 2, seek: false, speed: true, gate: 'none', transcriptWhen: 'after' };

  return {
    title: 'Fyll ut skjemaet: kurs på biblioteket',
    instruction: 'Du hører en beskjed på telefonsvareren. Fyll ut skjemaet under. Du kan lytte to ganger.',
    language: 'nb',
    sourceKind,
    focus: 'pragmatics',
    passageTitle: 'Kursoversikt — Tøyen bibliotek, våren 2026',
    passage: SAMPLE_PASSAGE,
    audio,
    form: { formTitle: 'Påmeldingsskjema — norskkurs', layout: 'form' },
    fields,
    grading: { ...DEFAULT_GRADING },
    answering: { ...DEFAULT_ANSWERING },
    scoring: { ...DEFAULT_SCORING },
  };
}

/** A student's first go at the sample, and what the prototype's grader says of each cell. */
export const SAMPLE_ANSWERS: Readonly<Record<string, string>> = {
  [SAMPLE_FIELD_IDS[0]]: '3/3',
  [SAMPLE_FIELD_IDS[1]]: 'kl 17.30',
  [SAMPLE_FIELD_IDS[2]]: '2',
  [SAMPLE_FIELD_IDS[3]]: '450 kroner',
  [SAMPLE_FIELD_IDS[4]]: '+47 22456789',
  [SAMPLE_FIELD_IDS[5]]: 'anne lise',
};
