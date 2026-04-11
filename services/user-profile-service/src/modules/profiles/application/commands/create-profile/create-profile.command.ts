import { ProfileType } from '../../../domain/value-objects/profile-type.vo.js';

export class CreateProfileCommand {
  constructor(
    readonly userId: string,
    readonly displayName: string,
    readonly profileType: ProfileType,
    readonly firstName?: string,
    readonly lastName?: string,
    readonly timezone?: string,
    readonly locale?: string,
  ) {}
}
