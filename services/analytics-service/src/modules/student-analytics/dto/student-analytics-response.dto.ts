import { ApiProperty } from '@nestjs/swagger';
import type { CellState } from '@ssz/shared-kernel/analytics';

export class StudentGridCellDto {
  @ApiProperty() skill!: string;
  @ApiProperty() focus!: string;

  @ApiProperty({ description: 'Computed by @ssz/shared-kernel/analytics, never by a screen' })
  state!: CellState;

  @ApiProperty({ type: Number, nullable: true, description: 'Weighted success rate, 0..100' })
  ewma!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Days a right answer survives — the number behind "forgets fast"',
  })
  meanStability!: number | null;

  @ApiProperty() attempts!: number;
  @ApiProperty({ description: 'Evidence behind the verdict, on the profile scale' })
  weightedSample!: number;
}

export class StudentGridResponseDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;

  @ApiProperty({ description: 'Below this much evidence the profile refuses to judge' })
  minWeightedSample!: number;

  @ApiProperty({
    description: 'Content could not be asked what the course trains; no cell claims noContent',
  })
  coverageUnavailable!: boolean;

  @ApiProperty({
    description:
      'True when this learner has no attempt at all — the screen prints its empty state ' +
      'instead of a grid, because an empty grid reads as "everything is bad"',
  })
  nothingMeasured!: boolean;

  @ApiProperty({
    description:
      'Attempts in a channel the grid does not draw — reported so the screen can say how ' +
      'many it could not place, rather than being quietly short by that many',
  })
  unclassifiedAttempts!: number;

  @ApiProperty({
    type: [StudentGridCellDto],
    description: 'Four channels by five subjects — the fifth subject is the unknown bucket',
  })
  cells!: StudentGridCellDto[];
}

export class StudentPositionResponseDto {
  @ApiProperty({ description: "This learner's share of the taught course, 0..100" })
  own!: number;

  @ApiProperty({ description: 'The group median of the same number, 0..100' })
  groupMedian!: number;

  @ApiProperty({ description: 'Share of measured classmates below this learner, 0..100' })
  percentile!: number;

  @ApiProperty({ description: 'How many classmates are below — a count, never a name' })
  lowerThan!: number;

  @ApiProperty({
    enum: ['below', 'middle', 'above'],
    description: 'The band a learner may be shown (§3.6); wide enough to survive one homework',
  })
  band!: 'below' | 'middle' | 'above';

  @ApiProperty({ description: 'Classmates with a number of their own, this learner included' })
  measured!: number;
}

export class StudentWorkContextBucketDto {
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['homework', 'self_study', 'classwork', null],
    description: 'null is its own bucket: nobody said where the work was done',
  })
  key!: 'homework' | 'self_study' | 'classwork' | null;

  @ApiProperty() attempts!: number;
  @ApiProperty({ description: "Share of this learner's attempts, 0..100" }) share!: number;

  @ApiProperty({ type: Number, nullable: true, description: 'Their own pass rate, 0..100' })
  median!: number | null;
}

export class StudentWorkContextResponseDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;
  @ApiProperty({ type: [StudentWorkContextBucketDto] }) buckets!: StudentWorkContextBucketDto[];

  @ApiProperty({
    description:
      'Attempts of this learner naming no course, and so in no bucket — nearly all of ' +
      'them older than the day the column was added. Shown so that a learner with ' +
      'eighty attempts and an empty bar is not read as a learner who has done nothing',
  })
  unattributed!: number;
}

// ─── The recognition ↔ production gap (plan 63 §4.1) ──────────────────────────

export class ModalityReadingDto {
  @ApiProperty({ example: 12 }) attempts!: number;
  @ApiProperty({ example: 11 }) correct!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Null for a modality never attempted — the opposite statement from a zero, and the ' +
      'whole reason this screen exists',
  })
  successRate!: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Mean FSRS stability in days after these reviews; null where none was recorded',
  })
  meanStability!: number | null;

  @ApiProperty({ type: Date, nullable: true })
  lastAt!: Date | null;
}

