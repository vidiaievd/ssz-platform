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
  /**
   * Whether the model accepts sampling parameters (`temperature`). Absent means it does.
   * Some current models reject a non-default value with a 400, so adapters drop it there.
   */
  samplingParams?: boolean;
}

/**
 * What a speech model can do (plan 82, step 3) — the registry's `features` of a model whose
 * modality is `speech`. A voice capability declares the ones it needs, like an agent does.
 */
export interface SpeechFeatures {
  /** Languages it recognizes, as the course names them (`nb`, `en`) — not provider locales. */
  languages: string[];
  /** Start and end of every word. */
  wordTimings: boolean;
  /** Scores pronunciation against the reference text (Azure Pronunciation Assessment). */
  pronunciation: boolean;
  /** Longest audio one call takes; longer is refused before the call. */
  maxAudioSeconds: number;
}

/** `llm` — text in, text or structure out; `speech` — audio in, words out. */
export type ModelModality = 'llm' | 'speech';

export type ProviderKind =
  | 'anthropic'
  | 'openai'
  | 'openai_compatible'
  | 'azure_openai'
  | 'google'
  | 'fake';

/** Where and how to reach a provider — the registry row, minus anything secret. */
export interface ProviderConnection {
  code: string;
  baseUrl: string | null;
  apiVersion: string | null;
  /** Env variable holding the key; the adapter reads it at call time. Null = keyless. */
  credentialRef: string | null;
}

/** The model as an adapter needs it: the provider's own id plus what the registry says it can do. */
export interface LlmModelRef {
  /** For Azure, the deployment name. */
  providerModelId: string;
  features: ModelFeatures;
  provider: ProviderConnection;
}

/** The speech model as an adapter needs it. */
export interface SpeechModelRef {
  providerModelId: string;
  features: SpeechFeatures;
  provider: ProviderConnection;
}
