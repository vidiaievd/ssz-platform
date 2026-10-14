import {
  defaultNarrationStyle,
  LEVEL_LENGTH_SCALE,
  NARRATION_LEVELS,
  resolveNarrationStyle,
} from '../../../../src/modules/narration/domain/narration-style.js';

describe('narration style', () => {
  it('reads a beginner more slowly than an advanced learner', () => {
    const scales = NARRATION_LEVELS.map((level) => LEVEL_LENGTH_SCALE[level]);
    expect([...scales].sort((a, b) => b - a)).toEqual(scales);
    expect(LEVEL_LENGTH_SCALE.A1).toBeGreaterThan(LEVEL_LENGTH_SCALE.C1);
  });

  it("defaults to the level's pace and normal pauses, and to the configured pace for a non-CEFR level", () => {
    expect(defaultNarrationStyle('B1', 1.3)).toEqual({ lengthScale: 1.7, pauseScale: 1 });
    expect(defaultNarrationStyle('N4', 1.3)).toEqual({ lengthScale: 1.3, pauseScale: 1 });
    expect(defaultNarrationStyle(null, 1.3)).toEqual({ lengthScale: 1.3, pauseScale: 1 });
  });

  it("lays the author's choice over the defaults and pulls extremes into range", () => {
    const defaults = { lengthScale: 1.7, pauseScale: 1 };
    expect(resolveNarrationStyle({}, defaults)).toEqual(defaults);
    expect(resolveNarrationStyle({ lengthScale: 2.2 }, defaults)).toEqual({ lengthScale: 2.2, pauseScale: 1 });
    expect(resolveNarrationStyle({ lengthScale: 9, pauseScale: 0.01 }, defaults)).toEqual({
      lengthScale: 2.5,
      pauseScale: 0.5,
    });
  });
});