export class ModalityGapDto {
  @ApiProperty({ enum: ['vocabulary_item', 'grammar_rule_atom'] }) atomType!: string;
  @ApiProperty() atomId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Null when content-service could not be asked; the finding still stands',
  })
  title!: string | null;

  @ApiProperty({ type: String, nullable: true, enum: ['lexis', 'grammar', null] })
  track!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'The rule a grammar atom belongs to' })
  parentId!: string | null;

  @ApiProperty({
    enum: ['recognition_only', 'production_untried', 'production_failing', 'recall_failing'],
    description:
      'What is lopsided about this fact. `recognition_only` and `production_untried` are ' +
      'about what was never asked; the two `_failing` ones are about what was asked and ' +
      'went badly',
  })
  verdict!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'How far the deeper modality falls below the shallow one, 0..1. Null where nothing ' +
      'deeper was ever attempted — a gap of zero would claim they produce it as well as ' +
      'they recognise it',
  })
  gap!: number | null;

  @ApiProperty({
    description: 'One reading per modality, every key present, zeroes included',
  })
  byModality!: Record<string, ModalityReadingDto>;

  @ApiProperty({
    example: 4,
    description:
      'Ratings of this atom’s own SRS card. The same answers as the readings above seen ' +
      'from the card side — one submission rates the item and then the word’s card — so ' +
      'they are reported here and never added to a modality, which would count each ' +
      'answer twice and only for words',
  })
  cardReviews!: number;
}

export class ModalityGapSummaryDto {
  @ApiProperty({ description: 'Atoms this learner has any addressed evidence about' })
  addressedAtoms!: number;

  @ApiProperty({ description: 'Of those, the ones with evidence enough to judge' })
  judged!: number;

  @ApiProperty({ description: 'Too little evidence to say anything. Not a verdict of "fine"' })
  insufficient!: number;

  @ApiProperty() recognitionOnly!: number;
  @ApiProperty() productionUntried!: number;
  @ApiProperty() productionFailing!: number;
  @ApiProperty() recallFailing!: number;

  @ApiProperty({ description: 'Judged and not lopsided' })
  even!: number;

  @ApiProperty({
    description:
      'Atoms of a kind known only one way by nature — a phonological contrast is heard, never ' +
      'recalled or produced — so never judged. Counted in addressedAtoms and byModality',
  })
  notCompared!: number;

  @ApiProperty({ description: 'Observations behind all of it — items that tested an atom' })
  observations!: number;

  @ApiProperty({
    description:
      'Observations excluded from every verdict: the item required the atom but did not ' +
      'examine it. A learner with nothing but these has been measured on nothing',
  })
  contextObservations!: number;

  @ApiProperty({
    description:
      'Card-side ratings across all atoms, excluded from every tally above for the reason ' +
      'given on the finding',
  })
  cardReviews!: number;

  @ApiProperty({
    example: { recognition: 84, recall: 31, production: 0, unknown: 4 },
    description:
      'Observations by modality, zeroes included. A `production: 0` here is a fact about ' +
      'the course, not about the learner — see the author’s coverage report',
  })
  byModality!: Record<string, number>;
}

export class ModalityGapResponseDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;

  @ApiProperty({
    example: 3,
    description: 'Observations required before an atom is judged at all, reported with the verdicts',
  })
  minAttempts!: number;

  @ApiProperty({
    example: { strong: 0.8, failing: 0.6 },
    description: 'The bars a verdict was made against, so the verdict can be read against them',
  })
  thresholds!: { strong: number; failing: number };

  @ApiProperty({
    description: 'False when the atom names could not be asked for — labels missing, findings intact',
  })
  namesAvailable!: boolean;

  @ApiProperty({ type: ModalityGapSummaryDto })
  summary!: ModalityGapSummaryDto;

  @ApiProperty({ type: [ModalityGapDto], description: 'Widest measured gap first' })
  gaps!: ModalityGapDto[];
}

