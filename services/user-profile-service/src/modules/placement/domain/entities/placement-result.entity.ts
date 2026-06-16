export type PlacementScope = 'platform' | 'membership';

export interface CreatePlacementResultProps {
  id: string;
  userId: string;
  language: string;
  cefrLevel: string;
  score: number;
  scope: PlacementScope;
  membershipId?: string;
  sourceLabel: string;
  takenAt: Date;
}

export class PlacementResult {
  readonly id: string;
  readonly userId: string;
  readonly language: string;
  readonly cefrLevel: string;
  readonly score: number;
  readonly scope: PlacementScope;
  readonly membershipId: string | undefined;
  readonly sourceLabel: string;
  readonly takenAt: Date;
  readonly createdAt: Date;

  private constructor(props: CreatePlacementResultProps, createdAt: Date) {
    this.id = props.id;
    this.userId = props.userId;
    this.language = props.language;
    this.cefrLevel = props.cefrLevel;
    this.score = props.score;
    this.scope = props.scope;
    this.membershipId = props.membershipId;
    this.sourceLabel = props.sourceLabel;
    this.takenAt = props.takenAt;
    this.createdAt = createdAt;
  }

  static create(props: CreatePlacementResultProps): PlacementResult {
    return new PlacementResult(props, new Date());
  }

  static rehydrate(props: CreatePlacementResultProps & { createdAt: Date }): PlacementResult {
    return new PlacementResult(props, props.createdAt);
  }
}
