// The recorder machine without a single timer (plan 70 §3.3, §4.4).

import { describe, expect, it } from 'vitest';

import { DEFAULT_RECORDING, type Recording } from './model.js';
import {
  canSubmit,
  chosenIndex,
  chosenTake,
  clockSeconds,
  clockWarns,
  initialState,
  left,
  micOk,
  micSilent,
  reduce,
  sentTakes,
  shortOnes,
  submitBlock,
  takesOf,
  type RecorderConfig,
  type RecorderEvent,
  type RecorderState,
} from './recorder.js';

function config(recording: Partial<Recording> = {}, prompts = 2): RecorderConfig {
  return {
    prompts: Array.from({ length: prompts }, (_, i) => ({
      id: `p${i + 1}`,
      minSeconds: 5,
      maxSeconds: 20,
      prepSeconds: 3,
    })),
    recording: { ...DEFAULT_RECORDING, ...recording },
  };
}

function run(cfg: RecorderConfig, events: RecorderEvent[], from?: RecorderState): RecorderState {
  return events.reduce((s, e) => reduce(s, e, cfg), from ?? initialState(cfg));
}

const ticks = (n: number): RecorderEvent[] => Array.from({ length: n }, () => ({ type: 'tick' }));

/** One take of `seconds` on the prompt on screen, from `idle`/`review`. */
function record(seconds: number, ref = 'blob:x'): RecorderEvent[] {
  return [
    { type: 'begin' },
    { type: 'startNow' },
    ...ticks(3), // countdown
    ...ticks(seconds),
    { type: 'stop' },
    { type: 'stopped', ref },
  ];
}

describe('the path through the phases', () => {
  it('starts on the level check when micCheck is on, on idle otherwise', () => {
    expect(initialState(config()).phase).toBe('mic');
    expect(initialState(config({ micCheck: false })).phase).toBe('idle');
  });

  it('passes the check after 300 ms of sound, and says when it hears nothing for five seconds', () => {
    const cfg = config();
    const heard = run(cfg, [
      { type: 'level', value: 0.5, ms: 200 },
      { type: 'level', value: 0.5, ms: 200 },
    ]);
    expect(micOk(heard)).toBe(true);
    const silent = run(cfg, Array.from({ length: 6 }, () => ({ type: 'level', value: 0.01, ms: 1000 }) as const));
    expect(micSilent(silent)).toBe(true);
    // «Klar» is not locked by silence: the check advises.
    expect(run(cfg, [{ type: 'ready' }], silent).phase).toBe('idle');
  });

  it('runs mic → idle → prep → count → rec → stopping → review', () => {
    const cfg = config();
    let s = run(cfg, [{ type: 'ready' }, { type: 'begin' }]);
    expect(s.phase).toBe('prep');
    expect(clockSeconds(s, cfg.prompts[0]!)).toBe(3);
    s = run(cfg, ticks(3), s);
    expect(s.phase).toBe('count');
    s = run(cfg, ticks(3), s);
    expect(s.phase).toBe('rec');
    s = run(cfg, [...ticks(7), { type: 'stop' }], s);
    expect(s.phase).toBe('stopping');
    s = run(cfg, [{ type: 'stopped', ref: 'blob:1' }], s);
    expect(s.phase).toBe('review');
    expect(takesOf(s, 'p1')).toEqual([{ n: 1, seconds: 7, ref: 'blob:1', assetId: null, upload: 'pending' }]);
  });

  it('skips preparation at zero seconds and the countdown when it is off', () => {
    const cfg: RecorderConfig = {
      ...config({ micCheck: false, countdown: false }),
      prompts: [{ id: 'p1', minSeconds: 1, maxSeconds: 10, prepSeconds: 0 }],
    };
    expect(run(cfg, [{ type: 'begin' }]).phase).toBe('rec');
  });

  it('«Start nå» ends preparation early', () => {
    const cfg = config({ micCheck: false, countdown: false });
    expect(run(cfg, [{ type: 'begin' }, { type: 'startNow' }]).phase).toBe('rec');
  });

  it('stops itself at the prompt maximum, and never past the hard ceiling', () => {
    const cfg = config({ micCheck: false, countdown: false });
    const s = run(cfg, [{ type: 'begin' }, { type: 'startNow' }, ...ticks(20)]);
    expect(s.phase).toBe('stopping');
    const long: RecorderConfig = {
      ...cfg,
      prompts: [{ id: 'p1', minSeconds: 1, maxSeconds: 900, prepSeconds: 0 }],
    };
    const ceiling = run(long, [{ type: 'begin' }, ...ticks(180)]);
    expect(ceiling.phase).toBe('stopping');
    expect(run(long, [{ type: 'stopped', ref: 'r', seconds: 400 }], ceiling).takes['p1']![0]!.seconds).toBe(180);
  });

  it('turns the clock amber in the last ten seconds', () => {
    const cfg = config({ micCheck: false, countdown: false });
    const s = run(cfg, [{ type: 'begin' }, { type: 'startNow' }, ...ticks(11)]);
    expect(clockWarns(s, cfg.prompts[0]!)).toBe(true);
    expect(clockWarns(run(cfg, [{ type: 'begin' }, { type: 'startNow' }, ...ticks(9)]), cfg.prompts[0]!)).toBe(false);
  });
});

