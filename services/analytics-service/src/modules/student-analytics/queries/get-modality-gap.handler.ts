import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { MODALITIES } from '@ssz/shared-kernel/skills';
import type { Modality } from '@ssz/shared-kernel/skills';
import { StudentAccessService } from '../student-access.service.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { ContentClient } from '../../../infrastructure/http/content.client.js';
import { GetModalityGapQuery } from './student-analytics.queries.js';
import type {
  ModalityGapResponseDto,
  ModalityReadingDto,
} from '../dto/student-analytics-response.dto.js';

/**
 * How many observations it takes before a modality is allowed to say anything.
 *
 * Three, and low on purpose: this screen is not scoring the learner, it is pointing a
 * teacher at something to look at, and a wrong pointer costs a glance. The number is
 * reported with the answer so the verdict can be read against the evidence it was made on.
 */
const MIN_ATTEMPTS = 3;

/** Above this a modality counts as known — the same bar the mastery cells use. */
const STRONG = 0.8;

/** Below this it counts as failing. Between the two is neither, and says nothing. */
const FAILING = 0.6;

export type GapVerdict =
  /** Known by recognition and never once asked for from memory. */
  | 'recognition_only'
  /** Recalled reliably, never produced. The next thing to set. */
  | 'production_untried'
  /** Produced and failing while recognised reliably. The sharpest finding here. */
  | 'production_failing'
  /** Recalled and failing while recognised reliably. */
  | 'recall_failing';

interface Bucket {
  attempts: number;
  correct: number;
  stabilitySum: number;
  stabilityCount: number;
  lastAt: Date | null;
}

interface AtomRollup {
  atomType: string;
  atomId: string;
  buckets: Record<Modality, Bucket>;
}

/**
 * What this learner knows only one way — plan 63 §4.1.
 *
 * The first screen that answers "what should we work on" rather than "how many percent".
 * A learner at 90 % picking a word off a list and 30 % typing the same word is not uneven
 * about vocabulary: their knowledge has reached recognition and gone no further, and the
 * cure is production rather than more of the same exercises. Every other number the
 * platform holds says those two learners are equal.
 *
 * Read from `atom_evidence`, whose rows exist only where an author has addressed an item,
 * so a thin answer usually means the catalogue is unaddressed rather than the learner
 * untested — which is why `addressedAtoms` and `observations` are reported beside the
 * findings and why the coverage report (§4.2) is the other half of this phase.
 *
 * Context observations are excluded from every verdict: an item that merely required a
 * word proves nothing about how the learner knows it (the same rule the coverage report
 * applies). They are counted and reported, never folded in.
 */
@QueryHandler(GetModalityGapQuery)
@Injectable()
export class GetModalityGapHandler
  implements IQueryHandler<GetModalityGapQuery, ModalityGapResponseDto>
{
  constructor(
    private readonly access: StudentAccessService,
    private readonly prisma: PrismaService,
    private readonly content: ContentClient,
  ) {}

  async execute(query: GetModalityGapQuery): Promise<ModalityGapResponseDto> {
    const { studentId, viewerUserId, courseId, limit } = query;
    await this.access.assertMayRead(studentId, viewerUserId);

    const rows = await this.prisma.atomEvidence.findMany({
      where: {
        userId: studentId,
        ...(courseId === null ? {} : { containerId: courseId }),
      },
      select: {
        atomType: true,
        atomId: true,
        role: true,
        modality: true,
        passed: true,
        score: true,
        stabilityAfter: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'asc' },
    });

    const rollups = new Map<string, AtomRollup>();
    let contextObservations = 0;
    let examined = 0;

    for (const row of rows) {
      // Not examined on it, so it says nothing about how they know it. Counted, because
      // "nothing here was ever tested, only required" is itself worth seeing.
      if (row.role === 'context') {
        contextObservations += 1;
        continue;
      }
      examined += 1;

      const key = `${row.atomType}:${row.atomId}`;
      const rollup = rollups.get(key) ?? {
        atomType: row.atomType,
        atomId: row.atomId,
        buckets: emptyBuckets(),
      };
      // A row from before the modality existed, or from a template nobody has judged,
      // lands in `unknown` and is never counted towards a verdict.
      const modality: Modality = isModality(row.modality) ? row.modality : 'unknown';
      const bucket = rollup.buckets[modality];
      bucket.attempts += 1;
      if (row.passed ?? row.score >= 60) bucket.correct += 1;
      if (row.stabilityAfter !== null) {
        bucket.stabilitySum += row.stabilityAfter;
        bucket.stabilityCount += 1;
      }
      if (bucket.lastAt === null || row.occurredAt > bucket.lastAt) bucket.lastAt = row.occurredAt;
      rollups.set(key, rollup);
    }

    const findings: Array<{
      rollup: AtomRollup;
      verdict: GapVerdict;
      gap: number | null;
    }> = [];
    const summary = {
      addressedAtoms: rollups.size,
      judged: 0,
      insufficient: 0,
      recognitionOnly: 0,
      productionUntried: 0,
      productionFailing: 0,
      recallFailing: 0,
      even: 0,
      observations: examined,
      contextObservations,
      byModality: Object.fromEntries(MODALITIES.map((modality) => [modality, 0])) as Record<
        Modality,
        number
      >,
    };

    for (const rollup of rollups.values()) {
      for (const modality of MODALITIES) {
        summary.byModality[modality] += rollup.buckets[modality].attempts;
      }

      const decided = verdictOf(rollup);
      if (decided === null) {
        summary.insufficient += 1;
        continue;
      }
      summary.judged += 1;
      if (decided.verdict === null) {
        summary.even += 1;
        continue;
      }

      if (decided.verdict === 'recognition_only') summary.recognitionOnly += 1;
      else if (decided.verdict === 'production_untried') summary.productionUntried += 1;
      else if (decided.verdict === 'production_failing') summary.productionFailing += 1;
      else summary.recallFailing += 1;

      findings.push({ rollup, verdict: decided.verdict, gap: decided.gap });
    }

    findings.sort(worstFirst);
    const shown = findings.slice(0, limit);

    const named = await this.content.describeAtoms(
      shown.map((finding) => ({
        atomType: finding.rollup.atomType,
        atomId: finding.rollup.atomId,
      })),
    );

    return {
      studentId,
      courseId,
      minAttempts: MIN_ATTEMPTS,
      thresholds: { strong: STRONG, failing: FAILING },
      // False where the names could not be asked for. The findings still stand; only their
      // labels are missing, and a screen that knows this can say so instead of drawing ids.
      namesAvailable: shown.length === 0 || named.size > 0,
      summary,
      gaps: shown.map((finding) => {
        const descriptor = named.get(`${finding.rollup.atomType}:${finding.rollup.atomId}`);
        return {
          atomType: finding.rollup.atomType,
          atomId: finding.rollup.atomId,
          title: descriptor?.title ?? null,
          track: descriptor?.track ?? null,
          parentId: descriptor?.parentId ?? null,
          verdict: finding.verdict,
          gap: finding.gap,
          byModality: readings(finding.rollup),
        };
      }),
    };
  }
}

