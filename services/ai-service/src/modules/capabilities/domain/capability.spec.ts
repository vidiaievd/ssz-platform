import type { ModelFeatures } from '../../providers/domain/model-features.js';
import { missingFeatures } from './capability.js';

const base: ModelFeatures = {
  structuredOutput: 'json_mode',
  tools: false,
  streaming: true,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 32_000,
  maxOutput: 4_000,
};

describe('missingFeatures', () => {
  it('is empty when nothing is required', () => {
    expect(missingFeatures(base, {})).toEqual([]);
  });

  it('treats structured output as a floor', () => {
    expect(missingFeatures(base, { structuredOutput: 'json_mode' })).toEqual([]);
    expect(missingFeatures({ ...base, structuredOutput: 'native' }, { structuredOutput: 'json_mode' })).toEqual([]);
    expect(missingFeatures(base, { structuredOutput: 'native' })).toEqual(['structuredOutput native (has json_mode)']);
  });

  it('names every missing flag and limit', () => {
    expect(
      missingFeatures(base, { tools: true, streaming: true, vision: true, minContextWindow: 100_000, minMaxOutput: 4_000 }),
    ).toEqual(['tools', 'vision', 'contextWindow ≥ 100000 (has 32000)']);
  });
});
