export class Result<T, E extends Error = Error> {
  private constructor(
    private readonly _ok: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T>(value: T): Result<T, never> {
    return new Result<T, never>(true, value);
  }

  static err<E extends Error>(error: E): Result<never, E> {
    return new Result<never, E>(false, undefined, error);
  }

  get isOk(): boolean { return this._ok; }
  get isErr(): boolean { return !this._ok; }

  get value(): T {
    if (!this._ok) throw new Error('Cannot get value of an error result');
    return this._value as T;
  }

  get error(): E {
    if (this._ok) throw new Error('Cannot get error of a success result');
    return this._error as E;
  }
}
