/**
 * LLM request errors surfaced to UI. `code` is a stable string the UI uses
 * to pick a recovery path (silent retry, surface to user, etc).
 */
export class LlmRequestError extends Error {
  code: LlmErrorCode
  status?: number

  constructor(message: string, code: LlmErrorCode = 'unknown', status?: number) {
    super(message)
    this.name = 'LlmRequestError'
    this.code = code
    this.status = status
  }
}

/**
 * Stable error codes surfaced to UI recovery paths.
 *
 * During refactors we sometimes forward upstream `error.code` / `error.type`
 * verbatim; keeping this as `string` avoids compile failures on transient
 * upstream shapes. UI callers should still treat known values as preferred.
 */
export type LlmErrorCode = string
