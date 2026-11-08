// Where Azure's pronunciation scores do and do not tell a sound from the learner's typical
// substitute (plan 86, step 14.3): `kj` said as `sj`, `y` said as `i` or `u`.
//
// For every drill word of the families (content-service `internal/sound-atoms/drill`) the script
// sends takes of the word in its carrier frame («Nå sier jeg … igjen.») to ai-service
// `internal/sentence-checks` with the family as the target and `explain: false` (no model call):
//   ref  — the word's reference clip (media `reference_clip`): must pass;
//   tts  — Azure TTS of the right word, another voice: must pass;
//   sj / i / u — Azure TTS of the word with the substitute spelled in: must miss.
// A word «tells» the sound when ref and tts pass and every substitute misses. The table goes to
// stdout and, with OUT=<file>, to a Markdown file.
//
// Native recordings. `WRITE_SET=<file>` writes the same takes as a native.sh set (`id|text|hint`,
// recordings/step9/sets/<name>.tsv): the speaker reads the right word and, on purpose, the
// substitute. `SPEAKER=<speaker dir>` (with `SET=<name>`, default `sound_check`) then hears the
// speaker's `<dir>/sets/<name>/<id>.wav` instead of TTS — the same table on a human voice.
//
// Costs: one Azure Speech call per take (≈ 2.5 s of audio, ≈ 0.7 credit of the school's
// `ai.practice`, surface `pronunciation_drill`), no model. The takes are deleted from media after.
// Each sentence is said ≤ 4 times; ai-service allows 10 a sentence per learner per UTC day.
//
// Usage (from infrastructure/, Node 22.6+, ffmpeg on PATH):
//   node --experimental-strip-types scripts/plan-86-sound-blindspots.mts
// Env: FAMILIES (kj,y), WORDS (comma list to narrow), GATEWAY, AI (http://localhost:3010),
// CONTENT (http://localhost:3003), MEDIA (http://localhost:3004), STUDENT_EMAIL, DEV_PASSWORD,
// SCHOOL_ID (payer), VOICE (nb-NO-FinnNeural), OUT, WRITE_SET, SPEAKER, SET.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATEWAY = process.env.GATEWAY ?? 'http://localhost';
const AI = process.env.AI ?? 'http://localhost:3010';
const CONTENT = process.env.CONTENT ?? 'http://localhost:3003';
const MEDIA = process.env.MEDIA ?? 'http://localhost:3004';
const STUDENT_EMAIL = process.env.STUDENT_EMAIL ?? 'student2@email.com';
const PASSWORD = process.env.DEV_PASSWORD ?? '!Password1234';
const SCHOOL_ID = process.env.SCHOOL_ID ?? 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const VOICE = process.env.VOICE ?? 'nb-NO-FinnNeural';
const FAMILIES = (process.env.FAMILIES ?? 'kj,y').split(',').map((f) => f.trim());
const ONLY = process.env.WORDS ? new Set(process.env.WORDS.split(',').map((w) => w.trim())) : null;
const SET = process.env.SET ?? 'sound_check';
const SPEAKER = process.env.SPEAKER ?? null;

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '../.env.dev');
const token = readEnv('INTERNAL_SERVICE_TOKEN');
const speechKey = readEnv('AZURE_SPEECH_KEY');
const redisPassword = readEnv('REDIS_PASSWORD');

/**
 * Clears the learner's tries of one sentence (ai-service `RedisSentenceCheckLimiter`: 10 a sentence a
 * UTC day). A word is said up to 6 times here and the map is rerun — the limit is the drill's, not
 * this measurement's. Dev only.
 */
function freeTries(userId: string, sentence: string): void {
  const hash = createHash('sha1').update(sentence.trim().toLowerCase()).digest('hex').slice(0, 16);
  execFileSync('docker', ['exec', 'infrastructure-redis-1', 'redis-cli', '-a', redisPassword, '--no-auth-warning', '-n', '6',
    'del', `ai:sentence:rl:${userId}:${hash}`]);
}

/** Waits until media has measured the recording: a check of one still processing costs a try. */
async function ready(assetId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const res = await json('POST', `${MEDIA}/api/v1/internal/media/assets/describe`, { ids: [assetId] }, internal);
    const a = res.body?.[0];
    if (a && a.status === 'READY' && a.durationMs !== null) return;
    if (a?.status === 'FAILED') throw new Error(`media refused recording ${assetId}`);
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`recording ${assetId} never became ready`);
}

