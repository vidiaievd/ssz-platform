import type { AiBinding } from '../../domain/binding.js';

/** The router's view of bindings: read on every call, so served from a cache. */
export interface IBindingSource {
  get(capability: string): Promise<AiBinding | null>;
}

/** Told after a write, so every instance drops its cached copy of that binding. */
export interface IBindingChangeNotifier {
  changed(capability: string): Promise<void>;
}

export const BINDING_SOURCE = Symbol('BINDING_SOURCE');
export const BINDING_CHANGE_NOTIFIER = Symbol('BINDING_CHANGE_NOTIFIER');
