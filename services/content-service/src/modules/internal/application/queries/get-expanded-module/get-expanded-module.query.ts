export class GetExpandedModuleQuery {
  constructor(
    public readonly moduleId: string,
    public readonly language: string,
    public readonly level: string,
  ) {}
}
