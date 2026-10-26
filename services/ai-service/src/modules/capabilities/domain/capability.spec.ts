import type { ModelFeatures, SpeechFeatures } from '../../providers/domain/model-features.js';
import type { AiModel } from '../../registry/domain/registry.types.js';
import { capabilityGaps, missingFeatures, missingSpeechFeatures, type CapabilityDefinition } from './capability.js';

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

const speech: SpeechFeatures = { languages: ['nb', 'en'], wordTimings: true, pronunciation: false, maxAudioSeconds: 60 };

describe('missingSpeechFeatures', () => {
  it('lists every language, feature and length the recognizer falls short of', () => {
    expect(missingSpeechFeatures(speech, {})).toEqual([]);
    expect(missingSpeechFeatures(speech, { languages: ['nb'], wordTimings: true, minAudioSeconds: 60 })).toEqual([]);
    expect(missingSpeechFeatures(speech, { languages: ['nb', 'sv'], pronunciation: true, minAudioSeconds: 120 })).toEqual([
      'language sv',
      'pronunciation',
      'maxAudioSeconds ≥ 120 (has 60)',
    ]);
  });
});

describe('capabilityGaps', () => {
  const ids = { id: 'm', providerId: 'p', providerCode: 'fake', providerModelId: 'm', displayName: 'm', status: 'active' as const };
  const llm: AiModel = { ...ids, modality: 'llm', features: base };
  const recognizer: AiModel = { ...ids, modality: 'speech', features: speech };
  const agent: CapabilityDefinition = { code: 'agent', description: '', requiredFeatures: { tools: true } };
  const voice: CapabilityDefinition = { code: 'voice', description: '', modality: 'speech', requiredFeatures: { pronunciation: true } };

  it('refuses a model of the other modality before looking at features', () => {
    expect(capabilityGaps(recognizer, agent)).toEqual(['modality llm (is speech)']);
    expect(capabilityGaps(llm, voice)).toEqual(['modality speech (is llm)']);
  });

  it('checks the features of its own modality', () => {
    expect(capabilityGaps(llm, agent)).toEqual(['tools']);
    expect(capabilityGaps(recognizer, voice)).toEqual(['pronunciation']);
  });
});
