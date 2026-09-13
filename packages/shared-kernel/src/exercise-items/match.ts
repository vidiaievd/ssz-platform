/**
 * Does this surface form belong to that dictionary word — plan 63, phase 1.
 *
 * Needed because the two are almost never spelled the same. A gap in a real seeded exercise
 * answers `stillingsannonser`; the vocabulary list holds `stillingsannonse`. Matching on
 * equality would attribute almost nothing, and attributing almost nothing is the way this
 * whole plan quietly fails — models built, control shipped, no addresses in the content.
 *
 * Deliberately not a stemmer. A stemmer for Norwegian is a dependency, a language setting and
 * a source of confident wrong answers; what is wanted here is a **suggester** whose output an
 * author confirms. So: the dictionary word must be a prefix of the surface form, and what is
 * left over must be a short ending the language actually uses.
 *
 * The asymmetry is on purpose. `hus → huset` is a form of the word; `huset → hus` would also
 * be, but the dictionary side is the one written by a human and is already the base form.
 */

/**
 * Endings that turn a base form into a surface one: the noun paradigm (-en/-et/-a/-er/-ene),
 * the verb one (-r/-te/-t/-de/-d/-et), the adjective one (-e/-t). Longer than three letters
 * is not inflection, it is a different word.
 */
const ENDINGS: readonly string[] = [
  '', 'r', 'e', 't', 'd', 'a', 'n',
  'en', 'et', 'er', 'te', 'de', 'es', 'as', 'ar',
  'ene', 'ane', 'ret', 'ren', 'tet', 'ten', 'ede', 'ane',
];

/**
 * Below this, the ending is a bigger share of the word than the word is: `si` and `sin` are
 * different words, and so are `by` and `byer`. Suggesting either would teach an author to
 * stop reading the suggestions.
 *
 * Three, not four — `hus → huset` is the commonest noun in the material and a four-letter
 * floor throws it away. The cost is that some three-letter pairs will be offered wrongly,
 * and an author declining a suggestion is cheaper than a word nobody can attribute.
 */
const MIN_BASE_LENGTH = 3;

/**
 * A word is written with its gender in a vocabulary list as often as without — `hjelpetelefon`
 * and `en hjelpetelefon` are the same entry — and a verb appears with or without `å`. Neither
 * side can be relied on to have made the same choice, so both are stripped before comparing.
 *
 * Only as a leading token, and only when something follows: `en` on its own is the numeral.
 */
const LEADING_MARKERS: readonly string[] = ['en', 'ei', 'et', 'å', 'den', 'det', 'de'];

export type WordMatch = 'exact' | 'inflected' | null;

export function matchWord(dictionaryWord: string, surfaceForm: string): WordMatch {
  const base = stripMarker(normalise(dictionaryWord));
  const surface = stripMarker(normalise(surfaceForm));

  if (base === '' || surface === '') return null;
  if (base === surface) return 'exact';
  if (base.length < MIN_BASE_LENGTH) return null;
  if (!surface.startsWith(base)) return null;

  const ending = surface.slice(base.length);
  return ENDINGS.includes(ending) ? 'inflected' : null;
}

/**
 * Lowercased, punctuation off the ends, nothing else. **No Unicode folding in any
 * direction**: `æ ø å` are letters of the alphabet, not decorated `a` and `o`, and folding
 * them would make `for` and `før` the same word.
 */
function stripMarker(value: string): string {
  const space = value.indexOf(' ');
  if (space <= 0) return value;
  const head = value.slice(0, space);
  if (!LEADING_MARKERS.includes(head)) return value;
  const rest = value.slice(space + 1).trim();
  return rest === '' ? value : rest;
}

function normalise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '');
}