function emptyBuckets(): Record<Modality, Bucket> {
  return Object.fromEntries(
    MODALITIES.map((modality) => [
      modality,
      { attempts: 0, correct: 0, stabilitySum: 0, stabilityCount: 0, lastAt: null },
    ]),
  ) as Record<Modality, Bucket>;
}

function isModality(value: string | null): value is Modality {
  return value !== null && (MODALITIES as readonly string[]).includes(value);
}

function rate(bucket: Bucket): number | null {
  return bucket.attempts === 0 ? null : bucket.correct / bucket.attempts;
}

/**
 * The verdict, or `null` for an atom with too little evidence to judge.
 *
 * `{ verdict: null }` is the third answer and a different one: enough was measured, and
 * nothing about it is lopsided.
 */
function verdictOf(rollup: AtomRollup): { verdict: GapVerdict | null; gap: number | null } | null {
  const recognition = rollup.buckets.recognition;
  const recall = rollup.buckets.recall;
  const production = rollup.buckets.production;

  const known = recognition.attempts + recall.attempts + production.attempts;
  if (known < MIN_ATTEMPTS) return null;

  const recognitionRate = rate(recognition);
  const recallRate = rate(recall);
  const productionRate = rate(production);

  // The shallowest modality the learner is reliable at. What the gap is measured from:
  // "knows it one way" only means something once one way is actually known.
  const shallowStrong =
    recognitionRate !== null && recognitionRate >= STRONG
      ? recognitionRate
      : recallRate !== null && recallRate >= STRONG
        ? recallRate
        : null;

  if (productionRate !== null && productionRate < FAILING && shallowStrong !== null) {
    return { verdict: 'production_failing', gap: shallowStrong - productionRate };
  }
  if (
    recallRate !== null &&
    recallRate < FAILING &&
    recognitionRate !== null &&
    recognitionRate >= STRONG
  ) {
    return { verdict: 'recall_failing', gap: recognitionRate - recallRate };
  }

  // Never asked for, as opposed to asked for and failed. No gap can be measured — and
  // reporting one as zero would say the learner produces it as well as they recognise it.
  if (production.attempts === 0 && recall.attempts === 0 && recognition.attempts >= MIN_ATTEMPTS) {
    return { verdict: 'recognition_only', gap: null };
  }
  if (production.attempts === 0 && recallRate !== null && recallRate >= STRONG) {
    return { verdict: 'production_untried', gap: null };
  }

  return { verdict: null, gap: null };
}

/** Measured gaps first and widest first; then what was never asked, most evidence first. */
function worstFirst(
  a: { verdict: GapVerdict; gap: number | null; rollup: AtomRollup },
  b: { verdict: GapVerdict; gap: number | null; rollup: AtomRollup },
): number {
  const rank = (verdict: GapVerdict): number =>
    verdict === 'production_failing'
      ? 0
      : verdict === 'recall_failing'
        ? 1
        : verdict === 'recognition_only'
          ? 2
          : 3;

  const difference = rank(a.verdict) - rank(b.verdict);
  if (difference !== 0) return difference;
  if (a.gap !== null && b.gap !== null) return b.gap - a.gap;
  return observations(b.rollup) - observations(a.rollup);
}

function observations(rollup: AtomRollup): number {
  return MODALITIES.reduce((total, modality) => total + rollup.buckets[modality].attempts, 0);
}

function readings(rollup: AtomRollup): Record<Modality, ModalityReadingDto> {
  return Object.fromEntries(
    MODALITIES.map((modality) => {
      const bucket = rollup.buckets[modality];
      return [
        modality,
        {
          attempts: bucket.attempts,
          correct: bucket.correct,
          // Null rather than zero for a modality never attempted: those are opposite
          // statements, and this screen exists because of the difference.
          successRate: rate(bucket),
          meanStability:
            bucket.stabilityCount === 0 ? null : bucket.stabilitySum / bucket.stabilityCount,
          lastAt: bucket.lastAt,
        },
      ];
    }),
  ) as Record<Modality, ModalityReadingDto>;
}
