// Application-level DTO — no HTTP/Swagger decorators, no Prisma types.
// Returned by query handlers and consumed by presentation layer.
export class ProfileDto {
  id: string;
  userId: string;
  displayName: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  bio?: string;
  timezone: string;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}
