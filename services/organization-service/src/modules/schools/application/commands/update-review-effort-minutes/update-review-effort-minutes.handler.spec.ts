import { jest } from "@jest/globals";
import { UpdateReviewEffortMinutesHandler } from "./update-review-effort-minutes.handler.js";
import { UpdateReviewEffortMinutesCommand } from "./update-review-effort-minutes.command.js";
import { GetReviewEffortMinutesHandler } from "../../queries/get-review-effort-minutes/get-review-effort-minutes.handler.js";
import { GetReviewEffortMinutesQuery } from "../../queries/get-review-effort-minutes/get-review-effort-minutes.query.js";
import { School } from "../../../domain/entities/school.entity.js";
import { SchoolMember } from "../../../domain/entities/school-member.entity.js";
import { MemberRole } from "../../../domain/value-objects/member-role.vo.js";
import { SchoolType } from "../../../domain/value-objects/school-type.vo.js";
import {
  FACTORY_OTHER_REVIEW_MINUTES,
  FACTORY_REVIEW_MINUTES,
  ReviewEffortMinutes,
} from "../../../domain/value-objects/review-effort-minutes.vo.js";
import { ForbiddenOperationException } from "../../../domain/exceptions/forbidden-operation.exception.js";
import { InvalidReviewSettingsException } from "../../../domain/exceptions/invalid-review-settings.exception.js";
import { SchoolNotFoundException } from "../../../domain/exceptions/school-not-found.exception.js";

const SCHOOL_ID = "school-1";
const OWNER = "owner-1";
const ADMIN = "admin-1";
const TEACHER = "teacher-1";

function school(): School {
  return School.rehydrate({
    id: SCHOOL_ID,
    name: "Nordick",
    slug: "nordick",
    ownerId: OWNER,
    type: SchoolType.ONLINE,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    requireTutorReviewForSelfPaced: false,
    members: [
      SchoolMember.rehydrate({
        id: "m-1",
        schoolId: SCHOOL_ID,
        userId: ADMIN,
        role: MemberRole.ADMIN,
        joinedAt: new Date("2026-01-01T00:00:00Z"),
      }),
      SchoolMember.rehydrate({
        id: "m-2",
        schoolId: SCHOOL_ID,
        userId: TEACHER,
        role: MemberRole.TEACHER,
        joinedAt: new Date("2026-01-01T00:00:00Z"),
      }),
    ],
  });
}

function makeHandler(row: School | null) {
  const schools = {
    findById: jest.fn(() => Promise.resolve(row)),
    saveReviewEffortMinutes: jest.fn((..._args: unknown[]) =>
      Promise.resolve(),
    ),
  };
  return {
    handler: new UpdateReviewEffortMinutesHandler(schools as never),
    schools,
  };
}

const command = (
  actorId: string,
  templates: Record<string, number> = { writing_task: 20 },
  other: number | null = null,
) => new UpdateReviewEffortMinutesCommand(SCHOOL_ID, actorId, templates, other);

describe("UpdateReviewEffortMinutesHandler", () => {
  it("saves what the owner set and answers with the whole table", async () => {
    const { handler, schools } = makeHandler(school());

    const result = await handler.execute(
      command(OWNER, { writing_task: 20 }, 4),
    );

    expect(result.templates).toContainEqual({
      templateCode: "writing_task",
      minutes: 20,
      source: "school",
    });
    expect(result.templates).toContainEqual({
      templateCode: "read_aloud",
      minutes: FACTORY_REVIEW_MINUTES.read_aloud,
      source: "default",
    });
    expect(result.other).toEqual({ minutes: 4, source: "school" });
    const saved = schools.saveReviewEffortMinutes.mock
      .calls[0][1] as ReviewEffortMinutes;
    expect(saved.toJSON()).toEqual({
      templates: { writing_task: 20 },
      other: 4,
    });
  });

  it("lets an administrator set it, and refuses a teacher", async () => {
    await expect(
      makeHandler(school()).handler.execute(command(ADMIN)),
    ).resolves.toBeDefined();

    const { handler, schools } = makeHandler(school());
    await expect(handler.execute(command(TEACHER))).rejects.toBeInstanceOf(
      ForbiddenOperationException,
    );
    expect(schools.saveReviewEffortMinutes).not.toHaveBeenCalled();
  });

  it("refuses a figure out of range, a fraction, and a code out of shape", async () => {
    const { handler, schools } = makeHandler(school());

    const bad: Record<string, number>[] = [
      { writing_task: 0 },
      { writing_task: 121 },
      { writing_task: 2.5 },
      { "Writing Task": 5 },
    ];
    for (const templates of bad) {
      await expect(
        handler.execute(command(OWNER, templates)),
      ).rejects.toBeInstanceOf(InvalidReviewSettingsException);
    }
    await expect(handler.execute(command(OWNER, {}, 0))).rejects.toBeInstanceOf(
      InvalidReviewSettingsException,
    );
    expect(schools.saveReviewEffortMinutes).not.toHaveBeenCalled();
  });

  it("reports a missing school as missing", async () => {
    await expect(
      makeHandler(null).handler.execute(command(OWNER)),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});

describe("GetReviewEffortMinutesHandler", () => {
  it("fills a school that set nothing with the factory values", async () => {
    const handler = new GetReviewEffortMinutesHandler({
      findReviewEffortMinutes: jest.fn(() =>
        Promise.resolve(ReviewEffortMinutes.empty()),
      ),
    } as never);

    const result = await handler.execute(
      new GetReviewEffortMinutesQuery(SCHOOL_ID),
    );

    expect(result.templates.map((entry) => entry.templateCode)).toEqual(
      Object.keys(FACTORY_REVIEW_MINUTES).sort(),
    );
    expect(result.templates.every((entry) => entry.source === "default")).toBe(
      true,
    );
    expect(result.other).toEqual({
      minutes: FACTORY_OTHER_REVIEW_MINUTES,
      source: "default",
    });
  });

  it("lists a template the school added beside the factory ones", async () => {
    const handler = new GetReviewEffortMinutesHandler({
      findReviewEffortMinutes: jest.fn(() =>
        Promise.resolve(
          ReviewEffortMinutes.rehydrate({
            templates: { dictation: 6 },
            other: null,
          }),
        ),
      ),
    } as never);

    const result = await handler.execute(
      new GetReviewEffortMinutesQuery(SCHOOL_ID),
    );

    expect(result.templates).toContainEqual({
      templateCode: "dictation",
      minutes: 6,
      source: "school",
    });
  });

  it("reports a missing school as missing", async () => {
    const handler = new GetReviewEffortMinutesHandler({
      findReviewEffortMinutes: jest.fn(() => Promise.resolve(null)),
    } as never);

    await expect(
      handler.execute(new GetReviewEffortMinutesQuery(SCHOOL_ID)),
    ).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});

describe("ReviewEffortMinutes.rehydrate", () => {
  it("reads the empty column default as nothing set", () => {
    expect(ReviewEffortMinutes.rehydrate({}).toJSON()).toEqual({
      templates: {},
      other: null,
    });
  });

  it("drops a malformed entry instead of throwing", () => {
    const minutes = ReviewEffortMinutes.rehydrate({
      templates: {
        writing_task: 15,
        read_aloud: "five",
        "Bad Code": 3,
        short_answer: 500,
      },
      other: -1,
    });

    expect(minutes.toJSON()).toEqual({
      templates: { writing_task: 15 },
      other: null,
    });
  });
});
