import { ProfileType } from '../../domain/value-objects/profile-type.vo.js';

// Application-level DTO — no HTTP/Swagger decorators, no Prisma types.
// Returned by query handlers and consumed by presentation layer.
export class ProfileDto {
  id: string;
  userId: string;
  displayName: string;
  profileType: ProfileType;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  timezone: string;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}
