import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProfileType } from '@prisma/client';
import { ProfilesService } from './profiles.service';
import { ProfilesRepository } from './profiles.repository';
import { RabbitMQService } from '../../infrastructure/messaging/rabbitmq.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const mockProfile = {
  id: 'profile-uuid',
  userId: 'user-uuid',
  displayName: 'testuser',
  firstName: null,
  lastName: null,
  avatarUrl: null,
  bio: null,
  timezone: 'UTC',
  locale: 'en',
  profileType: ProfileType.STUDENT,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const mockProfilesRepository = {
  findByUserId: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  existsByUserId: jest.fn(),
  findPublicProfile: jest.fn(),
};

const mockRabbitMQService = {
  publish: jest.fn().mockResolvedValue(undefined),
};

describe('ProfilesService', () => {
  let service: ProfilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: ProfilesRepository, useValue: mockProfilesRepository },
        { provide: RabbitMQService, useValue: mockRabbitMQService },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);

    // Reset all mocks between tests
    jest.clearAllMocks();
  });

  // ─── getMyProfile ─────────────────────────────────────────────────────────

  describe('getMyProfile', () => {
    it('returns the profile when found', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(mockProfile);

      const result = await service.getMyProfile('user-uuid');

      expect(result).toEqual(mockProfile);
      expect(mockProfilesRepository.findByUserId).toHaveBeenCalledWith('user-uuid');
    });

    it('throws NotFoundException when profile does not exist', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(null);

      await expect(service.getMyProfile('unknown-uuid')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateMyProfile ──────────────────────────────────────────────────────

  describe('updateMyProfile', () => {
    const dto: UpdateProfileDto = { displayName: 'Updated Name' };

    it('updates and returns the profile', async () => {
      const updatedProfile = { ...mockProfile, displayName: 'Updated Name' };
      mockProfilesRepository.findByUserId.mockResolvedValue(mockProfile);
      mockProfilesRepository.update.mockResolvedValue(updatedProfile);

      const result = await service.updateMyProfile('user-uuid', dto);

      expect(result.displayName).toBe('Updated Name');
      expect(mockRabbitMQService.publish).toHaveBeenCalledWith(
        'profile.updated',
        expect.objectContaining({ userId: mockProfile.userId }),
      );
    });

    it('throws NotFoundException when profile does not exist', async () => {
      mockProfilesRepository.findByUserId.mockResolvedValue(null);

      await expect(service.updateMyProfile('unknown-uuid', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── createFromEvent ──────────────────────────────────────────────────────

  describe('createFromEvent', () => {
    it('creates a STUDENT profile when role is "student"', async () => {
      const createdProfile = { ...mockProfile, profileType: ProfileType.STUDENT };
      mockProfilesRepository.create.mockResolvedValue(createdProfile);

      const result = await service.createFromEvent('user-uuid', 'test@example.com', 'student');

      expect(result.profileType).toBe(ProfileType.STUDENT);
      expect(mockProfilesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid',
          displayName: 'test',
          profileType: ProfileType.STUDENT,
        }),
      );
      expect(mockRabbitMQService.publish).toHaveBeenCalledWith(
        'profile.created',
        expect.objectContaining({ userId: 'user-uuid' }),
      );
    });

    it('creates a TUTOR profile when role is "tutor"', async () => {
      const createdProfile = { ...mockProfile, profileType: ProfileType.TUTOR };
      mockProfilesRepository.create.mockResolvedValue(createdProfile);

      const result = await service.createFromEvent('user-uuid', 'tutor@example.com', 'tutor');

      expect(result.profileType).toBe(ProfileType.TUTOR);
      expect(mockProfilesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ profileType: ProfileType.TUTOR }),
      );
    });

    it('derives displayName from email local part', async () => {
      mockProfilesRepository.create.mockResolvedValue(mockProfile);

      await service.createFromEvent('user-uuid', 'john.doe@example.com', 'student');

      expect(mockProfilesRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'john.doe' }),
      );
    });
  });

  // ─── softDeleteByUserId ───────────────────────────────────────────────────

  describe('softDeleteByUserId', () => {
    it('delegates to repository softDelete', async () => {
      mockProfilesRepository.softDelete.mockResolvedValue(undefined);

      await service.softDeleteByUserId('user-uuid');

      expect(mockProfilesRepository.softDelete).toHaveBeenCalledWith('user-uuid');
    });
  });
});
