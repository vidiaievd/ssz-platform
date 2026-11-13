import { jest } from '@jest/globals';
import { StudentSeatGate } from './student-seat-gate.service.js';
import type { ISeatLimitReader, SeatLimitReading } from '../../../../shared/application/ports/seat-limit.interface.js';
import type { IStudentSeatRepository, SeatClaim } from '../../domain/repositories/student-seat.repository.interface.js';
import type { SeatDecision } from '../../domain/value-objects/seat-policy.vo.js';
import { SeatsExhaustedException } from '../../domain/exceptions/seats-exhausted.exception.js';

const CLAIM: SeatClaim = { kind: 'reactivate', userId: 'st-1' };

/** A seat repository over a roster of `used` learners that runs `decide` like the real one. */
function seatRepo(used: number) {
  return {
    countActiveStudents: jest.fn(async () => used),
    claim: jest.fn(async (_s: string, _c: SeatClaim, decide: (u: number) => SeatDecision) => decide(used)),
  };
}

function gate(reading: SeatLimitReading, used: number) {
  const limits = { studentSeatLimit: jest.fn(async () => reading) };
  const seats = seatRepo(used);
  return {
    gate: new StudentSeatGate(limits as unknown as ISeatLimitReader, seats as unknown as IStudentSeatRepository),
    seats,
  };
}

describe('StudentSeatGate', () => {
  describe('claim', () => {
    it('answers the seats after the learner joined', async () => {
      const { gate: g, seats } = gate({ known: true, max: 100 }, 100);
      await expect(g.claim('s-1', CLAIM)).resolves.toEqual({ used: 101, limit: 100, ceiling: 110, state: 'warning' });
      expect(seats.claim).toHaveBeenCalledWith('s-1', CLAIM, expect.any(Function));
    });

    it('throws SEATS_EXHAUSTED at the ceiling', async () => {
      const { gate: g } = gate({ known: true, max: 5 }, 6);
      const err = await g.claim('s-1', CLAIM).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SeatsExhaustedException);
      expect((err as SeatsExhaustedException).seats).toEqual({ used: 6, limit: 5, ceiling: 6, state: 'full' });
    });

    it('lets the learner in when the limit is unknown, and makes up no usage', async () => {
      const { gate: g, seats } = gate({ known: false }, 500);
      await expect(g.claim('s-1', CLAIM)).resolves.toBeNull();
      // Still written through the repository — the row is the same either way.
      expect(seats.claim).toHaveBeenCalled();
    });

    it('a school without a limit gets the count and no ceiling', async () => {
      const { gate: g } = gate({ known: true, max: null }, 41);
      await expect(g.claim('s-1', CLAIM)).resolves.toEqual({ used: 42, limit: null, ceiling: null, state: 'ok' });
    });
  });

  describe('assertRoomForOneMore', () => {
    it('passes below the ceiling', async () => {
      const { gate: g } = gate({ known: true, max: 30 }, 32);
      await expect(g.assertRoomForOneMore('s-1')).resolves.toBeUndefined();
    });

    it('refuses at the ceiling', async () => {
      const { gate: g } = gate({ known: true, max: 30 }, 33);
      await expect(g.assertRoomForOneMore('s-1')).rejects.toBeInstanceOf(SeatsExhaustedException);
    });

    it('does not even count when there is no limit or it is unknown', async () => {
      for (const reading of [{ known: true, max: null } as const, { known: false } as const]) {
        const { gate: g, seats } = gate(reading, 1_000);
        await expect(g.assertRoomForOneMore('s-1')).resolves.toBeUndefined();
        expect(seats.countActiveStudents).not.toHaveBeenCalled();
      }
    });
  });
});
