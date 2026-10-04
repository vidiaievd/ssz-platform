// The tokenizer fixture both sides are tested against — AC-M1.
//
// Published with the module (not a `*.test-support.ts`) because the engine's test suite
// imports the kernel from `dist`: the server asserts the same words over the same text as
// the client does, and a change to either the expression or the fixture fails both.
//
// The text carries every case SPEC_data_model §2 names: hyphens, straight and typographic
// apostrophes, digits, quotation marks, a line break and a paragraph break, and punctuation
// glued to a word.

export const TOKENIZER_FIXTURE = {
  text:
    '«Hun sa: "Jeg har fått e-post." Han svarte: don\'t og barn’s.»\n' +
    'I 1998 var det førti sjølv-stendige elever i Bodø, ikke flere.\n' +
    '\n' +
    'Nytt avsnitt — 3,5 timer (cirka).',
  words: [
    'Hun', 'sa', 'Jeg', 'har', 'fått', 'e-post', 'Han', 'svarte', "don't", 'og', 'barn’s',
    'I', '1998', 'var', 'det', 'førti', 'sjølv-stendige', 'elever', 'i', 'Bodø', 'ikke',
    'flere',
    'Nytt', 'avsnitt', '3', '5', 'timer', 'cirka',
  ],
} as const;
