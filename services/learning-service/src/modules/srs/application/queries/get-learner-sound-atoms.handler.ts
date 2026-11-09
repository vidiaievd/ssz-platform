import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetLearnerSoundAtomsQuery } from './get-learner-sound-atoms.query.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import {
  ATOM_FLAG_LOG,
  type AtomFlagSource,
  type IAtomFlagLog,
} from '../../domain/repositories/atom-flag-log.interface.js';
import type { ReviewCardState } from '../../domain/entities/review-card.entity.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';

/** How far back flags are read — the same fortnight that introduces a sound card (plan 86 §4y.1, Q19). */
export const SOUND_FLAG_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const SOUND = 'sound';

/** A sound's card as the drill picks from it. */
export interface LearnerSoundCard {
  atomId: string;
  state: ReviewCardState;
  dueAt: string;
  /** Whether it is due at the moment of reading — what the drill takes first. */
  due: boolean;
  stability: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
}

/** A sound named weak in the window, with or without a card. */
export interface LearnerSoundFlags {
  atomId: string;
  /** Distinct UTC days in the window it was flagged on — the strength of the signal. */
  days: number;
  lastFlaggedOn: string;
  /** Flags per source in the window (one per exercise, source and day — `atom_flags` dedups). */
  bySource: Partial<Record<AtomFlagSource, number>>;
  hasCard: boolean;
}

export interface LearnerSoundAtomsResult {
  /** Not suspended; due first, then earlier `dueAt`, then lower stability. */
  cards: LearnerSoundCard[];
  /** Of atoms not suspended; more days first, then the more recent. */
  flags: LearnerSoundFlags[];
  /** The first UTC day of the window, `YYYY-MM-DD`. */
  flagsFrom: string;
}

/**
 * A learner's weak sounds in one language, for the pronunciation drill (plan 86, step 13.1) —
 * what it picks the sounds of a sitting from (§5.5, Q31): due cards first, then sounds flagged
 * in the last fortnight, and when both are empty the drill starts with its own diagnosis.
 *
 * Both lists are this service's own data, so the answer is always complete. The order is a
 * convenience; the choice belongs to the drill. A suspended card hides the sound from both
 * lists: the learner put it away on purpose, as with grammar atoms (plan 85).
 */
@QueryHandler(GetLearnerSoundAtomsQuery)
export class GetLearnerSoundAtomsHandler implements IQueryHandler<GetLearnerSoundAtomsQuery, LearnerSoundAtomsResult> {
  constructor(
    @Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository,
    @Inject(ATOM_FLAG_LOG) private readonly flagLog: IAtomFlagLog,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(query: GetLearnerSoundAtomsQuery): Promise<LearnerSoundAtomsResult> {
    const now = this.clock.now();
    const prefix = `${query.language}:`;
    const from = new Date(startOfUtcDay(now).getTime() - (SOUND_FLAG_WINDOW_DAYS - 1) * DAY_MS);

    const [allCards, rows] = await Promise.all([
      this.srsRepo.findAllByUserAndTypeIncludingShadow(query.userId, 'SOUND_ATOM'),
      this.flagLog.recentFlags(query.userId, SOUND, prefix, from),
    ]);

    const ofLanguage = allCards.filter((c) => c.contentId.startsWith(prefix));
    const suspended = new Set(ofLanguage.filter((c) => c.state === 'SUSPENDED').map((c) => c.contentId));
    const carded = new Set(ofLanguage.map((c) => c.contentId));

    const cards: LearnerSoundCard[] = ofLanguage
      .filter((c) => c.state !== 'SUSPENDED')
      .map((c) => ({
        atomId: c.contentId,
        state: c.state,
        dueAt: c.dueAt.toISOString(),
        due: c.dueAt.getTime() <= now.getTime(),
        stability: c.stability,
        reps: c.reps,
        lapses: c.lapses,
        lastReviewedAt: c.lastReviewedAt?.toISOString() ?? null,
      }))
      .sort((a, b) => Number(b.due) - Number(a.due) || a.dueAt.localeCompare(b.dueAt) || a.stability - b.stability);

    const byAtom = new Map<string, { days: Set<string>; last: string; bySource: Partial<Record<AtomFlagSource, number>> }>();
    for (const row of rows) {
      if (suspended.has(row.atomId)) continue;
      const day = row.flaggedOn.toISOString().slice(0, 10);
      const entry = byAtom.get(row.atomId) ?? { days: new Set<string>(), last: day, bySource: {} };
      entry.days.add(day);
      if (day > entry.last) entry.last = day;
      entry.bySource[row.source] = (entry.bySource[row.source] ?? 0) + 1;
      byAtom.set(row.atomId, entry);
    }
    const flags: LearnerSoundFlags[] = [...byAtom.entries()]
      .map(([atomId, e]) => ({
        atomId,
        days: e.days.size,
        lastFlaggedOn: e.last,
        bySource: e.bySource,
        hasCard: carded.has(atomId),
      }))
      .sort((a, b) => b.days - a.days || b.lastFlaggedOn.localeCompare(a.lastFlaggedOn) || a.atomId.localeCompare(b.atomId));

    return { cards, flags, flagsFrom: from.toISOString().slice(0, 10) };
  }
}

function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
