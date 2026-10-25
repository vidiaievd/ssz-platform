import { InvalidReviewSettingsException } from "../exceptions/invalid-review-settings.exception.js";

/**
 * Factory minutes per submission, by template — where a school starts before it sets its
 * own (plan 81, Q5).
 *
 * Starting guesses, not measurements: an essay is read and commented on, a recording is
 * listened to through, a sentence is checked against its key. A school overrides any of
 * them in its settings, and exercise-engine replaces both with the school's measured median
 * once enough verdicts back it.
 */
export const FACTORY_REVIEW_MINUTES: Readonly<Record<string, number>> = {
  writing_task: 12,
  read_aloud: 5,
  information_transfer: 4,
  translate_to_target: 4,
  translate_from_target: 4,
  error_correction: 3,
  short_answer: 2,
};

/** Factory minutes for a template that reaches a teacher but has no entry above. */
export const FACTORY_OTHER_REVIEW_MINUTES = 3;

/** Two hours: past it the figure describes a project, not a submission. */
const MAX_MINUTES = 120;

/** As many entries as a school could sensibly fill in; a ceiling on the column, not a catalogue. */
const MAX_TEMPLATES = 50;

const TEMPLATE_CODE = /^[a-z][a-z0-9_]{0,63}$/;

export type ReviewEffortMinutesSource = "school" | "default";

export interface ReviewEffortMinutesEntry {
  templateCode: string;
  minutes: number;
  source: ReviewEffortMinutesSource;
}

/**
 * How many minutes a school expects one submission of each template to take — the one
 * figure for all its teachers until its own measurements take over.
 *
 * Only what the school set is stored: a template it never touched follows the factory
 * value, so a better guess shipped later reaches every school that kept the default.
 * The template codes are not checked against a catalogue — this service has none — only
 * against the shape every code has.
 */
export class ReviewEffortMinutes {
  private constructor(
    readonly templates: Readonly<Record<string, number>>,
    readonly other: number | null,
  ) {}

  static empty(): ReviewEffortMinutes {
    return new ReviewEffortMinutes({}, null);
  }

  static create(props: {
    templates: Record<string, number>;
    other: number | null;
  }): ReviewEffortMinutes {
    const entries = Object.entries(props.templates);
    if (entries.length > MAX_TEMPLATES) {
      throw new InvalidReviewSettingsException(
        `At most ${MAX_TEMPLATES} templates may be set`,
      );
    }
    for (const [code, minutes] of entries) {
      if (!TEMPLATE_CODE.test(code)) {
        throw new InvalidReviewSettingsException(
          `"${code}" is not a template code`,
        );
      }
      assertMinutes(minutes, code);
    }
    if (props.other !== null) assertMinutes(props.other, "other");

    return new ReviewEffortMinutes({ ...props.templates }, props.other);
  }

  /**
   * Rebuilt from the column. Anything malformed in it is dropped rather than trusted or
   * thrown on: a stale entry costs one template its school value, not the school its read.
   */
  static rehydrate(raw: unknown): ReviewEffortMinutes {
    if (!raw || typeof raw !== "object") return ReviewEffortMinutes.empty();
    const { templates, other } = raw as {
      templates?: unknown;
      other?: unknown;
    };

    const kept: Record<string, number> = {};
    if (templates && typeof templates === "object") {
      for (const [code, minutes] of Object.entries(templates)) {
        if (TEMPLATE_CODE.test(code) && isMinutes(minutes))
          kept[code] = minutes;
      }
    }
    return new ReviewEffortMinutes(kept, isMinutes(other) ? other : null);
  }

  /** Every factory template plus every one the school set, each with where its figure came from. */
  get entries(): ReviewEffortMinutesEntry[] {
    const codes = new Set([
      ...Object.keys(FACTORY_REVIEW_MINUTES),
      ...Object.keys(this.templates),
    ]);
    return [...codes].sort().map((templateCode) => {
      const own = this.templates[templateCode];
      return own !== undefined
        ? { templateCode, minutes: own, source: "school" }
        : {
            templateCode,
            minutes: FACTORY_REVIEW_MINUTES[templateCode],
            source: "default",
          };
    });
  }

  /** The figure for a template on neither list. */
  get otherEntry(): { minutes: number; source: ReviewEffortMinutesSource } {
    return this.other !== null
      ? { minutes: this.other, source: "school" }
      : { minutes: FACTORY_OTHER_REVIEW_MINUTES, source: "default" };
  }

  toJSON(): { templates: Record<string, number>; other: number | null } {
    return { templates: { ...this.templates }, other: this.other };
  }
}

function isMinutes(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_MINUTES
  );
}

function assertMinutes(value: number, label: string): void {
  if (!isMinutes(value)) {
    throw new InvalidReviewSettingsException(
      `Minutes for ${label} must be a whole number between 1 and ${MAX_MINUTES}`,
    );
  }
}
