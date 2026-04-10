export class ListTutorsQuery {
  constructor(
    readonly languageCode?: string,
    readonly maxHourlyRate?: number,
    readonly limit: number = 20,
    readonly offset: number = 0,
  ) {}
}
