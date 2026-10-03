import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs';
import type { Modality } from '@ssz/shared-kernel/skills';
import { StudentAccessService } from '../student-access.service.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { ContentClient } from '../../../infrastructure/http/content.client.js';
import type { UnitAtom } from '../../../infrastructure/http/content.client.js';
import { LearningClient } from '../../../infrastructure/http/learning.client.js';
import type { AtomCard } from '../../../infrastructure/http/learning.client.js';
import { GetModalityGapQuery, GetNextPracticeQuery } from './student-analytics.queries.js';
import type {
  ModalityGapResponseDto,
  NextPracticeCandidateDto,
  NextPracticeResponseDto,
  PracticeReason,
} from '../dto/student-analytics-response.dto.js';

/**
 * What one probe is assumed to cost.
 *
 * A guess, and reported in the answer so that a caller with a better one can ignore it.
 * Measuring it properly means per-item latency, which nothing records yet (plan 63 phase 2
 * left `latencyMsPerItem` in the contract and unfilled, because a made-up number is worse
 * than an absent one). Forty-five seconds is what a gap plus reading its sentence takes.
 */
const SECONDS_PER_ITEM = 45;

const MIN_BUDGET_MINUTES = 1;
const MAX_BUDGET_MINUTES = 180;

/** Below this, after several goes, a card is not sticking rather than merely young. */
const WEAK_STABILITY_DAYS = 7;

/** How many times it has to have come round before "it will not stick" means anything. */
const WEAK_MIN_REPS = 3;

/** How many gap findings to read before cutting. Well past any sane budget. */
const GAP_LOOKAHEAD = 100;

interface Candidate {
  atomType: string;
  atomId: string;
  title: string | null;
  track: string | null;
  parentId: string | null;
  reason: PracticeReason;
  requiredModality: Modality;
  /** Sorted within its own reason; the meaning of the number differs per reason. */
  urgency: number;
  evidence: NextPracticeCandidateDto['evidence'];
}

/**
 * What to practise next, and why — plan 63 phase 8.
 *
 * The entry point an assistant (or a teacher planning a lesson) needs and nothing here
 * could answer before: every other screen reports what has happened. This one proposes,
 * and it proposes *atoms with a modality* rather than exercises, because the exercise is
 * the disposable part — the whole point of moving memory onto the atom (§2 A).
 *
 * Four sources, deliberately kept apart and interleaved rather than merged into one
 * score: they answer different questions, and a single ranking would be dominated by
 * `due` forever — the schedule always has something to say, while "known one way only"
 * and "the next lesson needs this" are precisely the findings a person would never reach
 * on their own.
 *
 * Every candidate carries the evidence it was proposed on. An assistant that cannot say
 * why it suggests something is a slot machine, and a teacher is right to ignore it.
 */
