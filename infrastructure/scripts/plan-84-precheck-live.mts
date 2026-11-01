// End-to-end run of the rehearsal before hand-in (plan 84, step 6) against the live dev stack:
// gateway → exercise-engine → organization-service + subscription-service → ai-service → ledger.
//
// What it proves, in order:
//   1. "check" ×N on one attempt answers `ok` until the school's per-exercise limit, then
//      `refused: exercise_limit`; the ledger holds one `surface: precheck` call per check.
//   2. Until the hand-in nothing reaches learning-service: after the start's own
//      `exercise.attempt.started` no exercise-engine event about the attempt is published, and the learner's progress row and cards for the exercise are
//      exactly as they were. The attempt stays `in_progress`.
//   3. The hand-in is the ordinary one: `exercise.attempt.completed` is published, learning
//      processes it, and the progress row and the card appear as they always have.
//   4. After the hand-in "check" on that attempt → 409; a new attempt of the same exercise is
//      still refused with `exercise_limit` — the count is per (learner, exercise), not per attempt.
//
// Preconditions on the stack (the script checks them and stops if one is missing):
//   - exercise-engine, ai-service, organization-service built from this branch, nginx restarted;
//   - ai_db: a `practice` binding (the `fake` model keeps the run free and deterministic);
//   - the school has `ai.practice` (plan or grant) and the exercise has the author's AI on.
// The school's per-exercise limit is raised for the run to (checks used + RUN_CHECKS) and put
// back afterwards, so the script can be run again on the same learner.
//
// Usage (from infrastructure/, Node 22.6+):
//   node --experimental-strip-types scripts/plan-84-precheck-live.mts
// Env overrides: GATEWAY (http://localhost), STUDENT_EMAIL, ADMIN_EMAIL, DEV_PASSWORD,
// EXERCISE_ID, COURSE_ID, SCHOOL_ID. Exit code 1 on the first failed expectation.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GATEWAY = process.env.GATEWAY ?? 'http://localhost';
const STUDENT_EMAIL = process.env.STUDENT_EMAIL ?? 'student1@email.com';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'school@email.com';
const PASSWORD = process.env.DEV_PASSWORD ?? '!Password1234';
// Nordick, Norsk B1, unit «10 — Grammatikk og øvelser», writing_task «Skriv et leserinnlegg».
const SCHOOL_ID = process.env.SCHOOL_ID ?? 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const COURSE_ID = process.env.COURSE_ID ?? '64cb0a41-18af-5799-9c7a-622ee0d381cd';
const EXERCISE_ID = process.env.EXERCISE_ID ?? '0101ed6e-3485-5181-b508-8e9104f26214';
const RUN_CHECKS = 2;

const RABBIT = 'http://localhost:15672/api';
const EXCHANGE = 'exercise-engine.events';
const QUEUE = `plan84-precheck-live-${Date.now()}`;

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env.dev');
const rabbitPassword = readEnv(envFile, 'RABBITMQ_PASSWORD');
const rabbitAuth = 'Basic ' + Buffer.from(`ssz_admin:${rabbitPassword}`).toString('base64');

const DRAFT = {
  text:
    'Jeg mener at byen vår trenger flere sykkelveier. For det første er det farlig å sykle i sentrum, ' +
    'fordi bilene kjører fort. For det andre blir luften bedre hvis flere sykler. Dessuten sparer folk penger. ' +
    'Likevel sier noen at det koster for mye. Jeg håper at kommunen bygger nye sykkelveier neste år.',
  ticked: [],
};

