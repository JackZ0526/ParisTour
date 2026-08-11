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

export type LlmErrorCode =
  | 'unknown'
  | 'missing_key'
  | 'unconfigured'
  | 'empty'
  | 'empty_body'
  | 'invalid_json'
  | 'http_error'
  | 'aborted'
  | 'unauthorized'
  | 'rate_limited'
  | 'upstream'
