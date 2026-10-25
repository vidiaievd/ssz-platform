import {
  answerableTeachers,
  summarizeTerms,
  termKey,
} from '../../../../src/modules/review-terms/domain/attribution.js';
import type { AcceptanceRow } from '../../../../src/modules/review-terms/domain/attribution.js';

const primary = { userId: 't1', name: 'Anna', role: 'primary' };
const coPrimary = { userId: 't2', name: 'Bjørn', role: 'co_primary' };
const substitute = { userId: 't3', name: 'Cecilie', role: 'substitute' };

function row(overrides: Partial<AcceptanceRow> = {}): AcceptanceRow {
  return {
    attemptId: 'a1',
    groupId: 'g1',
    acceptedAt: new Date('2026-11-01T09:05:00.000Z'),
    aiOutcome: 'approved',
    revisedBy: null,
    revisedOutcome: null,
    ...overrides,
  };
}

describe('answerableTeachers', () => {
  it('puts the work on the primary and co-primary teacher both', () => {
    expect(answerableTeachers([primary, coPrimary])).toEqual([primary, coPrimary]);
  });

  it('puts it on the substitute alone while a substitution is in force', () => {
    expect(answerableTeachers([primary, coPrimary, substitute])).toEqual([substitute]);
  });
});

describe('summarizeTerms', () => {
  const day1 = termKey('g1', '2026-11-01');

  it('counts each work once for the school and once per answerable teacher', () => {
    const summary = summarizeTerms(
      [row(), row({ attemptId: 'a2' })],
      new Map([[day1, [primary, coPrimary]]]),
    );

    expect(summary).toMatchObject({ accepted: 2, revised: 0, overturned: 0, unattributed: 0 });
    expect(summary.teachers).toEqual([
      { userId: 't1', name: 'Anna', accepted: 2, revised: 0, overturned: 0 },
      { userId: 't2', name: 'Bjørn', accepted: 2, revised: 0, overturned: 0 },
    ]);
  });

  it('asks the assignments of the day the term ran out', () => {
    const summary = summarizeTerms(
      [row(), row({ attemptId: 'a2', acceptedAt: new Date('2026-11-02T09:05:00.000Z') })],
      new Map([
        [day1, [primary]],
        [termKey('g1', '2026-11-02'), [primary, substitute]],
      ]),
    );

    expect(summary.teachers).toEqual([
      { userId: 't1', name: 'Anna', accepted: 1, revised: 0, overturned: 0 },
      { userId: 't3', name: 'Cecilie', accepted: 1, revised: 0, overturned: 0 },
    ]);
  });

  it("credits a revision only to the teacher who gave it, and counts it for the school whoever did", () => {
    const summary = summarizeTerms(
      [
        row({ revisedBy: 't2', revisedOutcome: 'returned' }),
        row({ attemptId: 'a2', revisedBy: 't2', revisedOutcome: 'approved' }),
        row({ attemptId: 'a3', revisedBy: 'owner', revisedOutcome: 'returned' }),
      ],
      new Map([[day1, [primary, coPrimary]]]),
    );

    expect(summary).toMatchObject({ accepted: 3, revised: 3, overturned: 2 });
    expect(summary.teachers).toEqual([
      { userId: 't1', name: 'Anna', accepted: 3, revised: 0, overturned: 0 },
      { userId: 't2', name: 'Bjørn', accepted: 3, revised: 2, overturned: 1 },
    ]);
  });

  it('leaves work outside a group or with no teacher that day unattributed', () => {
    const summary = summarizeTerms(
      [row({ groupId: null }), row({ attemptId: 'a2', groupId: 'g2' })],
      new Map([[day1, [primary]]]),
    );

    expect(summary).toMatchObject({ accepted: 2, unattributed: 2, teachers: [] });
  });

  it('counts a teacher holding two roles in a group once', () => {
    const summary = summarizeTerms(
      [row()],
      new Map([[day1, [primary, { ...primary, role: 'co_primary' }]]]),
    );

    expect(summary.teachers).toEqual([{ userId: 't1', name: 'Anna', accepted: 1, revised: 0, overturned: 0 }]);
  });

  it('keeps the totals and says nothing about teachers when the assignments could not be read', () => {
    const summary = summarizeTerms([row({ revisedBy: 't1', revisedOutcome: 'returned' })], null);

    expect(summary).toEqual({ accepted: 1, revised: 1, overturned: 1, unattributed: null, teachers: null });
  });
});
