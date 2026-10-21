import { Injectable } from '@nestjs/common';
import type { ICredentialPresence } from '../../application/ports/credential-presence.js';

/**
 * Reads `process.env` directly rather than through ConfigService: the variable names come
 * from the database (`credentialRef`), so they cannot be part of the validated env schema.
 */
@Injectable()
export class EnvCredentialPresence implements ICredentialPresence {
  isSet(credentialRef: string): boolean {
    const value = process.env[credentialRef];
    return typeof value === 'string' && value.trim().length > 0;
  }
}