/** Why one atom is being proposed — plan 63 phase 8. */
export type PracticeReason = 'due' | 'weak' | 'modality-gap' | 'upcoming';

export class NextPracticeEvidenceDto {
  @ApiProperty({ type: String, nullable: true, description: 'When the schedule wants it back' })
  dueAt!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Days overdue. Negative is not returned — a card not yet due is not a `due` candidate',
  })
  overdueDays!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'FSRS stability, in days' })
  stability!: number | null;

  @ApiProperty({ type: Number, nullable: true }) reps!: number | null;
  @ApiProperty({ type: Number, nullable: true }) lapses!: number | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The modality verdict behind a `modality-gap` candidate',
  })
  verdict!: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'How far production sits below the shallowest modality the learner is reliable at',
  })
  gap!: number | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    example: { recognition: 6, recall: 2, production: 0, unknown: 0 },
    description: 'Observations by modality for a gap candidate; items by modality for an upcoming one',
  })
  byModality!: Record<string, number> | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The unit an `upcoming` atom is introduced in',
  })
  unitId!: string | null;

  @ApiProperty({ type: String, nullable: true }) unitTitle!: string | null;

  @ApiProperty({
    type: [String],
    nullable: true,
    description:
      'How the upcoming unit introduces it — a glossary mark, a text span, an author’s ' +
      'relation, or only a rule pool',
  })
  introducedBy!: string[] | null;
}

export class NextPracticeCandidateDto {
  @ApiProperty() atomType!: string;
  @ApiProperty() atomId!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Null when names could not be asked for' })
  title!: string | null;

  @ApiProperty({ type: String, nullable: true, description: '`lexis` | `grammar`' })
  track!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'The rule a grammar atom belongs to' })
  parentId!: string | null;

  @ApiProperty({
    enum: ['due', 'weak', 'modality-gap', 'upcoming'],
    description: 'Which of the four sources put this atom on the list',
  })
  reason!: PracticeReason;

  @ApiProperty({
    description:
      'How it should be asked this time — `production` where the learner recognises and ' +
      'has never produced, `recognition` for a fact they have not met yet',
  })
  requiredModality!: string;

  @ApiProperty({ type: NextPracticeEvidenceDto, description: 'What the proposal is made on' })
  evidence!: NextPracticeEvidenceDto;
}

export class NextPracticeSourcesDto {
  @ApiProperty({ description: 'Cards the schedule wants back now' })
  due!: number;

  @ApiProperty({ description: 'Cards that have been round several times and still will not stick' })
  weak!: number;

  @ApiProperty({ description: 'Atoms known one way only' })
  modalityGap!: number;

  @ApiProperty({ description: 'Atoms the next unit introduces and the learner has not met' })
  upcoming!: number;

  @ApiProperty({
    type: [String],
    description:
      'Sources that could not be asked. A list assembled without one of them is thinner ' +
      'and still true; an empty list from an unreachable service would be a lie',
  })
  unavailable!: string[];
}

export class NextPracticeResponseDto {
  @ApiProperty() studentId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;

  @ApiProperty({ description: 'The budget asked for, in minutes' })
  budgetMinutes!: number;

  @ApiProperty({
    description: 'What one probe is assumed to cost. Reported so the caller can disagree with it',
  })
  secondsPerItem!: number;

  @ApiProperty({ description: 'How many candidates the budget pays for' })
  capacity!: number;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'The unit the learner is heading into, or null when the course is finished or unknown',
  })
  nextUnit!: { unitId: string; unitTitle: string | null } | null;

  @ApiProperty({ type: NextPracticeSourcesDto })
  sources!: NextPracticeSourcesDto;

  @ApiProperty({
    type: [NextPracticeCandidateDto],
    description: 'Interleaved across the reasons, most urgent first within each',
  })
  candidates!: NextPracticeCandidateDto[];
}
