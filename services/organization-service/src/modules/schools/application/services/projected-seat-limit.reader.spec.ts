import { jest } from '@jest/globals';
import type {
  ISeatLimitProjection,
  ISeatLimitSource,
  SeatLimitSnapshot,
} from '../../../../shared/application/ports/seat-limit.interface.js';
import { ProjectedSeatLimitReader } from './projected-seat-limit.reader.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');
const LATER = new Date('2026-12-01T00:00:00.000Z');
const EARLIER = new Date('2026-11-10T11:00:00.000Z');
const snap = (max: number | null, over: Partial<SeatLimitSnapshot> = {}): SeatLimitSnapshot => ({
  max,
  version: 3,
  validUntil: LATER,
  ...over,
});

function setup(held: SeatLimitSnapshot | null, fetched: SeatLimitSnapshot | Error) {
  const projection = {
    get: jest.fn<ISeatLimitProjection['get']>().mockResolvedValue(held),
    save: jest.fn<ISeatLimitProjection['save']>().mockResolvedValue(true),
  };
  const source = {
    fetchStudentSeatLimit: jest.fn<ISeatLimitSource['fetchStudentSeatLimit']>(() =>
      fetched instanceof Error ? Promise.reject(fetched) : Promise.resolve(fetched),
    ),
  };
  const reader = new ProjectedSeatLimitReader(projection, source, () => NOW);
  return { projection, source, reader };
}

describe('ProjectedSeatLimitReader', () => {
  it('answers from a fresh projection row without asking subscription-service', async () => {
    const { reader, source } = setup(snap(30), new Error('unused'));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: true, max: 30 });
    expect(source.fetchStudentSeatLimit).not.toHaveBeenCalled();
  });

  it('keeps "no limit" from the projection', async () => {
    const { reader } = setup(snap(null), new Error('unused'));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: true, max: null });
  });

  it('reads through on a miss and stores the answer', async () => {
    const { reader, projection } = setup(null, snap(5, { version: 1 }));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: true, max: 5 });
    expect(projection.save).toHaveBeenCalledWith('s1', snap(5, { version: 1 }));
  });

  it('reads through past validUntil', async () => {
    const { reader, source } = setup(snap(30, { validUntil: EARLIER }), snap(150, { version: 4 }));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: true, max: 150 });
    expect(source.fetchStudentSeatLimit).toHaveBeenCalledWith('s1');
  });

  it('prefers a fresher row that landed during the read through', async () => {
    const { reader, projection } = setup(null, snap(5, { version: 1 }));
    projection.save.mockResolvedValue(false);
    projection.get.mockResolvedValueOnce(null).mockResolvedValueOnce(snap(100, { version: 2 }));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: true, max: 100 });
  });

  it('falls back to a stale row when subscription-service is down', async () => {
    const { reader } = setup(snap(30, { validUntil: EARLIER }), new Error('503'));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: true, max: 30 });
  });

  it('is unknown with neither a row nor an answer — the caller lets the learner in', async () => {
    const { reader } = setup(null, new Error('503'));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: false });
  });

  it('survives an unreadable projection and an unwritable one', async () => {
    const { reader, projection } = setup(null, snap(5));
    projection.get.mockRejectedValue(new Error('db down'));
    projection.save.mockRejectedValue(new Error('db down'));
    await expect(reader.studentSeatLimit('s1')).resolves.toEqual({ known: true, max: 5 });
  });
});
