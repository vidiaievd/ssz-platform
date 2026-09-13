import { jest } from "@jest/globals";

jest.unstable_mockModule(
  "../../../../../src/infrastructure/database/prisma.service.js",
  () => ({
    PrismaService: class {},
  }),
);

const { AttemptEvidenceConsumer } =
  await import("../../../../../src/modules/metrics/consumers/attempt-evidence.consumer.js");

// Plan 63 phase 3 — a rating is recorded twice over: once as the attempt it was, in the
// table five readers count as attempts, and once per atom it is evidence about.

interface Row {
  [key: string]: unknown;
}

function fakePrisma() {
  const attempts: Row[] = [];
  const atoms: Row[] = [];
  return {
    attempts,
    atoms,
    prisma: {
      processedEvent: {
        findUnique: async () => null,
        create: async () => undefined,
      },
      attemptEvidence: {
        createMany: async ({ data }: { data: Row[] }) => {
          attempts.push(...data);
        },
      },
      atomEvidence: {
        createMany: async ({ data }: { data: Row[] }) => {
          atoms.push(...data);
        },
      },
    },
  };
}

const mastery = { apply: async () => undefined };

function consumerOn(prisma: unknown) {
  return new (AttemptEvidenceConsumer as any)(
    { get: () => undefined },
    prisma,
    mastery,
  );
}

const rated = (over: Record<string, unknown> = {}) => ({
  userId: "learner-1",
  exerciseId: "exercise-1",
  templateCode: "word_bank_gap_fill",
  answerForm: null,
  score: 100,
  passed: true,
  attemptOrdinal: 1,
  daysSinceLastReview: null,
  gapPosition: null,
  gapCount: null,
  ratingApplied: "GOOD",
  skills: ["written"],
  focus: ["grammar"],
  containerId: "course-1",
  timeSpentSeconds: 30,
  stabilityAfter: 4.5,
  workContext: "homework",
  groupId: null,
  lessonId: null,
  contentType: "EXERCISE_GAP",
  modality: "recall",
  itemKey: "s1#5",
  targets: [{ atomType: "grammar_rule_atom", atomId: "atom-1", role: "focus" }],
  ...over,
});

const channel = { ack: () => undefined, nack: () => undefined };
const message = (payload: unknown, eventId = "evt-1") => ({
  content: Buffer.from(
    JSON.stringify({
      eventId,
      eventType: "learning.attempt.rated",
      occurredAt: "2026-09-13T10:00:00.000Z",
      payload,
    }),
  ),
  fields: { redelivered: false },
});

describe("AttemptEvidenceConsumer — evidence about a fact", () => {
  it("writes one atom row per address, keeping the attempt row as it was", async () => {
    const fake = fakePrisma();
    await (consumerOn(fake.prisma) as any).handleMessage(
      channel,
      message(
        rated({
          targets: [
            { atomType: "grammar_rule_atom", atomId: "atom-1", role: "focus" },
            { atomType: "vocabulary_item", atomId: "word-1", role: "context" },
          ],
        }),
      ),
    );

    expect(fake.attempts).toHaveLength(1);
    expect(fake.attempts[0]).toMatchObject({ modality: "recall" });
    expect(fake.atoms).toHaveLength(2);
    expect(fake.atoms[0]).toMatchObject({
      atomType: "grammar_rule_atom",
      atomId: "atom-1",
      role: "focus",
      itemKey: "s1#5",
      modality: "recall",
      contentType: "EXERCISE_GAP",
      stabilityAfter: 4.5,
      workContext: "homework",
    });
  });

  it("keeps a word coming back out of the attempts table", async () => {
    // Five readers count rows of `attempt_evidence` as attempts. Ten word ratings landing
    // there per attempt would multiply every one of those numbers.
    const fake = fakePrisma();
    await (consumerOn(fake.prisma) as any).handleMessage(
      channel,
      message(
        rated({
          contentType: "VOCABULARY_WORD",
          itemKey: null,
          targets: [
            { atomType: "vocabulary_item", atomId: "word-2", role: null },
          ],
        }),
      ),
    );

    expect(fake.attempts).toHaveLength(0);
    expect(fake.atoms).toHaveLength(1);
    expect(fake.atoms[0]).toMatchObject({ atomId: "word-2", role: null });
  });

  it("writes no atom row for a rating nobody addressed", async () => {
    // Most of the catalogue. The absence is the honest answer to "which fact was this
    // about": nobody has said yet.
    const fake = fakePrisma();
    await (consumerOn(fake.prisma) as any).handleMessage(
      channel,
      message(rated({ targets: null })),
    );

    expect(fake.attempts).toHaveLength(1);
    expect(fake.atoms).toHaveLength(0);
  });

  it("records an atom named twice in one item once", async () => {
    // The unique index would reject the second row and take the whole batch with it.
    const fake = fakePrisma();
    await (consumerOn(fake.prisma) as any).handleMessage(
      channel,
      message(
        rated({
          targets: [
            { atomType: "vocabulary_item", atomId: "word-3", role: "focus" },
            { atomType: "vocabulary_item", atomId: "word-3", role: "context" },
          ],
        }),
      ),
    );

    expect(fake.atoms).toHaveLength(1);
    expect(fake.atoms[0]).toMatchObject({ role: "focus" });
  });
});
