import { BadRequestException } from '@nestjs/common';
import { SortParserService } from './sort-parser.service.js';

const ALLOWED = ['created_at', 'updated_at', 'title'];
const FALLBACK = [{ field: 'createdAt', direction: 'desc' as const }];

function makeSvc(): SortParserService {
  return new SortParserService();
}

describe('SortParserService', () => {
  describe('parse()', () => {
    it('returns fallback when raw is undefined', () => {
      expect(makeSvc().parse(undefined, ALLOWED, FALLBACK)).toBe(FALLBACK);
    });

    it('returns fallback when raw is empty string', () => {
      expect(makeSvc().parse('', ALLOWED, FALLBACK)).toBe(FALLBACK);
    });

    it('parses a single asc token', () => {
      expect(makeSvc().parse('title_asc', ALLOWED, FALLBACK)).toEqual([
        { field: 'title', direction: 'asc' },
      ]);
    });

    it('parses a single desc token', () => {
      expect(makeSvc().parse('created_at_desc', ALLOWED, FALLBACK)).toEqual([
        { field: 'createdAt', direction: 'desc' },
      ]);
    });

    it('converts snake_case field to camelCase', () => {
      const result = makeSvc().parse('updated_at_asc', ALLOWED, FALLBACK);
      expect(result[0].field).toBe('updatedAt');
    });

    it('parses multiple tokens', () => {
      const result = makeSvc().parse('title_asc,created_at_desc', ALLOWED, FALLBACK);
      expect(result).toEqual([
        { field: 'title', direction: 'asc' },
        { field: 'createdAt', direction: 'desc' },
      ]);
    });

    it('truncates to 3 tokens when more are provided', () => {
      const raw = 'title_asc,created_at_desc,updated_at_asc,title_desc';
      const result = makeSvc().parse(raw, ALLOWED, FALLBACK);
      expect(result).toHaveLength(3);
    });

    it('throws for an invalid sort direction', () => {
      expect(() => makeSvc().parse('title_random', ALLOWED, FALLBACK)).toThrow(BadRequestException);
    });

    it('throws for a disallowed sort field', () => {
      expect(() => makeSvc().parse('unknown_asc', ALLOWED, FALLBACK)).toThrow(BadRequestException);
    });

    it('throws for a token with no underscore separator', () => {
      expect(() => makeSvc().parse('badtoken', ALLOWED, FALLBACK)).toThrow(BadRequestException);
    });

    it('ignores whitespace around comma-separated tokens', () => {
      const result = makeSvc().parse(' title_asc , created_at_desc ', ALLOWED, FALLBACK);
      expect(result).toHaveLength(2);
    });
  });

  describe('toPrismaOrderBy()', () => {
    it('converts SortParam array to Prisma orderBy objects', () => {
      const params = [
        { field: 'createdAt', direction: 'desc' as const },
        { field: 'title', direction: 'asc' as const },
      ];
      expect(makeSvc().toPrismaOrderBy(params)).toEqual([{ createdAt: 'desc' }, { title: 'asc' }]);
    });

    it('returns empty array for empty input', () => {
      expect(makeSvc().toPrismaOrderBy([])).toEqual([]);
    });
  });
});
