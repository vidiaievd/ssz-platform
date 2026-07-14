import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { GetPublicSchoolQuery } from './get-public-school.query.js';

export interface PublicTeacherDto {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PublicSchoolDto {
  schoolId: string;
  schoolSlug: string;
  schoolName: string;
  description: string | undefined;
  avatarUrl: string | undefined;
  city: string | undefined;
  website: string | undefined;
  isOpenForApplications: boolean;
  studentCount?: number;
  levels?: string[];
  teachers?: PublicTeacherDto[];
}

@QueryHandler(GetPublicSchoolQuery)
export class GetPublicSchoolHandler implements IQueryHandler<GetPublicSchoolQuery, PublicSchoolDto> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
  ) {}

  async execute(query: GetPublicSchoolQuery): Promise<PublicSchoolDto> {
    const detail = await this.schoolRepo.findPublicSchoolDetail(query.schoolSlug);
    if (!detail) throw new SchoolNotFoundException(query.schoolSlug);

    const { school, studentCount, levels, teachers } = detail;

    return {
      schoolId: school.id,
      schoolSlug: school.slug,
      schoolName: school.name,
      description: school.description,
      avatarUrl: school.avatarUrl,
      city: school.city,
      website: school.website,
      isOpenForApplications: school.isActive,
      studentCount,
      levels,
      teachers,
    };
  }
}
