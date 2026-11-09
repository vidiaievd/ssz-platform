export class GetLearnerSoundAtomsQuery {
  constructor(
    public readonly userId: string,
    /** The course language whose sounds are asked about (`nb`); atom ids are `<language>:<family>`. */
    public readonly language: string,
  ) {}
}
