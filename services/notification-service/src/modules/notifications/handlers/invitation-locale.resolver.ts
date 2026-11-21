import { Injectable, Logger } from '@nestjs/common';
import { OwnerContactClient } from '../schedules/clients/owner-contact.client.js';

export interface InvitationLocaleInput {
  inviteeEmail: string;
  /** Known when the organization already matched the address to an account. */
  recipientUserId?: string;
  /** The school's own language (`defaultExplanationLanguage`). */
  schoolLanguage?: string | null;
  /** Owner of the workspace (or the tutor): their language when the school has none. */
  ownerId?: string;
}

/**
 * Which language an invitation letter is written in (plan 90, session 16 remark 3):
 * an address with an account reads its own `uiLocale`; a new address reads the school's language,
 * and when the school has not set one, the owner's `uiLocale` (they run it in that language).
 * `null` = English.
 *
 * Never throws: a profile-service failure must not cost the invitee the letter — it only costs
 * the language, and the next source is tried.
 */
@Injectable()
export class InvitationLocaleResolver {
  private readonly logger = new Logger(InvitationLocaleResolver.name);

  constructor(private readonly contacts: OwnerContactClient) {}

  async resolve(input: InvitationLocaleInput): Promise<string | null> {
    const invitee = await this.inviteeLocale(input);
    if (invitee) return invitee;
    if (input.schoolLanguage) return input.schoolLanguage;
    if (input.ownerId) return this.localeOf(input.ownerId, 'owner');
    return null;
  }

  private async inviteeLocale(input: InvitationLocaleInput): Promise<string | null> {
    let userId = input.recipientUserId ?? null;
    if (!userId) {
      try {
        userId = await this.contacts.userIdByEmail(input.inviteeEmail);
      } catch (err) {
        this.logger.warn(`Invitee lookup failed, letter language falls back: ${(err as Error).message}`);
        return null;
      }
    }
    return userId ? this.localeOf(userId, 'invitee') : null;
  }

  private async localeOf(userId: string, who: 'invitee' | 'owner'): Promise<string | null> {
    try {
      return (await this.contacts.contactOf(userId))?.uiLocale ?? null;
    } catch (err) {
      this.logger.warn(`Contact of ${who}=${userId} unavailable, letter language falls back: ${(err as Error).message}`);
      return null;
    }
  }
}
