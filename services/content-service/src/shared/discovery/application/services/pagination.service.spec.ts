import { BadRequestException } from '@nestjs/common';
import { PaginationService } from './pagination.service.js';

function makeSvc(defaultLimit = 20, maxLimit = 100): PaginationService {
  const svc = new PaginationService();
  // @ts-expect-error — override readonly defaults for tests
  svc['defaultLimit'] = defaultLimit;
  // @ts-expect-error — override readonly defaults for tests
  svc['maxLimit'] = maxLimit;
  return svc;
}

describe('PaginationService', () => {
  describe('normalize()', () => {
    it('returns defaults when both args are undefined', () => {
      const svc = makeSvc(20, 100);
      expect(svc.normalize()).toEqual({ page: 1, limit: 20 });
    });

    it('returns provided valid values', () => {
      const svc = makeSvc(20, 100);
      expect(svc.normalize(3, 50)).toEqual({ page: 3, limit: 50 });
    });

    it('throws when page is 0', () => {
      expect(() => makeSvc().normalize(0, 10)).toThrow(BadRequestException);
    });

    it('throws when page is negative', () => {
      expect(() => makeSvc().normalize(-1, 10)).toThrow(BadRequestException);
    });

    it('throws when page is a float', () => {
      expect(() => makeSvc().normalize(1.5, 10)).toThrow(BadRequestException);
    });

    it('throws when limit is 0', () => {
      expect(() => makeSvc().normalize(1, 0)).toThrow(BadRequestException);
    });

    it('throws when limit exceeds maxLimit', () => {
      expect(() => makeSvc(20, 100).normalize(1, 101)).toThrow(BadRequestException);
    });

    it('allows limit equal to maxLimit', () => {
      const svc = makeSvc(20, 100);
      expect(svc.normalize(1, 100)).toEqual({ page: 1, limit: 100 });
    });
  });

  describe('toSkipTake()', () => {
    it('returns skip=0 for page 1', () => {
      expect(makeSvc().toSkipTake({ page: 1, limit: 20 })).toEqual({ skip: 0, take: 20 });
    });

    it('returns correct skip for page 2', () => {
      expect(makeSvc().toSkipTake({ page: 2, limit: 20 })).toEqual({ skip: 20, take: 20 });
    });

    it('returns correct skip for arbitrary page and limit', () => {
      expect(makeSvc().toSkipTake({ page: 5, limit: 10 })).toEqual({ skip: 40, take: 10 });
    });
  });

  describe('toPaginatedResult()', () => {
    const svc = makeSvc();
    const params = { page: 2, limit: 10 };

    it('assembles result fields correctly', () => {
      const result = svc.toPaginatedResult(['a', 'b'], 25, params);
      expect(result).toEqual({ items: ['a', 'b'], total: 25, page: 2, limit: 10, totalPages: 3 });
    });

    it('returns totalPages=0 when total is 0', () => {
      const result = svc.toPaginatedResult([], 0, params);
      expect(result.totalPages).toBe(0);
    });

    it('rounds totalPages up (ceiling)', () => {
      const result = svc.toPaginatedResult([], 21, { page: 1, limit: 10 });
      expect(result.totalPages).toBe(3);
    });

    it('returns totalPages=1 when total equals limit', () => {
      const result = svc.toPaginatedResult([], 10, { page: 1, limit: 10 });
      expect(result.totalPages).toBe(1);
    });
  });
});