@QueryHandler(GetNextPracticeQuery)
@Injectable()
export class GetNextPracticeHandler
  implements IQueryHandler<GetNextPracticeQuery, NextPracticeResponseDto>
{
  constructor(
    private readonly access: StudentAccessService,
    private readonly prisma: PrismaService,
    private readonly content: ContentClient,
    private readonly learning: LearningClient,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetNextPracticeQuery): Promise<NextPracticeResponseDto> {
    const { studentId, viewerUserId, courseId } = query;
    await this.access.assertMayRead(studentId, viewerUserId);

    const budgetMinutes = Math.min(
      Math.max(query.budgetMinutes, MIN_BUDGET_MINUTES),
      MAX_BUDGET_MINUTES,
    );
    const capacity = Math.max(1, Math.floor((budgetMinutes * 60) / SECONDS_PER_ITEM));

    const nextUnit = courseId === null ? null : await this.findNextUnit(studentId, courseId);

    const [cards, gap, courseAtoms, unitAtoms] = await Promise.all([
      this.learning.getAtomCards(studentId),
      this.queryBus.execute<GetModalityGapQuery, ModalityGapResponseDto>(
        new GetModalityGapQuery(studentId, viewerUserId, courseId, GAP_LOOKAHEAD),
      ),
      // Only to scope the schedule to one course. A card knows nothing about courses, so
      // without this list "due in this course" cannot be asked at all.
      courseId === null ? Promise.resolve(null) : this.content.getUnitAtoms(courseId),
      nextUnit === null ? Promise.resolve(null) : this.content.getUnitAtoms(nextUnit.unitId),
    ]);

    const unavailable: string[] = [];
    if (cards === null) unavailable.push('schedule');
    if (courseId !== null && courseAtoms === null) unavailable.push('course-atoms');
    if (nextUnit !== null && unitAtoms === null) unavailable.push('next-unit');

    const inCourse = courseAtoms === null ? null : new Set(courseAtoms.map(keyOf));
    const now = new Date();

    const byAtom = new Map<string, Candidate>();
    /** First reason to claim an atom keeps it — the order below is the priority. */
    const claim = (candidate: Candidate): void => {
      const key = keyOf(candidate);
      if (!byAtom.has(key)) byAtom.set(key, candidate);
    };

    // The findings the gap screen already computed, read here rather than recomputed: two
    // derivations of "knows it one way" would eventually disagree on the same learner.
    for (const finding of gap.gaps) {
      if (inCourse !== null && !inCourse.has(keyOf(finding))) continue;
      claim({
        atomType: finding.atomType,
        atomId: finding.atomId,
        title: finding.title,
        track: finding.track,
        parentId: finding.parentId,
        reason: 'modality-gap',
        requiredModality: modalityForVerdict(finding.verdict),
        // A measured gap outranks one that was never asked for; the latter has no number.
        urgency: finding.gap ?? 0,
        evidence: {
          ...emptyEvidence(),
          verdict: finding.verdict,
          gap: finding.gap,
          byModality: countsOf(finding.byModality),
        },
      });
    }

    for (const card of cards ?? []) {
      if (inCourse !== null && !inCourse.has(keyOf(card))) continue;

      const overdueDays = (now.getTime() - new Date(card.dueAt).getTime()) / 86_400_000;
      const stuck = card.reps >= WEAK_MIN_REPS && card.stability < WEAK_STABILITY_DAYS;

      // "It keeps coming back and it will not stick" is a sharper thing to say than "it
      // came due", so a card that is both is proposed as the former.
      if (stuck) {
        claim({
          ...fromCard(card),
          reason: 'weak',
          // Lapses first, then the shortest memory: the two ways a card says "not landed".
          urgency: card.lapses + (WEAK_STABILITY_DAYS - card.stability) / WEAK_STABILITY_DAYS,
          evidence: {
            ...emptyEvidence(),
            dueAt: card.dueAt,
            overdueDays: overdueDays > 0 ? round(overdueDays) : null,
            stability: card.stability,
            reps: card.reps,
            lapses: card.lapses,
          },
        });
        continue;
      }

      if (overdueDays < 0) continue;

      claim({
        ...fromCard(card),
        reason: 'due',
        urgency: overdueDays,
        evidence: {
          ...emptyEvidence(),
          dueAt: card.dueAt,
          overdueDays: round(overdueDays),
          stability: card.stability,
          reps: card.reps,
          lapses: card.lapses,
        },
      });
    }

    // The only look forward on the list. An atom the unit introduces and the learner has
    // no card for is something they are about to meet — proposing it is the difference
    // between a revision list and a lesson plan.
    const known = new Set((cards ?? []).map(keyOf));
    for (const atom of unitAtoms ?? []) {
      if (atom.introducedBy.length === 0) continue; // revision of something taught earlier
      if (known.has(keyOf(atom))) continue;
      claim({
        atomType: atom.atomType,
        atomId: atom.atomId,
        title: atom.title,
        track: atom.track,
        parentId: atom.parentId,
        reason: 'upcoming',
        // First meeting: recognition is what a first meeting can honestly ask for.
        requiredModality: 'recognition',
        // The unit leans on it most where it is tested most.
        urgency: atom.focusItems,
        evidence: {
          ...emptyEvidence(),
          unitId: nextUnit?.unitId ?? null,
          unitTitle: nextUnit?.unitTitle ?? null,
          introducedBy: atom.introducedBy,
          byModality: atom.byModality,
        },
      });
    }

    const pools = groupByReason([...byAtom.values()]);
    const shown = interleave(pools, capacity);
    const named = await this.nameMissing(shown);

    return {
      studentId,
      courseId,
      budgetMinutes,
      secondsPerItem: SECONDS_PER_ITEM,
      capacity,
      nextUnit,
      sources: {
        due: pools.due.length,
        weak: pools.weak.length,
        modalityGap: pools['modality-gap'].length,
        upcoming: pools.upcoming.length,
        unavailable,
      },
      candidates: shown.map((candidate) => {
        const descriptor = named.get(keyOf(candidate));
        return {
          atomType: candidate.atomType,
          atomId: candidate.atomId,
          title: candidate.title ?? descriptor?.title ?? null,
          track: candidate.track ?? descriptor?.track ?? null,
          parentId: candidate.parentId ?? descriptor?.parentId ?? null,
          reason: candidate.reason,
          requiredModality: candidate.requiredModality,
          evidence: candidate.evidence,
        };
      }),
    };
  }

  /**
   * The unit the learner is heading into — the first one of the course they have not
   * finished.
   *
   * Read from the outline projection and the item progress beside it rather than from the
   * enrolment: "where are they" is a question about items done, and a course can be
   * entered anywhere.
   */
  private async findNextUnit(
    studentId: string,
    courseId: string,
  ): Promise<{ unitId: string; unitTitle: string | null } | null> {
    const outline = await this.prisma.courseOutlineItem.findMany({
      where: { containerId: courseId },
      orderBy: [{ unitOrder: 'asc' }, { position: 'asc' }],
      select: { unitId: true, unitTitle: true, itemId: true },
    });
    if (outline.length === 0) return null;

    const done = await this.prisma.itemProgress.findMany({
      where: {
        userId: studentId,
        status: 'COMPLETED',
        contentId: { in: outline.map((row) => row.itemId) },
      },
      select: { contentId: true },
    });
    const finished = new Set(done.map((row) => row.contentId));

    for (const row of outline) {
      if (!finished.has(row.itemId)) return { unitId: row.unitId, unitTitle: row.unitTitle };
    }
    // Every item done. There is no next unit, and saying "the last one" would propose
    // material the learner has already finished as though it were ahead of them.
    return null;
  }

  /** Names for the candidates whose source did not carry one — the cards. */
  private async nameMissing(candidates: Candidate[]) {
    const refs = candidates
      .filter((candidate) => candidate.title === null)
      .map((candidate) => ({ atomType: candidate.atomType, atomId: candidate.atomId }));
    return this.content.describeAtoms(refs);
  }
}

