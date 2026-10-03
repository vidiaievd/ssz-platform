import type { ProbeTask } from '../entities/probe-task.entity.js';

export const PROBE_TASK_REPOSITORY = Symbol('IProbeTaskRepository');

export interface IProbeTaskRepository {
  save(probe: ProbeTask): Promise<void>;

  /**
   * Whatever the row says, expired or not.
   *
   * Expiry is a domain question and is asked of the entity — the repository handing back
   * only live probes would leave every caller unable to tell "expired" from "never
   * existed", which are the two answers that matter here.
   */
  findById(id: string): Promise<ProbeTask | null>;

  /** What is still worth answering for this learner, soonest to expire first. */
  findLiveByUser(userId: string, now: Date, limit: number): Promise<ProbeTask[]>;

  delete(id: string): Promise<void>;

  /**
   * Delete every probe past its time — except one an attempt is still open on.
   *
   * The exception is the learner: a probe whose TTL runs out while someone is halfway
   * through answering it would otherwise vanish from under them, and the attempt they
   * are holding could never be submitted, because submitting re-reads the definition.
   * Expiry is about not accumulating tasks nobody asked for, not about interrupting the
   * one person it was made for.
   *
   * Returns how many went, so the caller can say so.
   */
  deleteExpired(now: Date, limit: number): Promise<number>;
}
