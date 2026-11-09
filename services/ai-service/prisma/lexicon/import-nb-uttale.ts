// Loads NB Uttale (Språkbanken, CC0) into pronunciation_lexicon (plan 88, step 1).
//
// Input: the `<dialect>_written` and `<dialect>_spoken` CSVs from nb_uttale_leksika.zip
// (https://www.nb.no/sprakbanken/en/resource-catalogue/oai-nb-no-sbr-79/). The data is not
// in the repository — download, unzip, pass the paths.
//
// The two norms are merged: a (wordform, pos, feats, nofabet) seen in either file is one row
// with `in_written` / `in_spoken` saying where. Affixes (`-abel`) and multi-word names
// (`A-B_Klinikken`) are skipped — an Azure word is never one of them.
// The (language, dialect, source) slice is replaced in one transaction, so a reader sees the
// old rows or the new ones, never an empty table; a rerun with the same files is a no-op in effect.
//
// Run (the container has no copy of the files — copy them in first):
//   docker compose -f docker-compose.dev.yml --env-file .env.dev cp e_written_pronunciation_lexicon.csv ai-service:/tmp/
//   docker compose -f docker-compose.dev.yml --env-file .env.dev cp e_spoken_pronunciation_lexicon.csv ai-service:/tmp/
//   docker compose -f docker-compose.dev.yml --env-file .env.dev exec ai-service \
//     npx tsx prisma/lexicon/import-nb-uttale.ts --written /tmp/e_written_pronunciation_lexicon.csv \
//       --spoken /tmp/e_spoken_pronunciation_lexicon.csv [--dialect e]
import 'dotenv/config';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import pg from 'pg';

const LANGUAGE = 'nb';
const SOURCE = 'nb_uttale';
const BATCH = 2000;
const COLUMNS = [
  'language',
  'dialect',
  'word_key',
  'wordform',
  'pos',
  'feats',
  'nofabet',
  'ipa',
  'tone',
  'in_written',
  'in_spoken',
  'source',
];
const HEADER = [
  'wordform',
  'pos',
  'feats',
  'wordform_id',
  'update_info',
  'nofabet_transcription',
  'ipa_transcription',
  'sampa_transcription',
];

interface Entry {
  wordform: string;
  pos: string;
  feats: string;
  nofabet: string;
  ipa: string;
  tone: number | null;
  inWritten: boolean;
  inSpoken: boolean;
}

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

/** One RFC 4180 record; NB Uttale has no line breaks inside fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      fields.push(field);
      field = '';
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

/** Toneme of the single primary stress (a vowel marked 1 or 2); null for none or several. */
function toneOf(nofabet: string): number | null {
  const primaries = nofabet.split(' ').filter((p) => p.endsWith('1') || p.endsWith('2'));
  return primaries.length === 1 ? Number(primaries[0].slice(-1)) : null;
}

/** An affix or a multi-word name: never one spoken word. */
function skipped(wordform: string): boolean {
  return wordform.startsWith('-') || wordform.endsWith('-') || wordform.includes('_') || /\s/.test(wordform);
}

async function readInto(
  path: string,
  norm: 'written' | 'spoken',
  entries: Map<string, Entry>,
): Promise<{ read: number; skipped: number }> {
  const lines = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let read = 0;
  let skippedCount = 0;
  let header = true;
  for await (const line of lines) {
    if (header) {
      const got = parseCsvLine(line.replace(/^﻿/, ''));
      if (got.join(',') !== HEADER.join(',')) throw new Error(`${path}: unexpected header ${got.join(',')}`);
      header = false;
      continue;
    }
    if (!line) continue;
    const [wordform, pos, feats, , , nofabet, ipa] = parseCsvLine(line);
    read++;
    if (!wordform || !nofabet || skipped(wordform)) {
      skippedCount++;
      continue;
    }
    const key = [wordform, pos, feats, nofabet].join('\u0001');
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        wordform,
        pos,
        feats,
        nofabet,
        ipa,
        tone: toneOf(nofabet),
        inWritten: false,
        inSpoken: false,
      };
      entries.set(key, entry);
    }
    if (norm === 'written') entry.inWritten = true;
    else entry.inSpoken = true;
  }
  return { read, skipped: skippedCount };
}

async function main(): Promise<void> {
  const written = arg('written');
  const spoken = arg('spoken');
  const dialect = arg('dialect', 'e');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const entries = new Map<string, Entry>();
  const w = await readInto(written, 'written', entries);
  const s = await readInto(spoken, 'spoken', entries);
  console.log(
    `read written ${w.read} (skipped ${w.skipped}), spoken ${s.read} (skipped ${s.skipped}) → ${entries.size} rows`,
  );

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    const removed = await client.query(
      'DELETE FROM pronunciation_lexicon WHERE language = $1 AND dialect = $2 AND source = $3',
      [LANGUAGE, dialect, SOURCE],
    );
    let batch: unknown[][] = [];
    let inserted = 0;
    const flush = async () => {
      if (batch.length === 0) return;
      const params: unknown[] = [];
      const tuples = batch.map((row) => {
        const start = params.length;
        params.push(...row);
        return `(${row.map((_, j) => `$${start + j + 1}`).join(',')})`;
      });
      await client.query(`INSERT INTO pronunciation_lexicon (${COLUMNS.join(',')}) VALUES ${tuples.join(',')}`, params);
      inserted += batch.length;
      batch = [];
    };
    for (const e of entries.values()) {
      batch.push([
        LANGUAGE,
        dialect,
        e.wordform.toLowerCase(),
        e.wordform,
        e.pos,
        e.feats,
        e.nofabet,
        e.ipa,
        e.tone,
        e.inWritten,
        e.inSpoken,
        SOURCE,
      ]);
      if (batch.length === BATCH) await flush();
    }
    await flush();
    await client.query('COMMIT');
    console.log(
      `replaced ${removed.rowCount} rows with ${inserted} (language ${LANGUAGE}, dialect ${dialect}, source ${SOURCE})`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
