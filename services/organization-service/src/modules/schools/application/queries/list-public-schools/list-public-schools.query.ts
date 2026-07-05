export type PublicSchoolsSortOrder = 'recommended' | 'rating' | 'price-asc' | 'students';

export class ListPublicSchoolsQuery {
  constructor(
    readonly q?: string,
    readonly type?: 'ONLINE' | 'HYBRID',
    readonly sort?: PublicSchoolsSortOrder,
    readonly cursor?: string,
    readonly limit: number = 20,
  ) {}
}
