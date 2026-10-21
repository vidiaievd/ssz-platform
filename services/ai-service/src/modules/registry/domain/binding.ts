/** What an admin sets on a binding — everything a write can change. */
export interface BindingSettings {
  primaryModelId: string;
  fallbackModelId: string | null;
  maxOutputTokens: number;
  /** Null = the provider's default. */
  temperature: number | null;
  timeoutMs: number;
  promptVersion: string;
  enabled: boolean;
}

/** Which model answers for a capability, and with which call parameters. */
export interface AiBinding extends BindingSettings {
  capability: string;
  version: number;
  updatedBy: string;
  updatedAt: Date;
}

export interface BindingChange {
  capability: string;
  /** The binding's version after the change. */
  version: number;
  changedBy: string;
  changedAt: Date;
  /** Null when this change created the binding. */
  before: BindingSettings | null;
  after: BindingSettings;
}

export function settingsOf(binding: AiBinding): BindingSettings {
  return {
    primaryModelId: binding.primaryModelId,
    fallbackModelId: binding.fallbackModelId,
    maxOutputTokens: binding.maxOutputTokens,
    temperature: binding.temperature,
    timeoutMs: binding.timeoutMs,
    promptVersion: binding.promptVersion,
    enabled: binding.enabled,
  };
}
