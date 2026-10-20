/**
 * What a model can do, as recorded in the registry (step 3). Agents declare the features
 * they need and a binding is refused when either of its models lacks one (step 7).
 */
export interface ModelFeatures {
  /**
   * `native` — the provider enforces the schema; `json_mode` — it promises JSON, not the
   * shape; `none` — plain text we parse. `SchemaGuard` checks the answer in all three.
   */
  structuredOutput: 'native' | 'json_mode' | 'none';
  tools: boolean;
  streaming: boolean;
  vision: boolean;
  audioIn: boolean;
  batch: boolean;
  promptCache: boolean;
  contextWindow: number;
  maxOutput: number;
}

export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'openai_compatible'
  | 'azure_openai'
  | 'google'
  | 'fake';

/** The model as an adapter needs it: the provider's own id plus what the registry says it can do. */
export interface LlmModelRef {
  /** For Azure, the deployment name. */
  providerModelId: string;
  features: ModelFeatures;
}
