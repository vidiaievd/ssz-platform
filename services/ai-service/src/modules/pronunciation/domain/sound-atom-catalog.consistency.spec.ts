// Plan 86, step 8.3 (Q18): every family ai-service can name as a `sound` atom must be a row
// of content-service's catalogue — otherwise a flag points at nothing, and the learner's card
// and the explanation have no text.
//
// Read as text from content-service's seed data rather than imported: the file lies outside
// this service's `rootDir`, and a contract test over HTTP would only run on a stand. The data
// file keeps one `family: '…'` / `scored: …` pair per entry, which is all this reads.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { soundAtomId } from './sound-remarks.js';
import { assessedFamilies } from './sound-inventory.js';
import { NB_SOUNDS, type SpeechContext } from './nb-sounds.data.js';

const CATALOGUE_DATA = join(process.cwd(), '..', 'content-service', 'prisma', 'data', 'sound-atoms.ts');
const DRILL_DATA = join(process.cwd(), '..', 'content-service', 'prisma', 'data', 'sound-atom-drill.ts');

function catalogueRows(): Array<{ id: string; scored: boolean }> {
  const text = readFileSync(CATALOGUE_DATA, 'utf8');
  const rows = [...text.matchAll(/language: '([a-z]+)',\s*family: '([a-z_]+)',[\s\S]*?scored: (true|false)/g)];
  return rows.map(([, language, family, scored]) => ({ id: `${language}:${family}`, scored: scored === 'true' }));
}

describe('sound atoms ai-service names ⊂ content-service catalogue', () => {
  const rows = catalogueRows();
  const catalogue = new Map(rows.map((row) => [row.id, row]));

  // The toneme comes from the toneme check, not from a threshold of the inventory.
  const named = [...new Set([...assessedFamilies('fluent'), ...assessedFamilies('word'), 'tone' as const])];

  it('reads the catalogue', () => {
    expect(rows.length).toBeGreaterThanOrEqual(named.length);
  });

  it.each(named)('nb:%s is a scored row of the catalogue', (family) => {
    expect(catalogue.get(soundAtomId('nb', family))?.scored).toBe(true);
  });

  it('marks nothing scored that ai-service never names', () => {
    const scored = rows.filter((row) => row.scored).map((row) => row.id);
    expect(scored.sort()).toEqual(named.map((family) => soundAtomId('nb', family)).sort());
  });
});

// Plan 86, step 13.2: content-service picks drill words and phrases by the symbols each family is
// scored on (`symbols` in sound-atom-drill.ts). A copy of the thresholds here — so it must match.
function drillSymbols(): Map<string, Record<SpeechContext, string[]>> {
  const text = readFileSync(DRILL_DATA, 'utf8');
  const entries = [...text.matchAll(/'([a-z]+:[a-z_]+)': \{\s*symbols: \{ word: \[([^\]]*)\], fluent: \[([^\]]*)\] \}/g)];
  const list = (raw: string) => [...raw.matchAll(/'([A-Z]+)'/g)].map((m) => m[1]!).sort();
  return new Map(entries.map(([, id, word, fluent]) => [id!, { word: list(word!), fluent: list(fluent!) }]));
}

function scoredSymbols(family: string, context: SpeechContext): string[] {
  return Object.entries(NB_SOUNDS)
    .filter(([, entry]) => entry.assess?.family === family && entry.assess[context] != null)
    .map(([symbol]) => symbol)
    .sort();
}

describe('content-service drill symbols = what ai-service scores', () => {
  const drill = drillSymbols();

  it('reads a drill entry for every scored atom', () => {
    const scored = catalogueRows().filter((row) => row.scored).map((row) => row.id).sort();
    expect([...drill.keys()].sort()).toEqual(scored);
  });

  it.each([...drillSymbols().keys()])('%s lists the scored symbols of both contexts', (id) => {
    const family = id.split(':')[1]!;
    expect(drill.get(id)).toEqual({ word: scoredSymbols(family, 'word'), fluent: scoredSymbols(family, 'fluent') });
  });
});
