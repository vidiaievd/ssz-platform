// Plan 56 phase 1 — the whole test checklist of INTEGRATION.md ("Engine", "Validation"),
// run without a DOM.

import { describe, expect, it } from 'vitest';

import {
  AUDIO_DEFAULT,
  audioOf,
  audioOn,
  formatDuration,
  hasClip,
  parseDuration,
  segmentOf,
} from './model.js';
import type { AllowanceContext, AllowanceState } from './allowance.js';
import { canPlay, hasHeard, INITIAL_STATE, isExhausted, isGated, step } from './allowance.js';
import { audioIssues, hasAudioBlocker, placeAudioIssues } from './issues.js';
import { transcriptOnReveal, withStudentAudio } from './projection.js';
import { deriveSkills } from '../skills/derive.js';
import type { AudioSettings, ExerciseAudio } from './model.js';

const settings = (over: Partial<AudioSettings> = {}): AudioSettings => ({
  ...AUDIO_DEFAULT.settings,
  ...over,
});

const ctx = (over: Partial<AllowanceContext> = {}): AllowanceContext => ({
  settings: settings(),
  duration: 60,
  ...over,
});

/** A document with audio on and a clip attached. */
const doc = (audio: Partial<ExerciseAudio> = {}, rest: Record<string, unknown> = {}) => ({
  ...rest,
  audio: {
    ...AUDIO_DEFAULT,
    enabled: true,
    assetId: 'asset-1',
    title: 'Dialog: på legekontoret',
    duration: 60,
    ...audio,
    settings: settings(audio.settings),
  },
});

/** Run a sequence of events and return the final state. */
function run(events: Parameters<typeof step>[1][], context = ctx(), from = INITIAL_STATE) {
  return events.reduce<AllowanceState>((state, event) => step(state, event, context).state, from);
}

describe('audioOf', () => {
  it('reads a document with no audio field as switched off', () => {
    // Every exercise written before this feature. It must load, and it must be unchanged.
    expect(audioOf({ questions: [] })).toEqual(AUDIO_DEFAULT);
    expect(audioOn({ questions: [] })).toBe(false);
    expect(audioOf(null)).toEqual(AUDIO_DEFAULT);
    expect(audioOf('nonsense')).toEqual(AUDIO_DEFAULT);
  });

  it('does not hand out the shared default object', () => {
    const read = audioOf({});
    read.settings.plays = 3;
    expect(AUDIO_DEFAULT.settings.plays).toBe(0);
  });

  it('falls back per field rather than rejecting a half-written block', () => {
    const read = audioOf({ audio: { enabled: true, settings: { plays: 7, layout: 'sideways' } } });
    expect(read.enabled).toBe(true);
    expect(read.settings.plays).toBe(0);
    expect(read.settings.layout).toBe('top');
  });
});

describe('hasClip', () => {
  it('asks only about the active source', () => {
    const asset = audioOf(doc({ source: 'asset', assetId: 'a-1', url: '' }));
    expect(hasClip(asset)).toBe(true);

    // Switching to a link keeps the file, but there is nothing to play until a URL exists.
    expect(hasClip({ ...asset, source: 'link' })).toBe(false);
    expect(hasClip({ ...asset, source: 'link', url: 'https://x/y.mp3' })).toBe(true);
    expect(hasClip({ ...asset, source: 'lesson' })).toBe(false);
    expect(
      hasClip({ ...asset, source: 'lesson', lessonRef: { lessonId: 'l-1', variant: 'nb' } }),
    ).toBe(true);
  });
});

