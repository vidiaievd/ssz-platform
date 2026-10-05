// What leaves the server before the verdict — structurally, not by spot check (plan 70 §3.2).

import { describe, expect, it } from 'vitest';

import { addPoint, setMode, setPointText, setPrompt, setSettings, toggleStudentVisible } from './edits.js';
import { sampleDocument, SAMPLE_PROMPT_IDS } from './fixture.js';
import { fromPersisted, toContent, toExpectedAnswers } from './persistence.js';
import { toStudentProjection } from './projection.js';
import type { ReadAloudContent } from './model.js';

const P1 = SAMPLE_PROMPT_IDS[0];

function project(ex: ReadAloudContent) {
  return toStudentProjection(toContent(ex), toExpectedAnswers(ex));
}

describe('the content column', () => {
  it('carries no note, no focus word and no descriptor', () => {
    const json = JSON.stringify(toContent(sampleDocument()));
    expect(json).not.toContain('Lytt etter kj/sj');
    expect(json).not.toContain('kj-lyd i framlyd');
    expect(json).not.toContain('Vanskelig å forstå');
    expect(json).not.toContain('"focus"');
    expect(json).not.toContain('"note"');
    expect(json).not.toContain('"levels"');
  });

  it('round-trips through both columns', () => {
    const ex = sampleDocument();
    const back = fromPersisted(
      JSON.parse(JSON.stringify(toContent(ex))),
      JSON.parse(JSON.stringify(toExpectedAnswers(ex))),
    );
    expect(back).toEqual(ex);
  });

  it('reads garbage as an empty document instead of throwing', () => {
    const ex = fromPersisted('nope', 42);
    expect(ex.mode).toBe('read');
    expect(ex.prompts).toEqual([]);
    expect(ex.recording.takes).toBe(3);
    expect(fromPersisted({ recording: { takes: 9 } }, null).recording.takes).toBe(3);
  });
});

describe('the projection', () => {
  it('holds per prompt exactly the keys of the mode, and nothing of the key side', () => {
    const out = project(sampleDocument());
    for (const p of out.prompts) {
      expect(Object.keys(p).sort()).toEqual(['id', 'label', 'maxSeconds', 'minSeconds', 'prepSeconds', 'text']);
    }
    expect(Object.keys(out).sort()).toEqual([
      'instruction',
      'language',
      'mode',
      'prompts',
      'recording',
      'settings',
      'title',
    ]);
    expect(Object.keys(out.settings).sort()).toEqual(['revision', 'showModel', 'showRubric']);
  });

  it('sends a monologue the picture when there is one and only the plan points that say something', () => {
    let ex = setMode(sampleDocument(), 'monologue');
    ex = addPoint(addPoint(ex, P1), P1);
    ex = setPointText(ex, P1, ex.prompts[0]!.plan[0]!.id, 'Hvem er på bildet?');
    ex = setPrompt(ex, P1, { image: { assetId: 'img-1', caption: 'Kontoret', alt: 'To personer' } });
    const [first, second] = project(ex).prompts;
    expect(first!.text).toBeUndefined();
    expect(first!.image).toEqual({ assetId: 'img-1', caption: 'Kontoret', alt: 'To personer' });
    expect(first!.plan).toEqual([{ id: ex.prompts[0]!.plan[0]!.id, text: 'Hvem er på bildet?', required: true }]);
    expect(second!.image).toBeUndefined();
  });

  it('sends a dialogue the turn', () => {
    const ex = setPrompt(setMode(sampleDocument(), 'dialogue'), P1, {
      turn: { situation: 'Hos legen.', partner: 'Hva kan jeg hjelpe deg med?' },
    });
    expect(project(ex).prompts[0]!.turn).toEqual({ situation: 'Hos legen.', partner: 'Hva kan jeg hjelpe deg med?' });
  });

  it('carries the rubric only under «always», only what the student may see, with descriptors', () => {
    expect(project(sampleDocument()).rubric).toBeUndefined();
    const always = toggleStudentVisible(setSettings(sampleDocument(), { showRubric: 'always' }), 'flow');
    const rubric = project(always).rubric!;
    expect(rubric.map((c) => c.id)).toEqual(['pron', 'content']);
    expect(rubric[0]!.levels[0]).toBe('Vanskelig å forstå.');
  });
});
