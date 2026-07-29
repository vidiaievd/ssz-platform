export class GetTextSpansQuery {
  constructor(
    public readonly variantId: string,
    /**
     * Authoring surfaces ask for broken spans so they can offer a repair; the
     * reader never does — an annotation pointing at the wrong words is worse
     * than no annotation.
     */
    public readonly includeBroken: boolean,
  ) {}
}