const frame = (word: string) => `Nå sier jeg ${word} igjen.`;

/**
 * The learner's substitutes per family, as a spelling the TTS reads: `kj`, `tj`, a soft `k` → `sj`
 * (the kj/sj confusion); the first `y` → `i` (unrounded) or `u` (Norwegian ʉ, the nearest rounded
 * vowel — and close to what Russian «ю» turns into).
 */
const SUBSTITUTES: Record<string, Array<{ variant: string; spell: (w: string) => string | null; hint: string }>> = {
  kj: [{ variant: 'sj', spell: (w) => swap(w, /^(kj|tj|k)/i, 'sj'), hint: 'say SJ instead of KJ, on purpose' }],
  y: [
    { variant: 'i', spell: (w) => swap(w, /y/i, 'i'), hint: 'say I instead of Y (lips spread), on purpose' },
    { variant: 'u', spell: (w) => swap(w, /y/i, 'u'), hint: 'say U instead of Y, on purpose' },
  ],
};

function swap(word: string, pattern: RegExp, by: string): string | null {
  const out = word.replace(pattern, (m) => (m[0] === m[0].toUpperCase() ? by[0].toUpperCase() + by.slice(1) : by));
  return out === word ? null : out;
}

function readEnv(key: string): string {
  const line = fs.readFileSync(envFile, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} is not in ${envFile}`);
  return line.slice(key.length + 1).trim();
}

function sql(db: string, query: string): string[][] {
  const out = execFileSync(
    'docker',
    ['exec', 'infrastructure-postgres-1', 'psql', '-U', 'ssz_admin', '-d', db, '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', query],
    { encoding: 'utf8' },
  );
  return out.split('\n').filter((l) => l !== '').map((l) => l.split('|'));
}

async function json(method: string, url: string, body: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // kept as text
  }
  return { status: res.status, body: parsed };
}

const internal = { 'x-internal-token': token };

// --- Takes -------------------------------------------------------------------------------------

interface Take {
  id: string;
  family: string;
  atomId: string;
  word: string;
  variant: string;
  /** What is said; the reference text sent to Azure is always the frame of the right word. */
  spoken: string;
  hint: string;
  referenceAssetId: string | null;
  /** Expected: pass for ref/tts, miss for a substitute. */
  shouldPass: boolean;
  /** TTS speaking rate (`-10%`); a substitute is said at two, its score swings with delivery. */
  rate: string | null;
}

async function material(): Promise<Take[]> {
  const res = await json('GET', `${CONTENT}/api/v1/internal/sound-atoms/drill?language=nb`, undefined, internal);
  if (res.status !== 200) throw new Error(`drill material → ${res.status}`);
  const takes: Take[] = [];
  for (const family of FAMILIES) {
    const atom = res.body.atoms.find((a: any) => a.family === family);
    if (!atom) throw new Error(`no drill material for family ${family}`);
    for (const w of atom.words) {
      const word: string = w.word;
      if (ONLY && !ONLY.has(word)) continue;
      const assetId: string | null = w.reference?.assetId ?? w.assetId ?? null;
      const base = { family, atomId: atom.atomId, word, referenceAssetId: assetId };
      const key = word.toLowerCase().replace(/[^a-zæøå]/g, '');
      if (!SPEAKER) {
        takes.push({ ...base, id: `${family}_${key}_ref`, variant: 'ref', spoken: frame(word), hint: 'reference clip', shouldPass: true, rate: null });
      }
      takes.push({ ...base, id: `${family}_${key}_ok`, variant: 'tts', spoken: frame(word), hint: 'naturally', shouldPass: true, rate: null });
      for (const sub of SUBSTITUTES[family] ?? []) {
        const spelled = sub.spell(word);
        if (!spelled) continue;
        const take = { ...base, spoken: frame(spelled), hint: `${sub.hint}: «${spelled}»`, shouldPass: false };
        takes.push({ ...take, id: `${family}_${key}_${sub.variant}`, variant: sub.variant, rate: null });
        // A native reads the line once; only the synthesis gets a slower second rendition.
        if (!SPEAKER) takes.push({ ...take, id: `${family}_${key}_${sub.variant}_slow`, variant: `${sub.variant} slow`, rate: '-10%' });
      }
    }
  }
  return takes;
}

async function speak(text: string, rate: string | null): Promise<Buffer> {
  const base = sql('ai_db', `select base_url from ai_providers where code='azure-tts'`)[0]?.[0];
  if (!base) throw new Error('no azure-tts provider row');
  const ssml = `<speak version="1.0" xml:lang="nb-NO"><voice name="${VOICE}">${rate ? `<prosody rate="${rate}">${text}</prosody>` : text}</voice></speak>`;
  const res = await fetch(new URL('cognitiveservices/v1', base.endsWith('/') ? base : `${base}/`), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'webm-24khz-16bit-mono-opus',
      'User-Agent': 'ssz-plan86-blindspots',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS «${text}» → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Any audio → webm/opus through pipes (snap ffmpeg cannot see /tmp). */
function toWebm(input: Buffer): Buffer {
  const out = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-c:a', 'libopus', '-f', 'webm', 'pipe:1'], { input, maxBuffer: 1 << 24 });
  if (out.status !== 0 || !out.stdout?.length) throw new Error(`ffmpeg: ${out.stderr?.toString()}`);
  return out.stdout;
}

async function audioOf(take: Take): Promise<Buffer | null> {
  if (SPEAKER) {
    const file = path.resolve(SPEAKER, 'sets', SET, `${take.id}.wav`);
    return fs.existsSync(file) ? toWebm(fs.readFileSync(file)) : null;
  }
  if (take.variant === 'ref') {
    if (!take.referenceAssetId) return null;
    const res = await json('POST', `${MEDIA}/api/v1/internal/media/assets/playback`, { ids: [take.referenceAssetId] }, internal);
    const url = res.body?.[0]?.url;
    if (!url) return null;
    return toWebm(Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  return speak(take.spoken, take.rate);
}

async function upload(auth: string, label: string, audio: Buffer): Promise<string> {
  const headers = { authorization: `Bearer ${auth}` };
  const req = await json('POST', `${GATEWAY}/api/v1/media/uploads/request`, {
    mimeType: 'audio/webm',
    sizeBytes: audio.length,
    entityType: 'submission_recording',
    entityId: label,
  }, headers);
  if (req.status >= 300) throw new Error(`upload request → ${req.status} ${JSON.stringify(req.body)}`);
  const put = await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'content-type': 'audio/webm' }, body: new Uint8Array(audio) });
  if (!put.ok) throw new Error(`upload PUT → ${put.status}`);
  const fin = await json('POST', `${GATEWAY}/api/v1/media/uploads/${req.body.assetId}/finalize`, {}, headers);
  if (fin.status >= 300) throw new Error(`finalize → ${fin.status}`);
  return req.body.assetId;
}

interface Heard {
  take: Take;
  status: string;
  measured: boolean;
  passed: boolean | null;
  accuracy: number | null;
  threshold: number | null;
  key: string | null;
  reason: string | null;
}

async function check(take: Take, userId: string, assetId: string): Promise<Heard> {
  await ready(assetId);
  for (let i = 0; i < 5; i++) {
    freeTries(userId, frame(take.word));
    const res = await json('POST', `${AI}/api/v1/internal/sentence-checks`, {
      schoolId: SCHOOL_ID,
      userId,
      language: 'nb',
      explanationLanguage: 'en',
      sentence: frame(take.word),
      recordingAssetId: assetId,
      target: { atomId: take.atomId, words: [take.word], context: 'word', explained: [] },
      explain: false,
    }, internal);
    if (res.status !== 200) throw new Error(`sentence-checks → ${res.status} ${JSON.stringify(res.body)}`);
    const o = res.body;
    if (o.status === 'failed' && o.errorCode === 'recording_not_ready') {
      await new Promise((r) => setTimeout(r, 1_500));
      continue;
    }
    if (o.status !== 'ok') {
      return { take, status: o.status, measured: false, passed: null, accuracy: null, threshold: null, key: null, reason: o.reason ?? o.errorCode };
    }
    const t = o.target;
    return {
      take,
      status: 'ok',
      measured: !!t?.measured,
      passed: t?.measured ? t.passed : null,
      accuracy: t?.weakest?.accuracy ?? null,
      threshold: t?.weakest?.threshold ?? null,
      key: t?.weakest?.key ?? null,
      reason: t?.measured ? null : (t?.reason ?? 'no_target'),
    };
  }
  throw new Error(`${take.id}: the recording was never ready`);
}

// --- Report ------------------------------------------------------------------------------------

function cell(h: Heard | undefined): string {
  if (!h) return '·';
  if (h.status !== 'ok') return `— ${h.reason}`;
  if (!h.measured) return `— ${h.reason}`;
  const mark = h.passed ? '✓' : '✗';
  const right = h.passed === h.take.shouldPass ? '' : ' ⚠';
  return `${mark} ${Math.round(h.accuracy ?? 0)}${right}`;
}

function report(heard: Heard[]): string {
  const lines: string[] = [];
  const source = SPEAKER ? `speaker ${path.basename(SPEAKER)}` : `reference clips + Azure TTS ${VOICE}`;
  lines.push(`Takes: ${source}, ${new Date().toISOString().slice(0, 10)}. Cell = verdict and the family's score (✓ pass, ✗ miss,`);
  lines.push('— not measured); ⚠ = the wrong verdict (a right take missed, a substitute passed).');
  for (const family of FAMILIES) {
    const rows = heard.filter((h) => h.take.family === family);
    if (rows.length === 0) continue;
    const variants = [...new Set(rows.map((h) => h.take.variant))];
    const threshold = rows.find((h) => h.threshold !== null)?.threshold;
    lines.push('', `**${family}** (threshold in a word: ${threshold ?? '?'})`, '');
    lines.push(`| word | ${variants.join(' | ')} | tells? |`, `|---|${variants.map(() => '---').join('|')}|---|`);
    const words = [...new Set(rows.map((h) => h.take.word))];
    let telling = 0;
    for (const word of words) {
      const byVariant = new Map(rows.filter((h) => h.take.word === word).map((h) => [h.take.variant, h]));
      const all = [...byVariant.values()];
      const tells = all.every((h) => h.measured && h.passed === h.take.shouldPass);
      if (tells) telling++;
      lines.push(`| ${word} | ${variants.map((v) => cell(byVariant.get(v))).join(' | ')} | ${tells ? 'yes' : 'no'} |`);
    }
    lines.push('', `${telling} of ${words.length} words tell ${family} from its substitutes.`);
  }
  return lines.join('\n');
}