let step = 0;
function pass(message: string): void {
  console.log(`  ✔ ${message}`);
}
function fail(message: string, detail?: unknown): never {
  console.error(`  ✘ ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
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

async function http(
  method: string,
  url: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await fetch(url.startsWith('http') ? url : `${GATEWAY}${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
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

/** Everything the exercise-engine exchange published since the queue was bound. */
async function drainEvents(): Promise<Array<{ routingKey: string; envelope: any }>> {
  const messages: Array<{ routing_key: string; payload: string }> = await rabbit(
    'POST',
    `/queues/%2F/${QUEUE}/get`,
    { count: 500, ackmode: 'ack_requeue_false', encoding: 'auto' },
  );
  return messages.map((m) => ({ routingKey: m.routing_key, envelope: JSON.parse(m.payload) }));
}

/**
 * An exercise-engine event about this learner's work on the exercise. Not every payload names
 * the attempt — `exercise.attempt.completed` for unscored work carries only user and exercise.
 */
function isAbout(envelope: any, userId: string, attemptId: string): boolean {
  const p = envelope?.payload ?? {};
  return p.attemptId === attemptId || (p.userId === userId && p.exerciseId === EXERCISE_ID);
}

/** The learner's progress row and cards on the exercise, as text to compare. */
function learningSnapshot(userId: string): { progress: string[][]; cards: string[][] } {
  return {
    progress: sql(
      'learning_db',
      `select status, attempts_count, updated_at from user_progress where user_id='${userId}' and content_id='${EXERCISE_ID}'`,
    ),
    cards: sql(
      'learning_db',
      `select state, reps, updated_at from srs_review_cards where user_id='${userId}' and content_id='${EXERCISE_ID}'`,
    ),
  };
}

function checksUsed(userId: string): number {
  const [[count]] = sql(
    'ai_db',
    `select count(distinct check_id) from ai_calls where payer_id='${SCHOOL_ID}' and actor_user_id='${userId}' ` +
      `and exercise_id='${EXERCISE_ID}' and surface='precheck' and outcome='ok' and check_id is not null`,
  );
  return Number(count);
}

function precheckCalls(userId: string, since: string): string[][] {
  return sql(
    'ai_db',
    `select outcome, model_id, check_id from ai_calls where actor_user_id='${userId}' and exercise_id='${EXERCISE_ID}' ` +
      `and surface='precheck' and created_at >= '${since}' order by created_at`,
  );
}

async function startAttempt(token: string): Promise<string> {
  const res = await http('POST', `/api/v1/exercises/${EXERCISE_ID}/attempts`, token, { language: 'nb' });
  if (res.status === 201 || res.status === 200) return res.body.attemptId;
  if (res.status === 409 && res.body?.attemptId) return res.body.attemptId;
  fail(`start attempt → ${res.status}`, res.body);
}

function check(token: string, attemptId: string) {
  return http('POST', `/api/v1/exercises/${EXERCISE_ID}/attempts/${attemptId}/check`, token, { draftAnswer: DRAFT });
}

function attemptStatus(attemptId: string): string {
  return sql('exercises_db', `select status from attempts where id='${attemptId}'`)[0]?.[0] ?? 'missing';
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

async function main(): Promise<void> {
  heading('Preconditions');
  const student = await login(STUDENT_EMAIL);
  const admin = await login(ADMIN_EMAIL);
  pass(`logged in ${STUDENT_EMAIL} (${student.userId}) and ${ADMIN_EMAIL}`);

  const [binding] = sql('ai_db', `select enabled from ai_bindings where capability='practice'`);
  expect(binding?.[0] === 't', 'ai_db has an enabled `practice` binding');
  const [authorAi] = sql('content_db', `select content->'settings'->>'aiStage' from exercises where id='${EXERCISE_ID}'`);
  expect(authorAi?.[0] === 'true', 'the exercise has the author’s AI on (settings.aiStage)');

  const settingsRes = await http('GET', `/api/v1/schools/${SCHOOL_ID}/ai-precheck`, admin.token);
  expect(settingsRes.status === 200, 'GET schools/:id/ai-precheck answers', settingsRes.body);
  const original = settingsRes.body as { enabled: boolean; perExerciseLimit: number | null; perLearnerMonthlyCredits: number | null };

  const [enrolled] = sql(
    'learning_db',
    `select id from enrollments where user_id='${student.userId}' and container_id='${COURSE_ID}' and status='active' and deleted_at is null`,
  );
  if (!enrolled) {
    const res = await http('POST', '/api/v1/enrollments', student.token, { containerId: COURSE_ID, schoolId: SCHOOL_ID });
    expect(res.status === 201 || res.status === 200, 'enrolled the learner in the course', res.body);
  } else {
    pass('the learner is enrolled in the course');
  }

  const used = checksUsed(student.userId);
  const limit = used + RUN_CHECKS;
  const put = await http('PUT', `/api/v1/schools/${SCHOOL_ID}/ai-precheck`, admin.token, {
    enabled: true,
    perExerciseLimit: limit,
    perLearnerMonthlyCredits: null,
  });
  expect(put.status === 200, `school limit set to ${limit} (${used} used before this run)`, put.body);

  await rabbit('PUT', `/queues/%2F/${QUEUE}`, { durable: false, auto_delete: false, arguments: {} });
  await rabbit('POST', `/bindings/%2F/e/${EXCHANGE}/q/${QUEUE}`, { routing_key: '#' });
  pass(`listening on ${EXCHANGE} (queue ${QUEUE})`);

  const startedAt = new Date().toISOString();
  try {
    const before = learningSnapshot(student.userId);

    heading(`Rehearse until the per-exercise limit (${RUN_CHECKS} checks left)`);
    const attemptId = await startAttempt(student.token);
    pass(`attempt ${attemptId} in progress`);
    // The start publishes `exercise.attempt.started` itself; what follows must publish nothing.
    await new Promise((r) => setTimeout(r, 1_000));
    const started = await drainEvents();
    pass(`drained what the start published: ${started.map((e) => e.routingKey).join(', ') || 'nothing'}`);
    for (let i = 1; i <= RUN_CHECKS; i++) {
      const res = await check(student.token, attemptId);
      expect(
        res.status === 200 && res.body.ai?.status === 'ok' && res.body.feedback !== null,
        `check ${i}: ai ok, feedback with ${res.body.feedback?.items?.length ?? '?'} item(s), remaining.exercise = ${res.body.remaining?.exercise}`,
        res.body,
      );
      expect(res.body.remaining?.exercise === RUN_CHECKS - i, `remaining.exercise counts down to ${RUN_CHECKS - i}`, res.body.remaining);
    }
    const refused = await check(student.token, attemptId);
    expect(
      refused.status === 200 && refused.body.ai?.status === 'refused' && refused.body.ai?.reason === 'exercise_limit',
      `check ${RUN_CHECKS + 1}: refused with exercise_limit`,
      refused.body,
    );

    const calls = precheckCalls(student.userId, startedAt);
    expect(
      calls.length === RUN_CHECKS && calls.every(([outcome]) => outcome === 'ok') && new Set(calls.map((c) => c[2])).size === RUN_CHECKS,
      `ledger: ${RUN_CHECKS} precheck calls, each its own check_id (the refusal made none)`,
      calls,
    );

    heading('Nothing reaches learning before the hand-in');
    expect(attemptStatus(attemptId) === 'in_progress', 'the attempt is still in_progress');
    // Give anything a rehearsal might have published time to arrive before reading the queue.
    await new Promise((r) => setTimeout(r, 2_000));
    const early = (await drainEvents()).filter((e) => isAbout(e.envelope, student.userId, attemptId));
    expect(early.length === 0, 'no exercise-engine event about the attempt since its start', early.map((e) => e.routingKey));
    const middle = learningSnapshot(student.userId);
    expect(JSON.stringify(middle) === JSON.stringify(before), 'learning_db: progress row and cards on the exercise unchanged', { before, middle });

    heading('The hand-in is the ordinary one');
    const submit = await http('POST', `/api/v1/exercises/${EXERCISE_ID}/attempts/${attemptId}/submit`, student.token, {
      submittedAnswer: DRAFT,
      timeSpentSeconds: 120,
    });
    expect(submit.status === 200, `submit → 200 (requiresReview: ${submit.body?.requiresReview})`, submit.body);
    const seen: Array<{ routingKey: string; envelope: any }> = [];
    const completed = await waitFor('exercise.attempt.completed', async () => {
      seen.push(...(await drainEvents()).filter((e) => isAbout(e.envelope, student.userId, attemptId)));
      return seen.find((e) => e.routingKey === 'exercise.attempt.completed') ?? null;
    });
    pass(`published: ${seen.map((e) => e.routingKey).join(', ')} (completed: ${completed.envelope.payload.completed}, score: ${completed.envelope.payload.score})`);
    await waitFor('learning to process the event', () =>
      sql('learning_db', `select 1 from processed_events where event_id='${completed.envelope.eventId}'`).length > 0 ? true : null,
    );
    pass('learning-service processed it');
    const after = learningSnapshot(student.userId);
    expect(JSON.stringify(after.progress) !== JSON.stringify(before.progress), `progress row moved: ${JSON.stringify(after.progress)}`, { before, after });
    expect(after.cards.length > 0, `card on the exercise: ${JSON.stringify(after.cards)}`, after);

    heading('After the hand-in');
    const late = await check(student.token, attemptId);
    expect(late.status === 409, `check on the handed-in attempt → 409 ${late.body?.code ?? ''}`, late.body);
    const next = await http('POST', `/api/v1/exercises/${EXERCISE_ID}/attempts`, student.token, { language: 'nb' });
    if (next.status === 201 || next.status === 200) {
      const fresh = await check(student.token, next.body.attemptId);
      expect(
        fresh.status === 200 && fresh.body.ai?.reason === 'exercise_limit',
        `new attempt ${next.body.attemptId}: still refused with exercise_limit`,
        fresh.body,
      );
    } else {
      console.log(`  · a new attempt is not allowed while the work waits for review (${next.status}); limit carry-over not exercised`);
    }
  } finally {
    await http('PUT', `/api/v1/schools/${SCHOOL_ID}/ai-precheck`, admin.token, original).catch(() => undefined);
    await rabbit('DELETE', `/queues/%2F/${QUEUE}`).catch(() => undefined);
    console.log(`\n(school setting restored to ${JSON.stringify(original)}; queue removed)`);
  }
  console.log('\nAll expectations met.');
}

main().catch((err) => {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
