// End-to-end run of the «speech therapist» pronunciation session (plan 86, step 14.2) against the
// live dev stack, on real Azure: gateway → exercise-engine → learning / content / media /
// organization → ai-service (door, sentence-checks, toneme-checks, Azure Speech) → ledger →
// RabbitMQ → learning + analytics.
//
// What it proves, in order:
//   1. Cold start. A learner with no sound record gets the diagnostic (one word per family). The
//      script says the `kj` word wrongly (Azure TTS with `kj` spoken as `sj`) and every other word
//      as its reference clip: the diagnostic finds `nb:kj` weak and opens the drill on it. Handed
//      in at once, the session rates nothing and flags `nb:kj` with `ai_session` (step 13.5b):
//      learning keeps an `atom_flags` row and introduces no card; analytics a `weak_rules_daily` row.
//   2. A session on `nb:kj` (chosen). On each word rung two wrong takes and then the reference clip;
//      on the course line an unrelated sentence, which is not measured. The tenth take of the drill ends
//      the session with `take_limit`; an eleventh is refused (409 `SESSION_CLOSED`). A repeated
//      miss with the same key is not explained again. The hand-in rates `nb:kj` (HARD after
//      measured misses, GOOD if none were measured) and `exercise.attempt.completed` carries one gap
//      with that score; learning introduces the `SOUND_ATOM` card with the matching stability.
//   3. The day's limit. A third session begins; a fourth (another sound) is refused with 422
//      `SESSION_LIMIT` and the third stays open — asking for it again resumes it.
//   4. Ledger: every heard take is one `pronunciation_session` call on the session's probe, paid
//      by the payer the door named (the school with `ai-precheck` on, else the learner).
//
// Costs real money of the dev Azure resource (F0: about 20 takes ≈ 1 min of audio, 8 short TTS
// requests) and the payer's credits (≈ 10–15 credits).
//
// Preconditions (checked; the script stops on the first one missing):
//   - exercise-engine, ai-service, learning, analytics, content, media built from this branch;
//   - the learner has no `SOUND_ATOM` card, no sound flag of the last 14 days and no open
//     session (`RESET=1` deletes the cards and flags first);
//   - ai_db: the `practice_voice` and `toneme_check` bindings on Azure; `pronunciation_explain` bound;
//   - `ffmpeg` on PATH (reference clips are mp3, recordings must be webm/ogg/mp4).
// The learner's day counter of sessions in Redis is cleared before the run and after it. Afterwards
// what the run wrote about the learner's sounds is deleted (cards, flags, analytics rows of the
// run's probes) unless `KEEP=1`.
//
// Usage (from infrastructure/, Node 22.6+):
//   node --experimental-strip-types scripts/plan-86-session-live.mts
// Env overrides: GATEWAY (http://localhost), STUDENT_EMAIL (student2@email.com), DEV_PASSWORD,
// LOCALE (ru), VOICE (nb-NO-FinnNeural), RESET, KEEP. Exit code 1 on the first failed expectation.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATEWAY = process.env.GATEWAY ?? 'http://localhost';
const STUDENT_EMAIL = process.env.STUDENT_EMAIL ?? 'student2@email.com';
const PASSWORD = process.env.DEV_PASSWORD ?? '!Password1234';
const LOCALE = process.env.LOCALE ?? 'ru';
// A voice other than the reference clips' default: the «learner» is not the reference speaker.
const VOICE = process.env.VOICE ?? 'nb-NO-FinnNeural';
const RESET = process.env.RESET === '1';
const KEEP = process.env.KEEP === '1';

const LANGUAGE = 'nb';
const ATOM = 'nb:kj';
const OTHER_ATOM = 'nb:sj';
const THIRD_ATOM = 'nb:y';
const MAX_TAKES = 10;
const MISSES_PER_WORD = 2;
/** Something no session step asks for: its target words are not heard, so the take is not measured. */
const UNRELATED = 'Det regner mye i dag.';
/** The carrier frame of a word take (exercise-engine `domain/carrier.ts`). */
const frame = (word: string) => `Nå sier jeg ${word} igjen.`;
/** Initial Fisher stability FSRS gives a new card per first rating (seen in step 13.5a). */
const FIRST_STABILITY: Record<string, number> = { AGAIN: 0.21, HARD: 1.29, GOOD: 2.31 };

