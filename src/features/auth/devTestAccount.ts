/** Dev-only test account — allowlisted via `npm run seed:test-user`. */
export const DEV_TEST_EMAIL = 'test@paristour.dev'

/** Map bare `test` to the dev email; otherwise normalize as email. */
export function normalizeAuthEmail(input: string): string {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === 'test') return DEV_TEST_EMAIL
  return trimmed
}
