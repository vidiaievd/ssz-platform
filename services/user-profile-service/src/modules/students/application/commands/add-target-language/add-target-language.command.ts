import type { CefrLevel } from '../../../domain/value-objects/target-language.vo.js';

export class AddTargetLanguageCommand {
  constructor(
    readonly userId: string,
    readonly languageCode: string,
    readonly level?: CefrLevel,
  ) {}
}
