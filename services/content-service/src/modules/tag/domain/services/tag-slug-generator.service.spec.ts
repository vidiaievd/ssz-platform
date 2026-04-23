import { TagSlugGeneratorService } from './tag-slug-generator.service.js';
import { TagScope } from '../value-objects/tag-scope.vo.js';
import type { ITagRepository } from '../repositories/tag.repository.interface.js';

function makeRepo(count = 0): ITagRepository {
  return {
    countBySlugPrefix: jest.fn().mockResolvedValue(count),
    findById: jest.fn(),
    findBySlugAndScope: jest.fn(),
    findAll: jest.fn(),
    save: jest.fn(),
  } as unknown as ITagRepository;
}

function makeSvc(count = 0): TagSlugGeneratorService {
  // @Inject decorator doesn't affect plain construction in tests
  const repo = makeRepo(count);
  return new TagSlugGeneratorService(repo as any);
}

describe('TagSlugGeneratorService', () => {
  it('returns slugified name when no collision exists', async () => {
    const svc = makeSvc(0);
    const slug = await svc.generate('Hello World', TagScope.GLOBAL, null);
    expect(slug).toBe('hello-world');
  });

  it('appends -2 on first collision', async () => {
    const svc = makeSvc(1);
    const slug = await svc.generate('Hello World', TagScope.GLOBAL, null);
    expect(slug).toBe('hello-world-2');
  });

  it('appends -N+1 for N existing collisions', async () => {
    const svc = makeSvc(4);
    const slug = await svc.generate('Grammar', TagScope.SCHOOL, 'school-1');
    expect(slug).toBe('grammar-5');
  });

  it('falls back to "tag" for purely non-latin input', async () => {
    const svc = makeSvc(0);
    const slug = await svc.generate('日本語', TagScope.GLOBAL, null);
    expect(slug).toBe('tag');
  });

  it('falls back to "tag" for empty string', async () => {
    const svc = makeSvc(0);
    const slug = await svc.generate('', TagScope.GLOBAL, null);
    expect(slug).toBe('tag');
  });

  it('truncates base slug to 75 characters', async () => {
    const longName = 'a'.repeat(100);
    const svc = makeSvc(0);
    const slug = await svc.generate(longName, TagScope.GLOBAL, null);
    expect(slug.length).toBe(75);
    expect(slug).toBe('a'.repeat(75));
  });

  it('still generates correct suffix after truncation', async () => {
    const longName = 'a'.repeat(100);
    const svc = makeSvc(2);
    const slug = await svc.generate(longName, TagScope.GLOBAL, null);
    expect(slug).toBe('a'.repeat(75) + '-3');
  });

  it('passes scope and ownerSchoolId to countBySlugPrefix', async () => {
    const countBySlugPrefix = jest.fn().mockResolvedValue(0);
    const repo = {
      countBySlugPrefix,
      findById: jest.fn(),
      findBySlugAndScope: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
    } as unknown as ITagRepository;
    const svc = new TagSlugGeneratorService(repo as any);
    await svc.generate('Grammar', TagScope.SCHOOL, 'school-42');
    expect(countBySlugPrefix).toHaveBeenCalledWith('grammar', TagScope.SCHOOL, 'school-42');
  });
});
