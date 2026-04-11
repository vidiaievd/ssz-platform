type OkResult<T> = { ok: true; value: T };
type ErrResult<E> = { ok: false; error: E };

export type Result<T, E> = OkResult<T> | ErrResult<E>;

export const Result = {
  ok<T>(value: T): OkResult<T> {
    return { ok: true, value };
  },

  err<E>(error: E): ErrResult<E> {
    return { ok: false, error };
  },
};
