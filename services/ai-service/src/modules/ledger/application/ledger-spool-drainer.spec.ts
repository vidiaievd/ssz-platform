import type { AiCallRecord } from '../domain/ai-call.js';
import { parseRecord, serializeRecord } from '../infrastructure/redis-ledger-spool.js';
import { LedgerSpoolDrainer } from './ledger-spool-drainer.js';
import { LedgerRecordRejected, type IAiCallLedger } from './ports/ai-call.ledger.js';
import type { ILedgerSpool, SpooledEntry } from './ports/ledger-spool.js';

function row(id: string): AiCallRecord {
  return {
    id,
    capability: 'diagnostic',
    context: { payer: { type: 'platform', id: 'platform' }, actor: null, surface: 'admin_diagnostic' },
    model: null,
    promptVersion: null,
    usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0 },
    cost: { micros: 60, currency: 'USD' },
    credits: '0.060000',
    latencyMs: 12,
    outcome: 'ok',
    errorCode: null,
    fallbackUsed: false,
    attempts: [],
    createdAt: new Date('2026-10-21T10:00:00Z'),
  };
}

/** The Redis spool's contract over an array: drain hands out the head, trims what was done. */
function arraySpool(raws: string[]) {
  const dead: string[] = [];
  const spool: ILedgerSpool = {
    push: async (r) => void raws.push(serializeRecord(r)),
    drain: async (limit, consume) => {
      const entries: SpooledEntry[] = raws.slice(0, limit).map((raw) => ({ raw, record: parseRecord(raw) }));
      if (entries.length === 0) return 0;
      const done = await consume(entries);
      raws.splice(0, done);
      return done;
    },
    deadLetter: async (raw) => void dead.push(raw),
  };
  return { spool, raws, dead };
}

/** Idempotent by id like the Prisma ledger; `down` makes every write fail. */
function ledger() {
  const rows = new Map<string, AiCallRecord>();
  const state = { down: false, writes: 0, reject: new Set<string>() };
  const port: IAiCallLedger = {
    record: async (r) => {
      if (state.down) throw new Error('connect ECONNREFUSED');
      if (state.reject.has(r.id)) throw new LedgerRecordRejected('P2000: value too long');
      state.writes++;
      if (!rows.has(r.id)) rows.set(r.id, r);
    },
  };
  return { port, rows, state };
}

describe('LedgerSpoolDrainer', () => {
  it('moves spooled rows into the ledger, oldest first, and empties the spool', async () => {
    const db = ledger();
    const { spool, raws } = arraySpool([row('a'), row('b')].map(serializeRecord));
    const drainer = new LedgerSpoolDrainer(db.port, spool, 1_000);

    expect(await drainer.drainOnce()).toBe(2);
    expect([...db.rows.keys()]).toEqual(['a', 'b']);
    expect(db.rows.get('a')!.createdAt).toEqual(new Date('2026-10-21T10:00:00Z'));
    expect(raws).toHaveLength(0);
  });

  it('keeps everything while the database is still away', async () => {
    const db = ledger();
    db.state.down = true;
    const { spool, raws } = arraySpool([row('a'), row('b')].map(serializeRecord));
    const drainer = new LedgerSpoolDrainer(db.port, spool, 1_000);

    expect(await drainer.drainOnce()).toBe(0);
    expect(raws).toHaveLength(2);

    db.state.down = false;
    expect(await drainer.drainOnce()).toBe(2);
    expect(db.rows.size).toBe(2);
  });

  it('does not double a row already written before it left the spool', async () => {
    const db = ledger();
    await db.port.record(row('a'));
    const { spool } = arraySpool([row('a'), row('b')].map(serializeRecord));

    await new LedgerSpoolDrainer(db.port, spool, 1_000).drainOnce();
    expect([...db.rows.keys()]).toEqual(['a', 'b']);
  });

  it('parks rejected and unreadable entries instead of blocking the rows behind them', async () => {
    const db = ledger();
    db.state.reject.add('bad');
    const { spool, raws, dead } = arraySpool([serializeRecord(row('bad')), 'not json', serializeRecord(row('c'))]);

    expect(await new LedgerSpoolDrainer(db.port, spool, 1_000).drainOnce()).toBe(3);
    expect([...db.rows.keys()]).toEqual(['c']);
    expect(dead).toEqual([serializeRecord(row('bad')), 'not json']);
    expect(raws).toHaveLength(0);
  });

  it('does nothing when the spool is unavailable or locked by another instance', async () => {
    const spool: ILedgerSpool = { push: async () => undefined, drain: async () => null, deadLetter: async () => undefined };
    expect(await new LedgerSpoolDrainer(ledger().port, spool, 1_000).drainOnce()).toBe(0);
  });
});

describe('spool serialisation', () => {
  it('round-trips a record, including its date', () => {
    expect(parseRecord(serializeRecord(row('a')))).toEqual(row('a'));
  });

  it('reads anything without an id or a valid date as unreadable', () => {
    expect(parseRecord('{"id":"a"}')).toBeNull();
    expect(parseRecord('{"id":"a","createdAt":"nope"}')).toBeNull();
    expect(parseRecord('[')).toBeNull();
  });
});
