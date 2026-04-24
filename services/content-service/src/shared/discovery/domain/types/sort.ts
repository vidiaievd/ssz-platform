export type SortDirection = 'asc' | 'desc';

export interface SortParam {
  field: string;
  direction: SortDirection;
}
