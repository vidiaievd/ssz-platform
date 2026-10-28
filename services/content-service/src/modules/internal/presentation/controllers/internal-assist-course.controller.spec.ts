import { NotFoundException } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { InternalController } from './internal.controller.js';

const COURSE_ID = '33333333-0000-4000-8000-000000000003';

function makeController(result: unknown) {
  const queryBus = { execute: jest.fn().mockResolvedValue(result) };
  return {
    controller: new InternalController(queryBus as never, {} as never, {} as never, {} as never),
    queryBus,
  };
}

describe('InternalController.getAssistCourse', () => {
  it('answers the language the course teaches', async () => {
    const { controller } = makeController(Result.ok({ container: { targetLanguage: 'nb' } }));

    await expect(controller.getAssistCourse(COURSE_ID)).resolves.toEqual({
      courseId: COURSE_ID,
      targetLanguage: 'nb',
    });
  });

  it('is a 404 for a course that does not exist', async () => {
    const { controller } = makeController(Result.fail({ code: 'CONTAINER_NOT_FOUND' }));

    await expect(controller.getAssistCourse(COURSE_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
