import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationPreferences } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class PreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profilesRepository: ProfilesRepository,
  ) {}

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Preferences are created lazily — upsert with defaults on first read
    return this.prisma.notificationPreferences.upsert({
      where: { profileId: profile.id },
      create: { profileId: profile.id },
      update: {},
    });
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<NotificationPreferences> {
    const profile = await this.profilesRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    // Upsert — create with defaults if not yet exists, otherwise update only provided fields
    return this.prisma.notificationPreferences.upsert({
      where: { profileId: profile.id },
      create: {
        profileId: profile.id,
        emailEnabled: dto.emailEnabled ?? true,
        pushEnabled: dto.pushEnabled ?? true,
        studyRemindersEnabled: dto.studyRemindersEnabled ?? true,
        reminderTime: dto.reminderTime,
        quietHoursStart: dto.quietHoursStart,
        quietHoursEnd: dto.quietHoursEnd,
      },
      update: {
        ...(dto.emailEnabled !== undefined && { emailEnabled: dto.emailEnabled }),
        ...(dto.pushEnabled !== undefined && { pushEnabled: dto.pushEnabled }),
        ...(dto.studyRemindersEnabled !== undefined && {
          studyRemindersEnabled: dto.studyRemindersEnabled,
        }),
        ...(dto.reminderTime !== undefined && { reminderTime: dto.reminderTime }),
        ...(dto.quietHoursStart !== undefined && { quietHoursStart: dto.quietHoursStart }),
        ...(dto.quietHoursEnd !== undefined && { quietHoursEnd: dto.quietHoursEnd }),
      },
    });
  }
}
