export class Result<T, E = string> {
  private constructor(
    private readonly _isOk: boolean,
    private readonly _value?: T,
    private readonly _error?: E,
  ) {}

  static ok<T, E = string>(value?: T): Result<T, E> {
    return new Result<T, E>(true, value);
  }

  static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, undefined, error);
  }

  get isOk(): boolean {
    return this._isOk;
  }

  get isFail(): boolean {
    return !this._isOk;
  }

  get value(): T {
    if (!this._isOk) {
      throw new Error('Cannot access value of a failed Result');
    }
    return this._value as T;
  }

  get error(): E {
    if (this._isOk) {
      throw new Error('Cannot access error of a successful Result');
    }
    return this._error as E;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isOk) {
      return Result.ok<U, E>(fn(this._value as T));
    }
    return Result.fail<U, E>(this._error as E);
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isOk) {
      return fn(this._value as T);
    }
    return Result.fail<U, E>(this._error as E);
  }
}
