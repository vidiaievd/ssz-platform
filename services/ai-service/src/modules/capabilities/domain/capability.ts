import type { ModelFeatures, ModelModality, SpeechFeatures } from '../../providers/domain/model-features.js';
import type { AiModel } from '../../registry/domain/registry.types.js';

/**
 * What an agent needs from a model. Every field is a floor: absent = no requirement.
 * A binding is refused when either of its models falls short (plan 77, step 7).
 */
export interface RequiredFeatures {
  /** `json_mode` is met by `native` too; `native` only by `native`. */
  structuredOutput?: 'native' | 'json_mode';
  tools?: true;
  streaming?: true;
  vision?: true;
  audioIn?: true;
  batch?: true;
  promptCache?: true;
  minContextWindow?: number;
  minMaxOutput?: number;
}

/** What a voice capability needs from a speech model (plan 82, step 3). Floors, like the above. */
export interface RequiredSpeechFeatures {
  /** Every one of these languages; a course in another language is refused at call time. */
  languages?: readonly string[];
  wordTimings?: true;
  pronunciation?: true;
  minAudioSeconds?: number;
}

interface CapabilityBase {
  /** Stable code: the binding key, the ledger's `capability`, the subscription key's suffix. */
  code: string;
  description: string;
  /**
   * Prompt versions kept in the repository; a binding may name only one of these. Absent =
   * the capability has no versioned prompt and any label is accepted (`diagnostic`).
   */
  promptVersions?: readonly string[];
}

/**
 * An agent over a language model (absent `modality`), or a voice capability over a speech
 * model. Its models must be of its modality: a recognizer cannot answer a prompt.
 */
export type CapabilityDefinition =
  | (CapabilityBase & { modality?: 'llm'; requiredFeatures: RequiredFeatures })
  | (CapabilityBase & { modality: 'speech'; requiredFeatures: RequiredSpeechFeatures });

export function capabilityModality(capability: CapabilityDefinition): ModelModality {
  return capability.modality ?? 'llm';
}

/** What keeps this model from serving this capability, one readable line per gap. */
export function capabilityGaps(model: AiModel, capability: CapabilityDefinition): string[] {
  const wanted = capabilityModality(capability);
  if (model.modality !== wanted) return [`modality ${wanted} (is ${model.modality})`];
  if (model.modality === 'speech' && capability.modality === 'speech') {
    return missingSpeechFeatures(model.features, capability.requiredFeatures);
  }
  if (model.modality === 'llm' && capability.modality !== 'speech') {
    return missingFeatures(model.features, capability.requiredFeatures);
  }
  return [];
}

const STRUCTURED_RANK: Record<ModelFeatures['structuredOutput'], number> = { none: 0, json_mode: 1, native: 2 };
const FLAGS = ['tools', 'streaming', 'vision', 'audioIn', 'batch', 'promptCache'] as const;

/** What the model lacks, one readable line per gap; empty when it has everything. */
export function missingFeatures(features: ModelFeatures, required: RequiredFeatures): string[] {
  const missing: string[] = [];
  if (
    required.structuredOutput &&
    STRUCTURED_RANK[features.structuredOutput] < STRUCTURED_RANK[required.structuredOutput]
  ) {
    missing.push(`structuredOutput ${required.structuredOutput} (has ${features.structuredOutput})`);
  }
  for (const flag of FLAGS) {
    if (required[flag] && !features[flag]) missing.push(flag);
  }
  if (required.minContextWindow && features.contextWindow < required.minContextWindow) {
    missing.push(`contextWindow ≥ ${required.minContextWindow} (has ${features.contextWindow})`);
  }
  if (required.minMaxOutput && features.maxOutput < required.minMaxOutput) {
    missing.push(`maxOutput ≥ ${required.minMaxOutput} (has ${features.maxOutput})`);
  }
  return missing;
}

export function missingSpeechFeatures(features: SpeechFeatures, required: RequiredSpeechFeatures): string[] {
  const missing: string[] = [];
  for (const language of required.languages ?? []) {
    if (!features.languages.includes(language)) missing.push(`language ${language}`);
  }
  if (required.wordTimings && !features.wordTimings) missing.push('wordTimings');
  if (required.pronunciation && !features.pronunciation) missing.push('pronunciation');
  if (required.minAudioSeconds && features.maxAudioSeconds < required.minAudioSeconds) {
    missing.push(`maxAudioSeconds ≥ ${required.minAudioSeconds} (has ${features.maxAudioSeconds})`);
  }
  return missing;
}
