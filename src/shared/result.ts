export type Ok<T> = { ok: true; value: T }
export type Err<E = AppError> = { ok: false; error: E }
export type Result<T, E = AppError> = Ok<T> | Err<E>

export interface AppError {
  code: string
  message: string
  recoverable?: boolean
  details?: unknown
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

export function err<E = AppError>(error: E): Err<E> {
  return { ok: false, error }
}

export function appError(code: string, message: string, recoverable = true, details?: unknown): AppError {
  return { code, message, recoverable, details }
}
