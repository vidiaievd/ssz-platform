import { ProfileNotFoundException } from '../../../../profiles/domain/exceptions/profile-not-found.exception.js';
import { StudentProfile } from '../../../domain/entities/student-profile.entity.js';
import { GetStudentPreferencesHandler } from '../../queries/get-student-preferences/get-student-preferences.handler.js';
import { GetStudentPreferencesQuery } from '../../queries/get-student-preferences/get-student-preferences.query.js';
import { UpdateStudentPreferencesCommand } from './update-student-preferences.command.js';
import { UpdateStudentPreferencesHandler } from './update-student-preferences.handler.js';

function setup(opts: { profile?: boolean; student?: StudentProfile } = {}) {
  let stored: StudentProfile | null = opts.student ?? null;
  const profiles = {
    findByUserId: jest
      .fn()
      .mockResolvedValue(opts.profile === false ? null : { id: 'p1' }),
  };
  const students = {
    findByProfileId: jest
      .fn()
      .mockImplementation(() => Promise.resolve(stored)),
    save: jest.fn().mockImplementation((s: StudentProfile) => {
      stored = s;
      return Promise.resolve();
    }),
  };
  return {
    students,
    update: new UpdateStudentPreferencesHandler(
      profiles as never,
      students as never,
    ),
    get: new GetStudentPreferencesHandler(profiles as never, students as never),
    stored: () => stored,
  };
}

const existing = () =>
  StudentProfile.rehydrate({
    id: 's1',
    profileId: 'p1',
    nativeLanguage: 'uk',
    targetLanguages: [{ languageCode: 'nb', level: 'A2' }],
    dailyGoalMin: 10,
    translationLanguage: 'ru',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  });

describe('student preferences', () => {
  it('reads nulls for a learner without a student profile', async () => {
    const { get } = setup();
    await expect(
      get.execute(new GetStudentPreferencesQuery('u1')),
    ).resolves.toEqual({
      dailyGoalMin: null,
      translationLanguage: null,
    });
  });

  it('starts an empty student profile on the first saved preference, raising no event', async () => {
    const { update, get, stored } = setup();
    await update.execute(
      new UpdateStudentPreferencesCommand('u1', { dailyGoalMin: 15 }),
    );

    const s = stored()!;
    expect(s.profileId).toBe('p1');
    expect(s.targetLanguages).toEqual([]);
    expect(s.getDomainEvents()).toEqual([]);
    await expect(
      get.execute(new GetStudentPreferencesQuery('u1')),
    ).resolves.toEqual({
      dailyGoalMin: 15,
      translationLanguage: null,
    });
  });

  it('leaves out what was not sent, clears what was sent as null, keeps the rest of the profile', async () => {
    const { update, stored } = setup({ student: existing() });
    await update.execute(
      new UpdateStudentPreferencesCommand('u1', { translationLanguage: null }),
    );

    const s = stored()!;
    expect(s.id).toBe('s1');
    expect(s.dailyGoalMin).toBe(10);
    expect(s.translationLanguage).toBeUndefined();
    expect(s.nativeLanguage).toBe('uk');
    expect(s.targetLanguages).toEqual([{ languageCode: 'nb', level: 'A2' }]);
  });

  it('answers 404 when the base profile is missing', async () => {
    const { update, students } = setup({ profile: false });
    await expect(
      update.execute(
        new UpdateStudentPreferencesCommand('u1', { dailyGoalMin: 5 }),
      ),
    ).rejects.toBeInstanceOf(ProfileNotFoundException);
    expect(students.save).not.toHaveBeenCalled();
  });
});
