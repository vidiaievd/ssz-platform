import { BadRequestException } from '@nestjs/common';
import { BILLED_PAYER_TYPES, type BilledPayerType } from '../domain/payer.js';

export const PAYER_TYPE_PARAM = { name: 'payerType', enum: BILLED_PAYER_TYPES, description: 'workspace (school, incl. SOLO) or user' };
export const PAYER_ID_PARAM = { name: 'payerId', format: 'uuid', description: 'schoolId or userId' };

/** The `:payerType` of an admin route; anything but a billed payer type is 400. */
export function payerType(value: string): BilledPayerType {
  if (!(BILLED_PAYER_TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(`payerType must be one of: ${BILLED_PAYER_TYPES.join(', ')}`);
  }
  return value as BilledPayerType;
}
