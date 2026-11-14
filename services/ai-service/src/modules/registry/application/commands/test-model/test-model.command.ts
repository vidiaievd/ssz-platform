import type { AdminActor } from '../../../../../shared/application/admin-audit.js';

export class TestModelCommand {
  constructor(
    public readonly modelId: string,
    public readonly admin: AdminActor,
    /** Optional — a test changes nothing; blank is the same as none. */
    public readonly reason: string | null = null,
  ) {}
}