// --- Run ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const takes = await material();

  if (process.env.WRITE_SET) {
    const out = [
      `# Sound check (plan 86, step 14.3): each word in the carrier frame, said right and — on purpose — with a learner's substitute.`,
      '#! Read each line as written, at a natural speed. Lines with a misspelt word are on purpose: say exactly what is written, the way a learner would.',
      ...takes.filter((t) => t.variant !== 'ref' && !t.variant.endsWith(' slow')).map((t) => `${t.id}|${t.spoken}|${t.hint}`),
    ];
    fs.writeFileSync(process.env.WRITE_SET, out.join('\n') + '\n');
    console.log(`wrote ${takes.filter((t) => t.variant !== 'ref' && !t.variant.endsWith(' slow')).length} lines to ${process.env.WRITE_SET}`);
    if (!process.env.RUN) return;
  }

  const login = await json('POST', `${GATEWAY}/api/v1/auth/login`, { email: STUDENT_EMAIL, password: PASSWORD });
  if (login.status !== 200) throw new Error(`login → ${login.status}`);
  const auth = login.body.accessToken as string;
  const userId = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString('utf8')).sub as string;
  const label = randomUUID();

  console.log(`${takes.length} takes (${FAMILIES.join(', ')})${SPEAKER ? ` from ${SPEAKER}` : ''}\n`);
  const heard: Heard[] = [];
  for (const take of takes) {
    const audio = await audioOf(take);
    if (!audio) {
      console.log(`  · ${take.id}: no audio, skipped`);
      continue;
    }
    const assetId = await upload(auth, label, audio);
    const h = await check(take, userId, assetId);
    heard.push(h);
    console.log(`  ${take.id.padEnd(24)} ${take.spoken.padEnd(32)} ${cell(h)}${h.key && !h.passed ? ` ${h.key}` : ''}`);
    await json('POST', `${MEDIA}/api/v1/internal/media/assets/${assetId}/discard`, { ownerId: userId }, internal);
  }

  const md = report(heard);
  console.log(`\n${md}`);
  if (process.env.OUT) {
    fs.writeFileSync(process.env.OUT, md + '\n');
    console.log(`\nwritten to ${process.env.OUT}`);
  }
}

main().catch((err) => {
  console.error(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
