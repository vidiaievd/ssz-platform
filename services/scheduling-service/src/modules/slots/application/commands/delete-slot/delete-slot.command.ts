export class DeleteSlotCommand {
  constructor(
    public readonly slotId: string,
    public readonly requesterId: string,
  ) {}
}
