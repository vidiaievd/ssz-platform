import type { ModelFeatures } from '../../providers/domain/model-features.js';

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

export interface CapabilityDefinition {
  /** Stable code: the binding key, the ledger's `capability`, the subscription key's suffix. */
  code: string;
  description: string;
  requiredFeatures: RequiredFeatures;
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
