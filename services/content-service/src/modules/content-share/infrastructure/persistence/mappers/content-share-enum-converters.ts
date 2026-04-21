import { $Enums } from '../../../../../../generated/prisma/client.js';
import { SharePermission } from '../../../domain/value-objects/share-permission.vo.js';

const PRISMA_TO_DOMAIN: Record<$Enums.SharePermission, SharePermission> = {
  READ: SharePermission.READ,
  READ_AND_REVIEW: SharePermission.READ_AND_REVIEW,
};

const DOMAIN_TO_PRISMA: Record<SharePermission, $Enums.SharePermission> = {
  [SharePermission.READ]: 'READ',
  [SharePermission.READ_AND_REVIEW]: 'READ_AND_REVIEW',
};

export function prismaSharePermissionToDomain(v: $Enums.SharePermission): SharePermission {
  return PRISMA_TO_DOMAIN[v];
}

export function domainSharePermissionToPrisma(v: SharePermission): $Enums.SharePermission {
  return DOMAIN_TO_PRISMA[v];
}
