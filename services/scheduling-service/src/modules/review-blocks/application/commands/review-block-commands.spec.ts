import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ReviewBlock, type ReviewBlockRepeat } from '../../domain/entities/review-block.entity.js';
import type { IReviewBlockRepository } from '../../domain/repositories/review-block.repository.interface.js';
import type { ReviewBlockAccessService } from '../services/review-block-access.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { CreateReviewBlockHandler } from './create-review-block/create-review-block.handler.js';
import { CreateReviewBlockCommand } from './create-review-block/create-review-block.command.js';
import { UpdateReviewBlockHandler } from './update-review-block/update-review-block.handler.js';
import { UpdateReviewBlockCommand } from './update-review-block/update-review-block.command.js';
import { SkipReviewBlockDayHandler } from './skip-review-block-day/skip-review-block-day.handler.js';
import { SkipReviewBlockDayCommand } from './skip-review-block-day/skip-review-block-day.command.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const teacher: AuthenticatedUser = { userId: 't1', roles: [], isPlatformAdmin: false };

const stored = (repeat: ReviewBlockRepeat, startsOn: string, endsOn: string | null, skips: string[] = []) =>
  new ReviewBlock(
    'b1', 's1', 't1', repeat, d(startsOn), endsOn === null ? null : d(endsOn),
    '16:00', '17:30', null, 't1', d('2026-10-01'), d('2026-10-01'), new Set(skips),
  );

function setup(existing: ReviewBlock | null = null) {
  const blocks = {
    findById: jest.fn(async () => existing),
    create: jest.fn(async (b) => b),
    update: jest.fn(async (_id, changes) => changes),
    addSkip: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<IReviewBlockRepository>;
  const access = { requireCanWrite: jest.fn(async () => undefined) } as unknown as jest.Mocked<ReviewBlockAccessService>;
  return { blocks, access };
}

describe('CreateReviewBlockHandler', () => {
  it('gives a one-off its own day as its last', async () => {
    const { blocks, access } = setup();
    await new CreateReviewBlockHandler(blocks, access).execute(
      new CreateReviewBlockCommand('s1', 't1', 'one_off', d('2026-10-29'), null, '16:00', '17:00', null, teacher),
    );
    expect(blocks.create).toHaveBeenCalledWith(expect.objectContaining({ endsOn: d('2026-10-29'), createdBy: 't1' }));
  });

  it('refuses a malformed block before asking who the caller is', async () => {
    const { blocks, access } = setup();
    await expect(
      new CreateReviewBlockHandler(blocks, access).execute(
        new CreateReviewBlockCommand('s1', 't1', 'weekly', d('2026-10-29'), null, '17:00', '16:00', null, teacher),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(access.requireCanWrite).not.toHaveBeenCalled();
    expect(blocks.create).not.toHaveBeenCalled();
  });
});

describe('UpdateReviewBlockHandler', () => {
  const run = (existing: ReviewBlock, changes: object) => {
    const { blocks, access } = setup(existing);
    return new UpdateReviewBlockHandler(blocks, access)
      .execute(new UpdateReviewBlockCommand('b1', changes, teacher))
      .then(() => blocks.update.mock.calls[0]![1]);
  };

  it('moves a one-off with its day', async () => {
    const written = await run(stored('one_off', '2026-10-29', '2026-10-29'), { startsOn: d('2026-11-05') });
    expect(written).toMatchObject({ startsOn: d('2026-11-05'), endsOn: d('2026-11-05') });
  });

  it('turns a one-off into an open series', async () => {
    const written = await run(stored('one_off', '2026-10-29', '2026-10-29'), { repeat: 'weekly' });
    expect(written).toMatchObject({ repeat: 'weekly', endsOn: null });
  });

  it('keeps the end of a series it was not told to change', async () => {
    const written = await run(stored('weekly', '2026-10-06', '2026-12-15'), { startTime: '15:00' });
    expect(written).toMatchObject({ endsOn: d('2026-12-15'), startTime: '15:00' });
  });

  it('clears the end of a series on an explicit null', async () => {
    const written = await run(stored('weekly', '2026-10-06', '2026-12-15'), { endsOn: null });
    expect(written).toMatchObject({ endsOn: null });
  });

  it('answers 404 for a block that is not there', async () => {
    const { blocks, access } = setup(null);
    await expect(
      new UpdateReviewBlockHandler(blocks, access).execute(new UpdateReviewBlockCommand('b1', {}, teacher)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SkipReviewBlockDayHandler', () => {
  const skip = (existing: ReviewBlock, date: string) => {
    const { blocks, access } = setup(existing);
    const result = new SkipReviewBlockDayHandler(blocks, access).execute(
      new SkipReviewBlockDayCommand('b1', d(date), teacher),
    );
    return { blocks, result };
  };

  it('takes a sitting of a series out', async () => {
    const { blocks, result } = skip(stored('weekly', '2026-10-06', null), '2026-10-13');
    await result;
    expect(blocks.addSkip).toHaveBeenCalledWith('b1', d('2026-10-13'));
  });

  it('does nothing for a day already skipped', async () => {
    const { blocks, result } = skip(stored('weekly', '2026-10-06', null, ['2026-10-13']), '2026-10-13');
    await result;
    expect(blocks.addSkip).not.toHaveBeenCalled();
  });

  it('refuses a day the series does not sit on, and any day of a one-off', async () => {
    await expect(skip(stored('weekly', '2026-10-06', null), '2026-10-14').result).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_AN_OCCURRENCE' }),
    });
    await expect(skip(stored('one_off', '2026-10-29', '2026-10-29'), '2026-10-29').result).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ONE_OFF_CANNOT_SKIP' }),
    });
  });
});
