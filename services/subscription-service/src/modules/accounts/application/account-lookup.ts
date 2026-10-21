import { NotFoundException } from '@nestjs/common';
import type { BillingAccountType } from '../domain/billing-account.js';

export function accountNotFound(type: BillingAccountType, externalId: string): NotFoundException {
  return new NotFoundException(`No billing account for ${type} ${externalId}`);
}
