import { describe, expect, it, jest } from "@jest/globals";

// Importing the consumer pulls in `PrismaService` and the generated client, which jest cannot load.
jest.unstable_mockModule(
  "../../../../src/infrastructure/database/prisma.service.js",
  () => ({
    PrismaService: class {},
  }),
);

const { ContainerDirectoryConsumer, unwrapContentPayload } =
  await import("../../../../src/modules/projections/consumers/container-directory.consumer.js");

const CONTAINER_ID = "52123016-b46d-4f18-bf62-d0c32f2daab7";

function makeConsumer() {
  const prisma = {
    processedEvent: {
      findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      create: jest
        .fn<(a: unknown) => Promise<void>>()
        .mockResolvedValue(undefined),
    },
    containerDirectory: {
      upsert: jest
        .fn<(a: unknown) => Promise<void>>()
        .mockResolvedValue(undefined),
      updateMany: jest
        .fn<(a: unknown) => Promise<{ count: number }>>()
        .mockResolvedValue({ count: 1 }),
    },
  };
  const outline = {
    refresh: jest
      .fn<(id: string) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
  const consumer = new ContainerDirectoryConsumer(
    { get: () => undefined } as never,
    prisma as never,
    outline as never,
  );
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const send = (envelope: unknown) =>
    (
      consumer as unknown as {
        handleMessage(c: unknown, m: unknown): Promise<void>;
      }
    ).handleMessage(channel, {
      content: Buffer.from(JSON.stringify(envelope)),
      fields: { redelivered: false },
    });
  return { prisma, outline, channel, send };
}

/** What content-service's container repository really puts on the wire. */
function wrapped(eventType: string, payload: Record<string, unknown>) {
  return {
    eventId: "evt-1",
    eventType,
    payload: {
      eventId: "inner",
      eventType,
      aggregateId: CONTAINER_ID,
      payload,
    },
  };
}

describe("unwrapContentPayload", () => {
  it("reads the domain event inside the payload", () => {
    expect(
      unwrapContentPayload({
        eventType: "x",
        payload: { containerId: CONTAINER_ID },
      }),
    ).toEqual({
      containerId: CONTAINER_ID,
    });
  });

  it("leaves a flat payload as it is", () => {
    expect(unwrapContentPayload({ containerId: CONTAINER_ID })).toEqual({
      containerId: CONTAINER_ID,
    });
  });
});

describe("ContainerDirectoryConsumer", () => {
  it("marks only the deleted container deleted", async () => {
    const { prisma, channel, send } = makeConsumer();
    await send(
      wrapped("content.container.deleted", {
        containerId: CONTAINER_ID,
        ownerUserId: "u",
      }),
    );
    expect(prisma.containerDirectory.updateMany).toHaveBeenCalledWith({
      where: { containerId: CONTAINER_ID },
      data: { deletedAt: expect.any(Date) },
    });
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it("renames only the updated container", async () => {
    const { prisma, send } = makeConsumer();
    await send(
      wrapped("content.container.updated", {
        containerId: CONTAINER_ID,
        title: "Ny tittel",
      }),
    );
    expect(prisma.containerDirectory.updateMany).toHaveBeenCalledWith({
      where: { containerId: CONTAINER_ID },
      data: { title: "Ny tittel" },
    });
  });

  it("still reads a flat payload (content.container.published)", async () => {
    const { outline, send } = makeConsumer();
    await send({
      eventId: "evt-2",
      eventType: "content.container.published",
      payload: { containerId: CONTAINER_ID },
    });
    expect(outline.refresh).toHaveBeenCalledWith(CONTAINER_ID);
  });

  it("discards an event without a containerId and writes nothing", async () => {
    const { prisma, channel, send } = makeConsumer();
    await send(wrapped("content.container.deleted", { ownerUserId: "u" }));
    expect(prisma.containerDirectory.updateMany).not.toHaveBeenCalled();
    expect(prisma.processedEvent.create).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
  });
});
