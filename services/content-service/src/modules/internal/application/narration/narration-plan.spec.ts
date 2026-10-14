import { findAudioTokens, setAudioNarration } from './lesson-narration-token.js';
import { planVariantNarration } from './narration-plan.js';
import type { NarrationAssetInfo } from './narration-plan.js';
import { toNarrationScript } from '@ssz/shared-kernel/narration';

const BODY = '## 2D — Prøvetiden\n\n**Silje:** Hvordan synes du de første ukene har vært?\n\n**Ola:** Veldig bra.';
const HASH = toNarrationScript(BODY, 'nb').textHash;
const withToken = (id: string) => `${BODY}\n\n[audio:${id}]`;

const lookup = (assets: Record<string, NarrationAssetInfo>) => (id: string) => assets[id];

describe('planVariantNarration', () => {
  it('creates a narration for a body without one', () => {
    expect(planVariantNarration(BODY, 'nb', lookup({}))).toEqual({ kind: 'create' });
  });

  it('leaves a body with nothing to read alone', () => {
    expect(planVariantNarration('![](media://abc)', 'nb', lookup({}))).toEqual({
      kind: 'skip',
      reason: 'nothing-to-read',
    });
  });

  it('never touches a recording made by a person, stale or not', () => {
    const plan = planVariantNarration(
      withToken('rec'),
      'nb',
      lookup({ rec: { status: 'READY', origin: 'UPLOAD', textHash: null } }),
    );
    expect(plan).toEqual({ kind: 'skip', reason: 'recorded', assetId: 'rec' });
  });

  it('keeps a synthesized narration that speaks the current text', () => {
    const plan = planVariantNarration(
      withToken('syn'),
      'nb',
      lookup({ syn: { status: 'READY', origin: 'SYNTHESIZED', textHash: HASH } }),
    );
    expect(plan).toEqual({ kind: 'skip', reason: 'current', assetId: 'syn' });
  });

  it('refreshes a synthesized narration whose text has changed', () => {
    const plan = planVariantNarration(
      withToken('syn'),
      'nb',
      lookup({ syn: { status: 'READY', origin: 'SYNTHESIZED', textHash: 'old-hash' } }),
    );
    expect(plan).toEqual({ kind: 'refresh', replaces: 'syn', why: 'stale' });
  });

  it('refreshes a failed synthesis and waits for one still being produced', () => {
    expect(
      planVariantNarration(withToken('f'), 'nb', lookup({ f: { status: 'FAILED', origin: 'SYNTHESIZED', textHash: null } })),
    ).toEqual({ kind: 'refresh', replaces: 'f', why: 'failed' });
    expect(
      planVariantNarration(
        withToken('p'),
        'nb',
        lookup({ p: { status: 'PENDING_UPLOAD', origin: 'SYNTHESIZED', textHash: null } }),
      ),
    ).toEqual({ kind: 'skip', reason: 'in-progress', assetId: 'p' });
  });

  it('does not guess when the asset is unknown or several tokens compete', () => {
    expect(planVariantNarration(withToken('gone'), 'nb', lookup({}))).toEqual({
      kind: 'skip',
      reason: 'asset-unknown',
      assetId: 'gone',
    });
    expect(planVariantNarration(`${withToken('a')}\n\n[audio:b]`, 'nb', lookup({}))).toEqual({
      kind: 'skip',
      reason: 'several-audio-tokens',
    });
  });

  it('is not made stale by the token itself being added', () => {
    expect(toNarrationScript(setAudioNarration(BODY, 'syn', null), 'nb').textHash).toBe(HASH);
  });
});

describe('narration token', () => {
  it('finds tokens with and without a label', () => {
    expect(findAudioTokens('[audio:a1] x [audio:b_2 "Les teksten"]')).toEqual([
      { mediaId: 'a1', label: null },
      { mediaId: 'b_2', label: 'Les teksten' },
    ]);
  });

  it('appends a token, or replaces the existing one in place', () => {
    expect(setAudioNarration('Tekst', 'n1', null)).toBe('Tekst\n\n[audio:n1]');
    expect(setAudioNarration('A\n\n[audio:o1 "L"]\n\nB', 'n1', 'L')).toBe('A\n\n[audio:n1 "L"]\n\nB');
    expect(setAudioNarration('', 'n1', null)).toBe('[audio:n1]');
  });
});