describe('parseDuration / formatDuration', () => {
  it('parses mm:ss and bare seconds', () => {
    expect(parseDuration('1:36')).toBe(96);
    expect(parseDuration('0:07')).toBe(7);
    expect(parseDuration('96')).toBe(96);
  });

  it('answers null for what it cannot read, so the field keeps its last value', () => {
    expect(parseDuration('1:')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();
  });

  it('round-trips through the format the player prints', () => {
    expect(formatDuration(96)).toBe('1:36');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
  });
});

describe('the play allowance', () => {
  it('spends a listen starting from the top', () => {
    const state = run([{ type: 'play' }]);
    expect(state.plays).toBe(1);
    expect(state.playing).toBe(true);
  });

  it('spends a listen restarting from the ended state', () => {
    const state = run([{ type: 'play' }, { type: 'ended' }, { type: 'play' }]);
    expect(state.plays).toBe(2);
    expect(state.pos).toBe(0);
  });

  it('spends nothing on pause and resume', () => {
    const state = run([
      { type: 'play' },
      { type: 'time', pos: 20 },
      { type: 'pause' },
      { type: 'play' },
    ]);
    expect(state.plays).toBe(1);
    expect(state.playing).toBe(true);
  });

  it('spends nothing after a skip back or a scrub', () => {
    const state = run([
      { type: 'play' },
      { type: 'time', pos: 30 },
      { type: 'pause' },
      { type: 'seek', to: 20 },
      { type: 'play' },
      { type: 'seek', to: 45 },
      { type: 'play' },
    ]);
    expect(state.plays).toBe(1);
  });

  it('spends nothing on a fragment', () => {
    const state = run([{ type: 'playRange', start: 22, end: 48 }]);
    expect(state.plays).toBe(0);
    expect(state.playing).toBe(true);
    expect(state.range).toEqual({ start: 22, end: 48 });
  });

  it('refuses the next start when the allowance is out, but not the current listen', () => {
    const context = ctx({ settings: settings({ plays: 1 }) });
    const playing = run([{ type: 'play' }, { type: 'time', pos: 10 }], context);
    expect(isExhausted(playing, context.settings)).toBe(true);
    expect(playing.playing).toBe(true);

    // The listen that is running finishes.
    const finished = run([{ type: 'ended' }], context, playing);
    expect(finished.completed).toBe(1);

    // The next start is refused, and the button says so before it is pressed.
    const refused = step(finished, { type: 'play' }, context);
    expect(refused.state).toBe(finished);
    expect(refused.effect).toEqual({ seekTo: null, transport: null });
    expect(canPlay(finished, context)).toBe(false);
  });

  it('lets a paused listen resume after the allowance is out', () => {
    // Departure from BEHAVIOR §5's "exhausted and stopped → disabled", plan 56 §5: the
    // allowance table prices a resume at nothing, and a limit that punished pausing
    // would teach students not to pause rather than to listen carefully.
    const context = ctx({ settings: settings({ plays: 1 }) });
    const paused = run([{ type: 'play' }, { type: 'time', pos: 25 }, { type: 'pause' }], context);
    expect(isExhausted(paused, context.settings)).toBe(true);
    expect(canPlay(paused, context)).toBe(true);

    const resumed = step(paused, { type: 'play' }, context);
    expect(resumed.state.playing).toBe(true);
    expect(resumed.state.plays).toBe(1);
    expect(resumed.effect.seekTo).toBeNull();
  });

  it('treats an unlimited allowance as never exhausted', () => {
    const state = run([
      { type: 'play' },
      { type: 'ended' },
      { type: 'play' },
      { type: 'ended' },
      { type: 'play' },
    ]);
    expect(isExhausted(state, settings())).toBe(false);
    expect(state.plays).toBe(3);
  });
});

describe('fragments', () => {
  it('clamps a range to the clip', () => {
    const under = step(INITIAL_STATE, { type: 'playRange', start: -10, end: 20 }, ctx());
    expect(under.state.range).toEqual({ start: 0, end: 20 });

    const over = step(INITIAL_STATE, { type: 'playRange', start: 40, end: 900 }, ctx());
    expect(over.state.range).toEqual({ start: 40, end: 60 });
  });

  it('does nothing at all for an inverted range', () => {
    const result = step(INITIAL_STATE, { type: 'playRange', start: 30, end: 30 }, ctx());
    expect(result.state).toBe(INITIAL_STATE);
    expect(result.effect.transport).toBeNull();
  });

  it('stops at the end of the range and stays there', () => {
    const state = run([
      { type: 'playRange', start: 22, end: 48 },
      { type: 'time', pos: 48.2 },
    ]);
    expect(state.playing).toBe(false);
    expect(state.pos).toBe(48);
    expect(state.range).toBeNull();
    expect(state.completed).toBe(0);
  });

  it('does not count a fragment that runs to the end of the clip as a playthrough', () => {
    const state = run([{ type: 'playRange', start: 50, end: 60 }, { type: 'ended' }]);
    expect(state.completed).toBe(0);
    expect(hasHeard(state)).toBe(false);
  });

  it('spends a listen when the whole clip is played after a fragment', () => {
    const state = run([
      { type: 'playRange', start: 22, end: 48 },
      { type: 'time', pos: 48 },
      { type: 'play' },
    ]);
    // The position is not at the top, so this is a resume, not a start — the fragment
    // left the head at 0:48 and playing from there costs nothing.
    expect(state.plays).toBe(0);
  });
});

describe('seeking', () => {
  it('is a no-op when the teacher turned it off', () => {
    const context = ctx({ settings: settings({ seek: false }) });
    const played = run([{ type: 'play' }, { type: 'time', pos: 30 }], context);
    const result = step(played, { type: 'seek', to: 5 }, context);
    expect(result.state).toBe(played);
    expect(result.effect).toEqual({ seekTo: null, transport: null });
  });

  it('clears an active fragment', () => {
    const state = run([{ type: 'playRange', start: 22, end: 48 }, { type: 'seek', to: 10 }]);
    expect(state.range).toBeNull();
    expect(state.pos).toBe(10);
  });
});

describe('the gate', () => {
  it('opens on one complete playthrough and not on 95 per cent of one', () => {
    const gate = settings({ gate: 'first' });
    const context = ctx({ settings: gate });

    const nearly = run([{ type: 'play' }, { type: 'time', pos: 57 }, { type: 'pause' }], context);
    expect(isGated(nearly, gate)).toBe(true);

    const heard = run([{ type: 'ended' }], context, nearly);
    expect(isGated(heard, gate)).toBe(false);
  });

  it('is open when the clip cannot be played at all', () => {
    // BEHAVIOR §11: a 404 must not leave the exercise unanswerable.
    const gate = settings({ gate: 'first' });
    expect(isGated(INITIAL_STATE, gate, { playable: false })).toBe(false);
  });

  it('never locks when the teacher did not ask for a gate', () => {
    expect(isGated(INITIAL_STATE, settings())).toBe(false);
  });
});

describe('reset', () => {
  it('clears position, listens, playthroughs and range — a restart is a new attempt', () => {
    const played = run([
      { type: 'play' },
      { type: 'time', pos: 30 },
      { type: 'ended' },
      { type: 'playRange', start: 5, end: 9 },
    ]);
    const after = step(played, { type: 'reset' }, ctx());
    expect(after.state).toEqual(INITIAL_STATE);
    expect(after.effect).toEqual({ seekTo: 0, transport: 'pause' });
  });
});

describe('audioIssues', () => {
  const items = [{ id: 'q1' }, { id: 'q2' }];

  it('says nothing at all about an exercise with audio off', () => {
    expect(audioIssues({ questions: [] }, items)).toEqual([]);
    expect(audioIssues({ audio: { ...AUDIO_DEFAULT, title: '' } }, items)).toEqual([]);
  });

  it('blocks an exercise that says listen and has nothing to play', () => {
    const issues = audioIssues(doc({ assetId: '' }), items);
    expect(issues.map((i) => i.code)).toContain('AUD_NO_CLIP');
    expect(hasAudioBlocker(issues)).toBe(true);
  });

  it('clears the blocker for each of the three sources', () => {
    expect(hasAudioBlocker(audioIssues(doc({ source: 'asset', assetId: 'a-1' }), items))).toBe(
      false,
    );
    expect(
      hasAudioBlocker(audioIssues(doc({ source: 'link', url: 'https://x/y.mp3' }), items)),
    ).toBe(false);
    expect(
      hasAudioBlocker(
        audioIssues(doc({ source: 'lesson', lessonRef: { lessonId: 'l-1', variant: 'nb' } }), items),
      ),
    ).toBe(false);
  });

  it('warns about a transcript the policy needs and clears when it is written', () => {
    const empty = audioIssues(doc({ settings: settings({ transcriptWhen: 'after' }) }), items);
    expect(empty.map((i) => i.code)).toContain('AUD_NO_TRANSCRIPT');

    const written = audioIssues(
      doc({ transcript: 'Hei, jeg har vondt i halsen.', settings: settings({ transcriptWhen: 'after' }) }),
      items,
    );
    expect(written.map((i) => i.code)).not.toContain('AUD_NO_TRANSCRIPT');

    // `never` shows nothing, so an empty transcript is not a problem.
    const never = audioIssues(doc(), items);
    expect(never.map((i) => i.code)).not.toContain('AUD_NO_TRANSCRIPT');
  });

  it('warns when one listen has to carry more than four items', () => {
    const many = [1, 2, 3, 4, 5].map((n) => ({ id: `q${n}` }));
    const codes = audioIssues(doc({ settings: settings({ plays: 1 }) }), many).map((i) => i.code);
    expect(codes).toContain('AUD_ONE_PLAY_MANY_ITEMS');

    const few = audioIssues(doc({ settings: settings({ plays: 1 }) }), items).map((i) => i.code);
    expect(few).not.toContain('AUD_ONE_PLAY_MANY_ITEMS');
  });

  it('points out that a limit next to a scrub bar does not limit', () => {
    const codes = audioIssues(doc({ settings: settings({ plays: 2, seek: true }) }), items).map(
      (i) => i.code,
    );
    expect(codes).toContain('AUD_LIMIT_WITH_SEEK');

    const locked = audioIssues(doc({ settings: settings({ plays: 2, seek: false }) }), items).map(
      (i) => i.code,
    );
    expect(locked).not.toContain('AUD_LIMIT_WITH_SEEK');
  });

  it('names the item whose timecode is wrong', () => {
    const timed = [
      { id: 'q1', audio: { start: 30, end: 10 } },
      { id: 'q2', audio: { start: 10, end: 900 } },
      { id: 'q3', audio: { start: 0, end: 20 } },
    ];
    const issues = audioIssues(doc({ useSegments: true }), timed);
    expect(issues).toContainEqual({
      code: 'AUD_SEG_INVERTED',
      level: 'warning',
      part: 'segments',
      itemId: 'q1',
    });
    expect(issues).toContainEqual({
      code: 'AUD_SEG_BEYOND',
      level: 'warning',
      part: 'segments',
      itemId: 'q2',
    });
    expect(issues.filter((i) => i.part === 'segments')).toHaveLength(2);
  });

  it('says nothing about timecodes while they are switched off', () => {
    const timed = [{ id: 'q1', audio: { start: 30, end: 10 } }];
    expect(audioIssues(doc({ useSegments: false }), timed)).toEqual(
      audioIssues(doc({ useSegments: false }), [{ id: 'q1' }]),
    );
    expect(segmentOf(audioOf(doc({ useSegments: false })), timed[0])).toBeNull();
  });

  it('keeps quiet about a timecode past an unknown duration', () => {
    const timed = [{ id: 'q1', audio: { start: 10, end: 900 } }];
    const codes = audioIssues(doc({ useSegments: true, duration: 0 }), timed).map((i) => i.code);
    expect(codes).not.toContain('AUD_SEG_BEYOND');
  });
});

describe('placeAudioIssues', () => {
  it('puts each issue on the step of the host that owns its fix', () => {
    // Four steps in `multiple_choice`, three in `word_bank_gap_fill` — the same list,
    // placed differently, which is the whole reason the mapping is a parameter.
    const issues = audioIssues(doc({ assetId: '', settings: settings({ transcriptWhen: 'always' }) }));

    const four = placeAudioIssues(issues, { source: 1, segments: 1, rules: 3, transcript: 4 });
    expect(four.find((i) => i.code === 'AUD_NO_CLIP')?.step).toBe(1);
    expect(four.find((i) => i.code === 'AUD_NO_TRANSCRIPT')?.step).toBe(4);

    const three = placeAudioIssues(issues, { source: 1, segments: 1, rules: 3, transcript: 3 });
    expect(three.find((i) => i.code === 'AUD_NO_TRANSCRIPT')?.step).toBe(3);
  });
});

describe('what the student is allowed to hold', () => {
  const withTranscript = (when: 'never' | 'after' | 'always', over = {}) =>
    doc({
      transcript: 'Hei, jeg har vondt i halsen.',
      translation: 'Hi, my throat hurts.',
      settings: settings({ transcriptWhen: when }),
      ...over,
    });

  it('leaves a document that never carried audio untouched, object and all', () => {
    // Every exercise written before this feature goes through here.
    const content = { questions: [{ id: 'q1' }] };
    expect(withStudentAudio(content, content)).toBe(content);
  });

  it('withholds the transcript under `never` and `after`', () => {
    for (const when of ['never', 'after'] as const) {
      const projected = withStudentAudio({ questions: [] }, withTranscript(when));
      const audio = projected['audio'] as ExerciseAudio;
      expect(audio.transcript).toBe('');
      expect(audio.translation).toBe('');
      // The policy itself still travels: the runner has to know whether words are coming.
      expect(audio.settings.transcriptWhen).toBe(when);
    }
  });

  it('serves the transcript under `always` — it is the accommodation path', () => {
    const projected = withStudentAudio({ questions: [] }, withTranscript('always'));
    expect((projected['audio'] as ExerciseAudio).transcript).toBe('Hei, jeg har vondt i halsen.');
  });

  it('withholds the transcript of a switched-off block too', () => {
    // Switching audio off keeps the material (BEHAVIOR §1). Keeping it is not a reason
    // to hand it over.
    const off = withTranscript('always', { enabled: false });
    const projected = withStudentAudio({ questions: [] }, off);
    expect((projected['audio'] as ExerciseAudio).transcript).toBe('');
  });

  it('puts the block back onto a projection that would have dropped it', () => {
    // The six per-template projections build a new object out of the content column;
    // without this step a listening exercise would reach the runner with no clip.
    const projected = withStudentAudio({ instruction: 'Hør etter' }, withTranscript('never'));
    expect((projected['audio'] as ExerciseAudio).assetId).toBe('asset-1');
    expect(projected['instruction']).toBe('Hør etter');
  });

  it('owes a transcript on reveal only under `after`', () => {
    expect(transcriptOnReveal(withTranscript('after'))).toEqual({
      transcript: 'Hei, jeg har vondt i halsen.',
      translation: 'Hi, my throat hurts.',
    });
    expect(transcriptOnReveal(withTranscript('always'))).toBeNull();
    expect(transcriptOnReveal(withTranscript('never'))).toBeNull();
    expect(transcriptOnReveal(withTranscript('after', { enabled: false }))).toBeNull();
    expect(transcriptOnReveal({ questions: [] })).toBeNull();
  });

  it('owes nothing when the author wrote no transcript', () => {
    expect(transcriptOnReveal(doc({ settings: settings({ transcriptWhen: 'after' }) }))).toBeNull();
  });
});

describe('the joint with the skill axes (plan 55 §3.4)', () => {
  it('reports a block written by this module as listening', () => {
    // `derive.ts` was written before this module existed and reads `audio.enabled`
    // defensively, so the two only meet through the shape. This is that meeting: if the
    // block ever moved or was renamed, every listening exercise on the platform would go
    // on being counted as reading and nothing would fail but the report.
    const document = { questions: [], audio: { ...AUDIO_DEFAULT, enabled: true } };

    expect(deriveSkills({ templateCode: 'multiple_choice', content: document }).skills).toEqual([
      'listening',
    ]);
    expect(deriveSkills({ templateCode: 'multiple_choice', content: document }).skillSource).toBe(
      'document',
    );

    // And with the switch off it is whatever it was before — reading, here.
    const off = { questions: [], audio: AUDIO_DEFAULT };
    expect(deriveSkills({ templateCode: 'multiple_choice', content: off }).skills).toEqual([
      'reading',
    ]);
  });
});
