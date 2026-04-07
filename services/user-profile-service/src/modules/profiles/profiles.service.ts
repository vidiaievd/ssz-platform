import { Injectable, NotFoundException } from '@nestjs/common';
import { Profile, ProfileType } from '@prisma/client';
import { ProfilesRepository } from './profiles.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RabbitMQService } from '../../infrastructure/messaging/rabbitmq.service';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async getMyProfile(userId: string): Promise<Profile> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const updated = await this.profilesRepository.update(profile.id, {
      displayName: dto.displayName,
      firstName: dto.firstName,
      lastName: dto.lastName,
      avatarUrl: dto.avatarUrl,
      bio: dto.bio,
      timezone: dto.timezone,
      locale: dto.locale,
    });

    // Notify other services about the profile update
    await this.rabbitMQService.publish('profile.updated', {
      profileId: updated.id,
      userId: updated.userId,
      displayName: updated.displayName,
      timestamp: new Date().toISOString(),
    });

    return updated;
  }

  async getPublicProfile(userId: string): Promise<Profile> {
    const profile = await this.profilesRepository.findPublicProfile(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  /**
   * Called by the event consumer when user.registered is received.
   * Creates a minimal profile with displayName derived from email.
   */
  async createFromEvent(
    userId: string,
    email: string,
    role: string,
  ): Promise<Profile> {
    // Derive a readable display name from the email local part
    const displayName = email.split('@')[0];

    const profileType =
      role === 'tutor' ? ProfileType.TUTOR : ProfileType.STUDENT;

    const profile = await this.profilesRepository.create({
      userId,
      displayName,
      profileType,
    });

    // Publish profile.created so downstream services (e.g. Analytics) can react
    await this.rabbitMQService.publish('profile.created', {
      profileId: profile.id,
      userId: profile.userId,
      profileType: profile.profileType,
      timestamp: new Date().toISOString(),
    });

    return profile;
  }

  /**
   * Called by the event consumer when user.deleted is received.
   * Performs a soft-delete to preserve audit trail.
   */
  async softDeleteByUserId(userId: string): Promise<void> {
    await this.profilesRepository.softDelete(userId);
  }
}
