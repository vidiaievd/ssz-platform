export class DeleteSlotCommand {
  constructor(
    public readonly schoolId: string,
    public readonly groupId: string,
    public readonly slotId: string,
    public readonly requesterId: string,
  ) {}
}
