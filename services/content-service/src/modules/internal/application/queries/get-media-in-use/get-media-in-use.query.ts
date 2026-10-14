/** Which of these media assets a lesson variant body still references (plan 74). */
export class GetMediaInUseQuery {
  constructor(public readonly assetIds: readonly string[]) {}
}
