import { describe, expect, it, jest } from "@jest/globals";

// Importing the consumer pulls in `PrismaService` and the generated client, which jest cannot load.
jest.unstable_mockModule(
  "../../../../src/infrastructure/database/prisma.service.js",
  () => ({
    PrismaService: class {},
  }),
);

const { MembershipConsumer } =
  await import("../../../../src/modules/projections/consumers/membership.consumer.js");

const SCHOOL = "11111111-0000-4000-8000-000000000001";
const OTHER = "22222222-0000-4000-8000-000000000002";

interface Row {
  id: string;
  schoolId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

const row = (id: string, schoolId: string, userId: string, role: string): Row => ({
  id,
  schoolId,
  userId,
  role,
  joinedAt: new Date("2026-11-01T00:00:00Z"),
});

/** Two roster tables in memory; the other school-keyed tables only count their deletes. */
function makeConsumer(roster: Row[]) {
  const tables = { active: [...roster], closed: [] as Row[] };
  const table = (name: "active" | "closed") => ({
    findMany: jest.fn(async ({ where }: { where: { schoolId: string } }) =>
      tables[name].filter((r) => r.schoolId === where.schoolId),
    ),
    createMany: jest.fn(async ({ data }: { data: Row[] }) => {
      for (const r of data)
        if (!tables[name].some((t) => t.schoolId === r.schoolId && t.userId === r.userId))
          tables[name].push({ ...r });
      return { count: data.length };
    }),
    deleteMany: jest.fn(async ({ where }: { where: { schoolId: string } }) => {
      const before = tables[name].length;
      tables[name] = tables[name].filter((r) => r.schoolId !== where.schoolId);
      return { count: before - tables[name].length };
    }),
  });
  const counted = () => ({
    deleteMany: jest.fn(async (_args: unknown) => ({ count: 1 })),
  });
  const prisma: Record<string, unknown> = {
    processedEvent: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => undefined),
    },
    schoolMembership: table("active"),
    closedSchoolMembership: table("closed"),
    groupMembership: counted(),
    groupDirectory: counted(),
    schoolActivity: counted(),
    reviewTermAcceptance: counted(),
  };
  prisma.$transaction = jest.fn(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as unknown[]),
  );
  const consumer = new MembershipConsumer({ get: () => undefined } as never, prisma as never);
  const channel = { ack: jest.fn(), nack: jest.fn() };
  let n = 0;
  const send = (eventType: string, payload: unknown) =>
    consumer.handleMessage(channel, {
      content: Buffer.from(JSON.stringify({ eventId: `e${++n}`, eventType, payload })),
      fields: { redelivered: false },
    } as never);
  return { tables, prisma: prisma as Record<string, { deleteMany: jest.Mock }>, channel, send };
}

const roster = () => [
  row("m1", SCHOOL, "owner", "OWNER"),
  row("m2", SCHOOL, "teacher", "TEACHER"),
  row("m3", SCHOOL, "student", "STUDENT"),
  row("m4", OTHER, "teacher", "TEACHER"),
];

describe("MembershipConsumer — school lifecycle (plan 90, phase 5, Q13)", () => {
  it("closed: the school's roster is set aside, nobody has a role, another school is untouched", async () => {
    const { tables, channel, send } = makeConsumer(roster());

    await send("school.closed", { schoolId: SCHOOL, status: "closed" });

    expect(tables.active.map((r) => r.id)).toEqual(["m4"]);
    expect(tables.closed.map((r) => r.id).sort()).toEqual(["m1", "m2", "m3"]);
    expect(channel.ack).toHaveBeenCalled();
  });

  it("restored: the roster comes back with its ids and roles", async () => {
    const { tables, send } = makeConsumer(roster());
    await send("school.closed", { schoolId: SCHOOL });

    await send("school.restored", { schoolId: SCHOOL });

    expect(tables.closed).toEqual([]);
    expect(tables.active.map((r) => `${r.id}:${r.role}`).sort()).toEqual([
      "m1:OWNER",
      "m2:TEACHER",
      "m3:STUDENT",
      "m4:TEACHER",
    ]);
  });

  it("closing twice loses nothing", async () => {
    const { tables, send } = makeConsumer(roster());
    await send("school.closed", { schoolId: SCHOOL });
    await send("school.closed", { schoolId: SCHOOL });
    expect(tables.closed).toHaveLength(3);
  });

  it("purged: the school's projections go, both roster tables included; the learner's do not", async () => {
    const { tables, prisma, channel, send } = makeConsumer(roster());
    await send("school.closed", { schoolId: SCHOOL });

    await send("school.purged", { schoolId: SCHOOL });

    expect(tables.active.map((r) => r.id)).toEqual(["m4"]);
    expect(tables.closed).toEqual([]);
    for (const model of ["groupMembership", "groupDirectory", "schoolActivity", "reviewTermAcceptance"])
      expect(prisma[model].deleteMany).toHaveBeenCalledWith({ where: { schoolId: SCHOOL } });
    // Enrolments, evidence, mastery and weak-rule facts are the learner's history: the fake has
    // no such tables, so touching one would have failed the event instead of acking it.
    expect(channel.ack).toHaveBeenCalledTimes(2);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it.each(["school.closed", "school.restored", "school.purged"])(
    "%s without a school id is discarded, not requeued, and touches nothing",
    async (eventType) => {
      const { tables, channel, send } = makeConsumer(roster());
      await send(eventType, { status: "closed" });
      expect(tables.active).toHaveLength(4);
      expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    },
  );
});