const RABBIT = 'http://localhost:15672/api';
const EXCHANGE = 'exercise-engine.events';
const QUEUE = `plan86-session-live-${Date.now()}`;

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.dev');
const rabbitAuth = 'Basic ' + Buffer.from(`ssz_admin:${readEnv(envFile, 'RABBITMQ_PASSWORD')}`).toString('base64');
const redisPassword = readEnv(envFile, 'REDIS_PASSWORD');
const speechKey = readEnv(envFile, 'AZURE_SPEECH_KEY');

let step = 0;
function pass(message: string): void {
  console.log(`  ✔ ${message}`);
}
function note(message: string): void {
  console.log(`  · ${message}`);
}
function fail(message: string, detail?: unknown): never {
  console.error(`  ✘ ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2).slice(0, 4000));
  throw new Error(message);
}
function expect(condition: boolean, message: string, detail?: unknown): void {
  if (condition) pass(message);
  else fail(message, detail);
}
function heading(title: string): void {
  console.log(`\n${++step}. ${title}`);
}

function readEnv(file: string, key: string): string {
  const line = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} is not in ${file}`);
  return line.slice(key.length + 1).trim();
}

/** One query as the admin role; rows of `|`-separated columns. */
function sql(db: string, query: string): string[][] {
  const out = execFileSync(
    'docker',
    ['exec', 'infrastructure-postgres-1', 'psql', '-U', 'ssz_admin', '-d', db, '-At', '-F', '|', '-v', 'ON_ERROR_STOP=1', '-c', query],
    { encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => l.split('|'));
}

/** ai-service's Redis (DB 6; the client prefixes `ai:`). */
function redis(...args: string[]): string {
  return execFileSync(
    'docker',
    ['exec', 'infrastructure-redis-1', 'redis-cli', '-a', redisPassword, '--no-auth-warning', '-n', '6', ...args],
    { encoding: 'utf8' },
  ).trim();
}

async function http(method: string, url: string, token: string | null, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(url.startsWith('http') ? url : `${GATEWAY}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: kept as text for the failure message.
  }
  return { status: res.status, body: parsed };
}

async function login(email: string): Promise<{ token: string; userId: string }> {
  const res = await http('POST', '/api/v1/auth/login', null, { email, password: PASSWORD });
  if (res.status !== 200) fail(`login ${email} → ${res.status}`, res.body);
  const token = res.body.accessToken as string;
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  return { token, userId: claims.sub };
}

async function rabbit(method: string, route: string, body?: unknown): Promise<any> {
  const res = await fetch(`${RABBIT}${route}`, {
    method,
    headers: { authorization: rabbitAuth, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`rabbitmq ${method} ${route} → ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const seen: Array<{ routingKey: string; envelope: any }> = [];
/** Everything the exercise-engine exchange published since the queue was bound, kept in `seen`. */
async function drainEvents(): Promise<void> {
  const messages: Array<{ routing_key: string; payload: string }> = await rabbit('POST', `/queues/%2F/${QUEUE}/get`, {
    count: 500,
    ackmode: 'ack_requeue_false',
    encoding: 'auto',
  });
  seen.push(...messages.map((m) => ({ routingKey: m.routing_key, envelope: JSON.parse(m.payload) })));
}

async function waitFor<T>(what: string, probe: () => Promise<T | null> | T | null, timeoutMs = 20_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() > until) fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

// --- Audio -------------------------------------------------------------------------------------

const ttsBase = sql('ai_db', `select base_url from ai_providers where code='azure-tts'`)[0]?.[0];

/** Azure TTS straight to webm/opus: the «learner» saying a sentence, right or wrong. */
async function speak(text: string): Promise<{ audio: Buffer; mimeType: string }> {
  if (!ttsBase) fail('ai_db has no `azure-tts` provider row (its base_url is the synthesis endpoint)');
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ssml =
    `<speak version="1.0" xml:lang="nb-NO"><voice name="${VOICE}">` +
    `<prosody rate="-10%">${escaped}</prosody></voice></speak>`;
  const res = await fetch(new URL('cognitiveservices/v1', ttsBase.endsWith('/') ? ttsBase : `${ttsBase}/`), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'webm-24khz-16bit-mono-opus',
      'User-Agent': 'ssz-plan86-live',
    },
    body: ssml,
  });
  if (!res.ok) fail(`Azure TTS «${text}» → ${res.status} ${await res.text()}`);
  return { audio: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/webm' };
}

/** A reference clip of the step (mp3), re-encoded to webm through pipes (snap ffmpeg cannot see /tmp). */
async function clipAudio(url: string): Promise<{ audio: Buffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) fail(`reference clip → ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const out = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-c:a', 'libopus', '-f', 'webm', 'pipe:1'], {
    input,
    maxBuffer: 1 << 24,
  });
  if (out.status !== 0 || !out.stdout?.length) fail(`ffmpeg: ${out.stderr?.toString() ?? 'no output'}`);
  return { audio: out.stdout, mimeType: 'audio/webm' };
}

/**
 * The inventory's notes are English; the model writes in the explanation language. With a reader
 * of Russian or Ukrainian, a Cyrillic remark is the model's.
 */
const EXPLAINED_IN_CYRILLIC = LOCALE === 'ru' || LOCALE === 'uk';
function byModel(text: unknown): boolean {
  return EXPLAINED_IN_CYRILLIC && typeof text === 'string' && /[\u0400-\u04FF]/.test(text);
}

/** `kj` / `tj` / soft `k` said as `sj` — the classic confusion of the two sounds. */
function wrongKj(word: string): string {
  const swapped = word.replace(/^(kj|tj|k)/i, (m) => (m[0] === m[0].toUpperCase() ? 'Sj' : 'sj'));
  if (swapped === word) fail(`«${word}» does not start with a kj spelling; cannot say it wrong`);
  return swapped;
}

// --- Session API -------------------------------------------------------------------------------

interface Take {
  outcome: 'judged' | 'stopped' | 'retry';
  reason: string | null;
  verdict: { measured: boolean; passed: boolean | null; key: string | null } | null;
  feedback: any;
  events: Array<{ kind: string; [k: string]: unknown }>;
  session: any;
}

async function upload(token: string, attemptId: string, take: { audio: Buffer; mimeType: string }): Promise<string> {
  const req = await http('POST', '/api/v1/media/uploads/request', token, {
    mimeType: take.mimeType,
    sizeBytes: take.audio.length,
    entityType: 'submission_recording',
    entityId: attemptId,
  });
  if (req.status !== 200 && req.status !== 201) fail(`upload request → ${req.status}`, req.body);
  const put = await fetch(req.body.uploadUrl, { method: 'PUT', headers: { 'content-type': take.mimeType }, body: new Uint8Array(take.audio) });
  if (!put.ok) fail(`upload PUT → ${put.status}`);
  const fin = await http('POST', `/api/v1/media/uploads/${req.body.assetId}/finalize`, token, {});
  if (fin.status >= 300) fail(`finalize → ${fin.status}`, fin.body);
  return req.body.assetId as string;
}

/** One take: upload, then send until media has measured it (`recording_not_ready` is one more wait). */
async function sendTake(token: string, session: any, audio: { audio: Buffer; mimeType: string }): Promise<Take> {
  const assetId = await upload(token, session.attemptId, audio);
  for (let i = 0; i < 15; i++) {
    const res = await http('POST', `/api/v1/sound-sessions/${session.attemptId}/takes`, token, {
      recordingAssetId: assetId,
      takeIndex: session.takeIndex,
      explanationLanguage: LOCALE,
    });
    if (res.status !== 200) fail(`take → ${res.status}`, res.body);
    const take = res.body as Take;
    if (take.outcome === 'retry' && take.reason === 'recording_not_ready') {
      await new Promise((r) => setTimeout(r, 1_500));
      continue;
    }
    if (take.outcome === 'retry') fail(`take answered retry: ${take.reason}`, take);
    return take;
  }
  fail('the recording was never ready');
}

async function items(token: string, attemptId: string): Promise<any> {
  const res = await http('GET', `/api/v1/sound-sessions/${attemptId}/items?locale=${LOCALE}`, token);
  if (res.status !== 200) fail(`items → ${res.status}`, res.body);
  return res.body;
}

/** What Azure scored in the target words, as `word ç0 æː61 …`, for the log. */
function phonemesOf(take: Take, words: string[]): string {
  const wanted = new Set(words.map((w) => w.toLowerCase()));
  return (take.feedback?.words ?? [])
    .filter((w: any) => wanted.has(String(w.text).toLowerCase()))
    .map((w: any) => `${w.text} ${(w.phonemes ?? []).map((p: any) => `${p.symbol || '?'}${p.accuracy ?? ''}`).join(' ')}`)
    .join(' | ');
}

function verdictText(take: Take): string {
  const v = take.verdict;
  if (!v) return `${take.outcome} (${take.reason})`;
  if (!v.measured) return 'not measured';
  return v.passed ? 'passed' : `missed ${v.key}`;
}


// --- Ledger and learner state ------------------------------------------------------------------

function soundRecord(userId: string): { cards: string[][]; flags: string[][] } {
  return {
    cards: sql('learning_db', `select content_id, stability, reps from srs_review_cards where user_id='${userId}' and content_type='sound_atom'`),
    flags: sql(
      'learning_db',
      `select atom_id, source, outcome from atom_flags where user_id='${userId}' and atom_type='sound' and flagged_on >= current_date - 14`,
    ),
  };
}

/**
 * The learner's `pronunciation_session` calls between two instants. By time, not by probe: a
 * toneme take is recorded without `exercise_id` (the engine does not send it to `toneme-checks`),
 * and the run's sessions follow one another, so a window is one session.
 */
function sessionCalls(userId: string, from: string, to: string): string[][] {
  return sql(
    'ai_db',
    `select capability, outcome, payer_type, payer_id, coalesce(audio_ms, 0), credits, coalesce(exercise_id, '') from ai_calls ` +
      `where actor_user_id='${userId}' and surface='pronunciation_session' and created_at >= '${from}' and created_at < '${to}' ` +
      `order by created_at`,
  );
}

/** Calls of the explaining model in the learner's session so far: a take that asked the model adds one. */
function explainCalls(userId: string, from: string): number {
  return Number(
    sql(
      'ai_db',
      `select count(*) from ai_calls where actor_user_id='${userId}' and surface='pronunciation_session' ` +
        `and capability='pronunciation_explain' and created_at >= '${from}'`,
    )[0]![0],
  );
}

function checkLedger(
  label: string,
  userId: string,
  window: { from: string; to: string },
  heard: number,
  payer: { type: string; id: string },
): void {
  const calls = sessionCalls(userId, window.from, window.to);
  const takes = calls.filter(([cap]) => cap === 'practice_voice' || cap === 'toneme_check');
  const explains = calls.filter(([cap]) => cap === 'pronunciation_explain');
  const credits = (rows: string[][]) => rows.reduce((sum, c) => sum + Number(c[5]), 0);
  const audioMs = takes.reduce((sum, c) => sum + Number(c[4]), 0);
  expect(takes.length === heard, `${label}: ${heard} heard take(s) = ${takes.length} pronunciation_session take call(s)`, calls);
  expect(
    calls.every(([, , type, id]) => type === payer.type && id === payer.id),
    `${label}: every call paid by ${payer.type} ${payer.id}`,
    calls,
  );
  const unlinked = calls.filter((c) => c[6] === '').map((c) => c[0]);
  if (unlinked.length > 0) note(`${label}: without exercise_id in the ledger: ${unlinked.join(', ')}`);
  note(
    `${label}: takes ${credits(takes).toFixed(3)} credits (${(audioMs / 1000).toFixed(1)} s of audio), ` +
      `${explains.length} explanation(s) ${credits(explains).toFixed(3)} credits — ${credits(calls).toFixed(3)} in all`,
  );
}

// --- Run ---------------------------------------------------------------------------------------

async function main(): Promise<void> {
  heading('Preconditions');
  const student = await login(STUDENT_EMAIL);
  pass(`logged in ${STUDENT_EMAIL} (${student.userId})`);

  const bindings = sql(
    'ai_db',
    `select capability, enabled from ai_bindings where capability in ('practice_voice','toneme_check','pronunciation_explain')`,
  );
  for (const cap of ['practice_voice', 'toneme_check', 'pronunciation_explain']) {
    expect(bindings.some(([c, on]) => c === cap && on === 't'), `ai_db: \`${cap}\` binding enabled`, bindings);
  }
  const ffmpeg = spawnSync('ffmpeg', ['-version']);
  expect(ffmpeg.status === 0, 'ffmpeg is on PATH');

  if (RESET) {
    sql('learning_db', `delete from srs_review_cards where user_id='${student.userId}' and content_type='sound_atom'`);
    sql('learning_db', `delete from atom_flags where user_id='${student.userId}' and atom_type='sound'`);
    note('RESET=1: the learner’s sound cards and flags deleted');
  }
  const record = soundRecord(student.userId);
  expect(
    record.cards.length === 0 && record.flags.length === 0,
    'the learner has no sound card and no sound flag of the last 14 days (cold start)',
    { ...record, hint: 'run with RESET=1 to delete them' },
  );
  const open = sql(
    'exercises_db',
    `select id from attempts where user_id='${student.userId}' and template_code='sound_session' and status='in_progress'`,
  );
  expect(open.length === 0, 'no open pronunciation session', { open, hint: 'hand it in: POST /api/v1/sound-sessions/:id/submit' });
  redis('del', `ai:sound-session:day:${student.userId}`);
  pass('the day’s session counter cleared');

  await rabbit('PUT', `/queues/%2F/${QUEUE}`, { durable: false, auto_delete: false, arguments: {} });
  await rabbit('POST', `/bindings/%2F/e/${EXCHANGE}/q/${QUEUE}`, { routing_key: '#' });
  pass(`listening on ${EXCHANGE} (queue ${QUEUE})`);

  const startedAt = new Date().toISOString();
  const probes: string[] = [];
  try {
    // ---------------------------------------------------------------------------------------
    heading('Cold start: the diagnostic');
    const s1At = new Date().toISOString();
    const start1 = await http('POST', '/api/v1/sound-sessions', student.token, { language: LANGUAGE });
    expect(start1.status === 200, `session 1 started (${start1.body?.attemptId})`, start1.body);
    let s1 = start1.body;
    probes.push(s1.probeId);
    expect(s1.basis === 'diagnostic' && s1.phase === 'diagnostic', `basis diagnostic, ${s1.diagnostic?.total} families`, s1);
    const budget = s1.budget;
    expect(budget !== null && typeof budget === 'object', `budget: ${JSON.stringify(budget)}`, s1);
    const payer =
      budget.payer === 'school'
        ? { type: 'workspace', id: sql('exercises_db', `select school_id from attempts where id='${s1.attemptId}'`)[0]![0]! }
        : { type: 'user', id: student.userId };

    let heard1 = 0;
    let kjWeak = false;
    while (s1.phase === 'diagnostic') {
      const it = await items(student.token, s1.attemptId);
      const st = it.session.step;
      const wrong = st.atomId === ATOM;
      const clip = it.clips.find((c: any) => c.word === st.word) ?? it.clips[0];
      if (!wrong && !clip) fail(`no reference clip for the diagnostic word «${st.word}»`, it);
      const take = await sendTake(student.token, it.session, wrong ? await speak(frame(wrongKj(st.word))) : await clipAudio(clip.url));
      expect(take.outcome === 'judged', `${st.atomId} «${st.word}» (${wrong ? 'said wrong' : 'reference clip'}): ${verdictText(take)}`, take);
      if (wrong) note(`heard: ${phonemesOf(take, [st.word])}`);
      heard1 += 1;
      if (take.events.some((e) => e.kind === 'diagnostic_measured' && e.atomId === ATOM && e.weak)) kjWeak = true;
      s1 = take.session;
    }
    const done = seenEvents(s1);
    expect(kjWeak, `the diagnostic heard ${ATOM} as weak`, s1);
    expect(s1.phase === 'drill' && s1.sounds.some((s: any) => s.atomId === ATOM), `drill opened on ${s1.sounds.map((s: any) => s.atomId).join(', ')}`, s1);
    note(done);

    const submit1 = await http('POST', `/api/v1/sound-sessions/${s1.attemptId}/submit?locale=${LOCALE}`, student.token);
    expect(submit1.status === 200, `session 1 handed in at once (doneReason ${submit1.body?.doneReason})`, submit1.body);
    expect(
      submit1.body.sounds.every((s: any) => s.rating === null),
      'no sound rated (no drill take)',
      submit1.body.sounds,
    );
    expect(submit1.body.flagged.includes(ATOM), `flagged ai_session: ${submit1.body.flagged.join(', ')}`, submit1.body);

    const flagged = await waitFor('exercise.feedback.atoms_flagged of session 1', async () => {
      await drainEvents();
      return seen.find((e) => e.routingKey === 'exercise.feedback.atoms_flagged' && e.envelope.payload?.attemptId === s1.attemptId) ?? null;
    });
    expect(flagged.envelope.payload.source === 'ai_session', 'atoms_flagged published with source ai_session', flagged.envelope);
    const flagRow = await waitFor('learning to store the flag', () => {
      const rows = sql('learning_db', `select source, outcome from atom_flags where attempt_id='${s1.attemptId}' and atom_id='${ATOM}'`);
      return rows.length > 0 ? rows[0]! : null;
    });
    expect(flagRow[0] === 'ai_session' && flagRow[1] !== 'introduced', `learning: atom_flags ${flagRow.join(' / ')}`, flagRow);
    expect(soundRecord(student.userId).cards.length === 0, 'learning: no sound card introduced by the flag');
    const weakRow = await waitFor('analytics weak_rules_daily', () => {
      const rows = sql('analytics_db', `select atom_type, source from weak_rules_daily where exercise_id='${s1.probeId}' and atom_id='${ATOM}'`);
      return rows.length > 0 ? rows[0]! : null;
    });
    expect(weakRow[0] === 'sound' && weakRow[1] === 'ai_session', `analytics: weak_rules_daily ${weakRow.join(' / ')}`, weakRow);
    checkLedger('session 1', student.userId, { from: s1At, to: new Date().toISOString() }, heard1, payer);

    // ---------------------------------------------------------------------------------------
    heading(`A session on ${ATOM}: ${MAX_TAKES} takes, then the limit`);
    const s2At = new Date().toISOString();
    const start2 = await http('POST', '/api/v1/sound-sessions', student.token, { language: LANGUAGE, atomId: ATOM });
    expect(start2.status === 200 && start2.body.basis === 'chosen' && !start2.body.resumed, `session 2 started (${start2.body?.attemptId}), basis chosen`, start2.body);
    let s2 = start2.body;
    probes.push(s2.probeId);

    const sentOnElement = new Map<number, number>();
    let heard2 = 0;
    let measuredMisses = 0;
    let lastMiss: { element: number; key: string } | null = null;
    while (s2.phase === 'drill') {
      const it = await items(student.token, s2.attemptId);
      const st = it.session.step;
      const sent = sentOnElement.get(st.elementIndex) ?? 0;
      sentOnElement.set(st.elementIndex, sent + 1);
      let what: string;
      let audio: { audio: Buffer; mimeType: string };
      if (st.element.kind === 'phrase') {
        what = `line «${st.element.text}» ← unrelated sentence`;
        audio = await speak(UNRELATED);
      } else if (sent < MISSES_PER_WORD) {
        what = `«${st.say}» said wrong (${wrongKj(st.say)})`;
        audio = await speak(frame(wrongKj(st.say)));
      } else {
        const clip = it.clips.find((c: any) => c.word === st.say);
        if (!clip) fail(`no reference clip for «${st.say}»`, it);
        what = `«${st.say}» as its reference clip`;
        audio = await clipAudio(clip.url);
      }
      if (sent === 0 && it.instruction) note(`instruction for ${st.atomId}: ${it.instruction.title}`);
      const explainsBefore = explainCalls(student.userId, s2At);
      const take = await sendTake(student.token, it.session, audio);
      heard2 += 1;
      const modelCalls = explainCalls(student.userId, s2At) - explainsBefore;
      const targetRemark = take.feedback?.items?.find((i: any) => i.atomRef?.atomId === ATOM) ?? null;
      const targetExplained = targetRemark !== null && byModel(targetRemark.explanation);
      const others = (take.feedback?.items ?? [])
        .filter((i: any) => i.atomRef?.atomId && i.atomRef.atomId !== ATOM && byModel(i.explanation))
        .map((i: any) => i.atomRef.atomId);
      console.log(
        `  - take ${take.session.takes}/${MAX_TAKES}, element ${st.elementIndex}: ${what} → ${verdictText(take)}` +
          `${targetExplained ? ', target explained' : ''}${others.length ? `, model on ${others.join(', ')}` : ''}` +
          ` (${modelCalls} model call) [${take.events.map((e) => e.kind).join(', ')}]`,
      );
      if (st.element.kind !== 'phrase') note(`heard: ${phonemesOf(take, [st.say])}`);
      expect(take.outcome === 'judged', `take judged`, take);
      if (take.verdict?.measured && !take.verdict.passed) {
        measuredMisses += 1;
        if (lastMiss && lastMiss.element === st.elementIndex && lastMiss.key === take.verdict.key) {
          if (EXPLAINED_IN_CYRILLIC) {
            expect(!targetExplained, `the same miss ${take.verdict.key} on the same rung keeps the base's note, not a new explanation`, targetRemark);
          }
        } else if (take.verdict.key) {
          // Only an explained miss is remembered on the rung (§5.5a); one the model failed on is asked again.
          lastMiss = targetExplained || !EXPLAINED_IN_CYRILLIC ? { element: st.elementIndex, key: take.verdict.key } : null;
        }
      }
      if (take.verdict && !take.verdict.measured) {
        expect(modelCalls === 0 || others.length > 0, 'a take not measured asks the model nothing about the target', take.feedback);
      }
      s2 = take.session;
    }
    expect(s2.phase === 'done' && s2.doneReason === 'take_limit', `session done: ${s2.doneReason} after ${s2.takes} takes`, s2);
    expect(s2.takes === MAX_TAKES, `exactly ${MAX_TAKES} drill takes`, s2);

    const late = await http('POST', `/api/v1/sound-sessions/${s2.attemptId}/takes`, student.token, {
      recordingAssetId: '00000000-0000-4000-8000-000000000000',
      takeIndex: s2.takeIndex,
    });
    expect(late.status === 409 && late.body?.code === 'SESSION_CLOSED', `an eleventh take → ${late.status} ${late.body?.code}`, late.body);

    const submit2 = await http('POST', `/api/v1/sound-sessions/${s2.attemptId}/submit?locale=${LOCALE}`, student.token);
    expect(submit2.status === 200, `session 2 handed in (score ${submit2.body?.score})`, submit2.body);
    const kj = submit2.body.sounds.find((s: any) => s.atomId === ATOM);
    const expected = kj?.passes > 0 ? (kj.fails > 0 ? 'HARD' : 'GOOD') : kj?.fails >= 2 ? 'AGAIN' : null;
    expect(kj && kj.rating === expected, `${ATOM} rated ${kj?.rating} (passes ${kj?.passes}, measured misses ${kj?.fails})`, submit2.body.sounds);
    note(`measured misses seen in the answers: ${measuredMisses}`);
    expect(!submit2.body.flagged.includes(ATOM), `the rated sound is not flagged (flagged: ${submit2.body.flagged.join(', ') || 'none'})`, submit2.body);

    const completed = await waitFor('exercise.attempt.completed of session 2', async () => {
      await drainEvents();
      return (
        seen.find(
          (e) =>
            e.routingKey === 'exercise.attempt.completed' &&
            (e.envelope.payload?.attemptId === s2.attemptId || e.envelope.payload?.exerciseId === s2.probeId),
        ) ?? null
      );
    });
    const gaps = completed.envelope.payload.gapResults ?? [];
    const gap = gaps.find((g: any) => g.gapKey === ATOM);
    const score = { GOOD: 90, HARD: 70, AGAIN: 0 }[kj.rating as string];
    expect(gaps.length === 1 && gap?.score === score, `attempt.completed: one gap ${ATOM}, score ${gap?.score}`, gaps);
    expect(!(completed.envelope.payload.targets?.length > 0), 'no exercise-level targets on the event', completed.envelope.payload.targets);
    const card = await waitFor('learning to introduce the sound card', () => {
      const rows = soundRecord(student.userId).cards.filter(([id]) => id === ATOM);
      return rows.length > 0 ? rows[0]! : null;
    });
    expect(
      Math.abs(Number(card[1]) - FIRST_STABILITY[kj.rating]!) < 0.05,
      `learning: card ${ATOM}, stability ${card[1]} (first ${kj.rating})`,
      card,
    );
    checkLedger('session 2', student.userId, { from: s2At, to: new Date().toISOString() }, heard2, payer);

    // ---------------------------------------------------------------------------------------
    heading('The day’s limit of sessions');
    const s3At = new Date().toISOString();
    const start3 = await http('POST', '/api/v1/sound-sessions', student.token, { language: LANGUAGE, atomId: OTHER_ATOM });
    expect(start3.status === 200 && !start3.body.resumed, `session 3 started (${start3.body?.attemptId})`, start3.body);
    probes.push(start3.body.probeId);
    expect(redis('get', `ai:sound-session:day:${student.userId}`) === '3', 'the day counter is 3');
    const start4 = await http('POST', '/api/v1/sound-sessions', student.token, { language: LANGUAGE, atomId: THIRD_ATOM });
    expect(
      start4.status === 422 && start4.body?.code === 'SESSION_LIMIT' && start4.body?.retryAfterMs > 0,
      `a fourth session → ${start4.status} ${start4.body?.code} (retry in ${Math.round((start4.body?.retryAfterMs ?? 0) / 60_000)} min)`,
      start4.body,
    );
    const resumed = await http('POST', '/api/v1/sound-sessions', student.token, { language: LANGUAGE, atomId: OTHER_ATOM });
    expect(
      resumed.status === 200 && resumed.body.resumed && resumed.body.attemptId === start3.body.attemptId,
      'session 3 is still open: asking for it again resumes it',
      resumed.body,
    );
    const submit3 = await http('POST', `/api/v1/sound-sessions/${start3.body.attemptId}/submit`, student.token);
    expect(submit3.status === 200 && submit3.body.sounds.every((s: any) => s.rating === null), 'session 3 handed in untouched: nothing rated', submit3.body);
    expect(sessionCalls(student.userId, s3At, new Date().toISOString()).length === 0, 'session 3: no call in the ledger');
  } finally {
    // A run that failed half-way leaves its session open; handing it in lets the next run start
    // cold (what the hand-in wrote is deleted below with the rest).
    for (const [id] of sql(
      'exercises_db',
      `select id from attempts where user_id='${student.userId}' and template_code='sound_session' and status='in_progress'`,
    )) {
      const res = await http('POST', `/api/v1/sound-sessions/${id}/submit`, student.token).catch(() => null);
      note(`left open by the run: session ${id} handed in → ${res?.status ?? 'no answer'}`);
    }
    await new Promise((r) => setTimeout(r, 3_000)); // let learning and analytics take what the hand-in published
    await rabbit('DELETE', `/queues/%2F/${QUEUE}`).catch(() => undefined);
    redis('del', `ai:sound-session:day:${student.userId}`);
    if (!KEEP && probes.length > 0) {
      const list = probes.map((p) => `'${p}'`).join(',');
      sql('learning_db', `delete from srs_review_cards where user_id='${student.userId}' and content_type='sound_atom' and created_at >= '${startedAt}'`);
      sql('learning_db', `delete from atom_flags where user_id='${student.userId}' and exercise_id in (${list})`);
      for (const table of ['weak_rules_daily', 'atom_evidence', 'attempt_evidence']) {
        sql('analytics_db', `delete from ${table} where user_id='${student.userId}' and exercise_id in (${list})`);
      }
      console.log('\n(queue removed; day counter cleared; the run’s sound cards, flags and analytics rows deleted — KEEP=1 keeps them)');
    } else {
      console.log('\n(queue removed; day counter cleared; data kept)');
    }
  }
  console.log('\nAll expectations met.');
}

/** A line about what the diagnostic found, for the log. */
function seenEvents(session: any): string {
  return `after the diagnostic: phase ${session.phase}, sounds ${session.sounds.map((s: any) => `${s.atomId}:${s.status}`).join(', ') || 'none'}`;
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