function keyOf(atom: { atomType: string; atomId: string }): string {
  return `${atom.atomType}:${atom.atomId}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function fromCard(card: AtomCard) {
  return {
    atomType: card.atomType,
    atomId: card.atomId,
    // A card holds an address and nothing else; the name is asked for later, once the
    // list has been cut to what the budget pays for.
    title: null,
    track: card.track,
    parentId: null,
    // What a card cannot say. It is one number per atom, not per modality, so the honest
    // ask is the middle one: from memory, without demanding free production of a fact
    // the learner may only ever have recognised.
    requiredModality: 'recall' as Modality,
  };
}

/** What the verdict says is missing — the whole point of proposing the atom at all. */
function modalityForVerdict(verdict: string): Modality {
  switch (verdict) {
    case 'recognition_only':
    case 'recall_failing':
      return 'recall';
    default:
      // production_untried, production_failing — and anything added later, where the
      // conservative reading is that the deepest modality is the one in doubt.
      return 'production';
  }
}

function countsOf(byModality: Record<string, { attempts: number }>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(byModality).map(([modality, reading]) => [modality, reading.attempts]),
  );
}

function emptyEvidence(): NextPracticeCandidateDto['evidence'] {
  return {
    dueAt: null,
    overdueDays: null,
    stability: null,
    reps: null,
    lapses: null,
    verdict: null,
    gap: null,
    byModality: null,
    unitId: null,
    unitTitle: null,
    introducedBy: null,
  };
}

function groupByReason(candidates: Candidate[]): Record<PracticeReason, Candidate[]> {
  const pools: Record<PracticeReason, Candidate[]> = {
    due: [],
    weak: [],
    'modality-gap': [],
    upcoming: [],
  };
  for (const candidate of candidates) pools[candidate.reason].push(candidate);
  for (const pool of Object.values(pools)) pool.sort((a, b) => b.urgency - a.urgency);
  return pools;
}

/**
 * One from each source in turn, until the budget is spent.
 *
 * Round-robin rather than a merged score, because the sources are not comparable and the
 * comparison would always be won by the same one: a schedule produces candidates every
 * single day, while "never once produced" and "the next lesson needs this" produce a
 * handful and are the reason this endpoint exists. A list that is all `due` is a list the
 * learner could have got from the review queue.
 *
 * Sources that run dry drop out and the rest fill the room, so a learner with nothing due
 * still gets a full fifteen minutes.
 */
function interleave(pools: Record<PracticeReason, Candidate[]>, capacity: number): Candidate[] {
  const order: PracticeReason[] = ['due', 'modality-gap', 'weak', 'upcoming'];
  const cursors: Record<PracticeReason, number> = { due: 0, weak: 0, 'modality-gap': 0, upcoming: 0 };
  const picked: Candidate[] = [];

  while (picked.length < capacity) {
    let took = false;
    for (const reason of order) {
      if (picked.length >= capacity) break;
      const pool = pools[reason];
      const cursor = cursors[reason];
      if (cursor >= pool.length) continue;
      picked.push(pool[cursor] as Candidate);
      cursors[reason] = cursor + 1;
      took = true;
    }
    if (!took) break; // every source dry
  }

  return picked;
}
