/**
 * Service-to-service HTTP DTOs (synchronous calls between microservices).
 * These are NOT RabbitMQ payloads — use events/* for async communication.
 */

// ─── Media Service ────────────────────────────────────────────────────────────

export interface MediaAssetRefDto {
  assetId: string;
  mimeType: string;
  /** Public CDN URL or pre-signed download URL */
  url: string;
  /** Variant URLs keyed by variantType, e.g. "thumbnail_256" */
  variants: Record<string, string>;
}

// ─── User Profile Service ─────────────────────────────────────────────────────

export interface UserBasicDto {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  language: string;
}