describe('takes', () => {
  it('spends the budget and refuses a fourth', () => {
    const cfg = config({ micCheck: false });
    const s = run(cfg, [...record(6), ...record(7), ...record(8)]);
    expect(takesOf(s, 'p1')).toHaveLength(3);
    expect(left(s, cfg, 'p1')).toBe(0);
    expect(run(cfg, [{ type: 'begin' }], s).phase).toBe('review');
  });

  it('offers the newest take until the student picks another', () => {
    const cfg = config({ micCheck: false });
    let s = run(cfg, [...record(6, 'a'), ...record(7, 'b')]);
    expect(chosenIndex(s, cfg, 'p1')).toBe(1);
    s = run(cfg, [{ type: 'choose', index: 0 }], s);
    expect(chosenTake(s, cfg, 'p1')?.ref).toBe('a');
  });

  it('sends the last take when choosing is off, whatever was picked', () => {
    const cfg = config({ micCheck: false, chooseBest: false });
    const s = run(cfg, [...record(6, 'a'), ...record(7, 'b'), { type: 'choose', index: 0 }]);
    expect(chosenTake(s, cfg, 'p1')?.ref).toBe('b');
  });

  it('an interruption returns to idle, makes no take and spends none', () => {
    const cfg = config({ micCheck: false });
    const s = run(cfg, [{ type: 'begin' }, { type: 'startNow' }, ...ticks(5), { type: 'interrupted' }]);
    expect(s.phase).toBe('idle');
    expect(s.notice).toBe('interrupted');
    expect(takesOf(s, 'p1')).toHaveLength(0);
    expect(left(s, cfg, 'p1')).toBe(3);
    // The next start clears the notice.
    expect(run(cfg, [{ type: 'begin' }], s).notice).toBeNull();
  });

  it('a refused or missing microphone is a state, and retry asks again', () => {
    const cfg = config();
    const denied = run(cfg, [{ type: 'denied' }]);
    expect(denied.phase).toBe('denied');
    expect(run(cfg, [{ type: 'retry' }], denied).phase).toBe('mic');
    const later = run(cfg, [{ type: 'ready' }, { type: 'noDevice' }, { type: 'retry' }]);
    expect(later.phase).toBe('idle');
  });

  it('does not move to another prompt while the microphone is open', () => {
    const cfg = config({ micCheck: false });
    const s = run(cfg, [{ type: 'begin' }, { type: 'goto', index: 1 }]);
    expect(s.index).toBe(0);
    const moved = run(cfg, [...record(6), { type: 'goto', index: 1 }]);
    expect(moved.index).toBe(1);
    expect(moved.phase).toBe('idle');
  });
});

describe('submitting', () => {
  it('names every short prompt, not only the one on screen', () => {
    const cfg = config({ micCheck: false });
    const s = run(cfg, [...record(3), { type: 'goto', index: 1 }, ...record(9)]);
    expect(s.index).toBe(1);
    expect(shortOnes(s, cfg)).toEqual(['p1']);
    expect(submitBlock(s, cfg)).toBe('short');
  });

  it('waits for every prompt and for the uploads', () => {
    const cfg = config({ micCheck: false });
    let s = run(cfg, record(6));
    expect(submitBlock(s, cfg)).toBe('unrecorded');
    s = run(cfg, [{ type: 'goto', index: 1 }, ...record(6)], s);
    expect(submitBlock(s, cfg)).toBe('uploading');
    s = run(
      cfg,
      [
        { type: 'uploaded', itemId: 'p1', n: 1, assetId: 'a1' },
        { type: 'uploaded', itemId: 'p2', n: 1, assetId: 'a2' },
      ],
      s,
    );
    expect(canSubmit(s, cfg)).toBe(true);
  });

  it('waits for the discarded takes too under keepAllTakes', () => {
    const cfg = config({ micCheck: false, keepAllTakes: true }, 1);
    let s = run(cfg, [...record(6), ...record(7), { type: 'uploaded', itemId: 'p1', n: 2, assetId: 'a2' }]);
    expect(sentTakes(s, cfg, 'p1')).toHaveLength(2);
    expect(submitBlock(s, cfg)).toBe('uploading');
    s = run(cfg, [{ type: 'uploaded', itemId: 'p1', n: 1, assetId: 'a1' }], s);
    expect(canSubmit(s, cfg)).toBe(true);
  });

  it('marks a failed upload and lets it be retried', () => {
    const cfg = config({ micCheck: false }, 1);
    let s = run(cfg, [...record(6), { type: 'uploadFailed', itemId: 'p1', n: 1 }]);
    expect(takesOf(s, 'p1')[0]!.upload).toBe('failed');
    s = run(cfg, [{ type: 'uploadRetry', itemId: 'p1', n: 1 }], s);
    expect(takesOf(s, 'p1')[0]!.upload).toBe('pending');
  });
});

describe('restoring a draft', () => {
  it('brings the uploaded takes and the pick back and skips the level check', () => {
    const cfg = config();
    const s = run(cfg, [
      {
        type: 'restore',
        takes: { p1: [{ n: 1, seconds: 8, assetId: 'a1' }, { n: 2, seconds: 9, assetId: 'a2' }], ghost: [] },
        chosen: { p1: 0, p2: 4 },
      },
    ]);
    expect(s.phase).toBe('idle');
    expect(takesOf(s, 'p1').map((t) => t.assetId)).toEqual(['a1', 'a2']);
    expect(chosenIndex(s, cfg, 'p1')).toBe(0);
    expect(s.chosen['p2']).toBeUndefined();
    expect(s.takes['ghost']).toBeUndefined();
  });

  it('keeps the level check when the draft holds nothing', () => {
    const cfg = config();
    expect(run(cfg, [{ type: 'restore', takes: {}, chosen: {} }]).phase).toBe('mic');
  });
});
