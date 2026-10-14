import { keptSettings } from './narration-plan.js';
import type { NarrationAssetInfo } from './narration-plan.js';

const assets = new Map<string, NarrationAssetInfo>([
  ['tuned', { status: 'READY', origin: 'SYNTHESIZED', textHash: 'h', lengthScale: 2.2, pauseScale: 1.5 }],
  ['older', { status: 'READY', origin: 'SYNTHESIZED', textHash: 'h', lengthScale: null, pauseScale: null }],
]);

describe('keptSettings', () => {
  it("keeps the author's pace and pauses when the text changed or the synthesis failed", () => {
    expect(keptSettings({ kind: 'refresh', replaces: 'tuned', why: 'stale' }, assets)).toEqual({
      lengthScale: 2.2,
      pauseScale: 1.5,
    });
    expect(keptSettings({ kind: 'refresh', replaces: 'tuned', why: 'failed' }, assets)).toEqual({
      lengthScale: 2.2,
      pauseScale: 1.5,
    });
  });

  it("starts from the level's defaults again when forced, for a new narration, or an older one without settings", () => {
    expect(keptSettings({ kind: 'refresh', replaces: 'tuned', why: 'forced' }, assets)).toEqual({});
    expect(keptSettings({ kind: 'create' }, assets)).toEqual({});
    expect(keptSettings({ kind: 'refresh', replaces: 'older', why: 'stale' }, assets)).toEqual({});
  });
});
