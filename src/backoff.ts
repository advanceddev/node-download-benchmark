/**
 * Full-jitter exponential backoff delay in milliseconds.
 *
 * @param attempt - zero-based attempt index
 * @param minMs - base delay
 * @param maxMs - ceiling
 */
export function backoffMs(attempt: number, minMs: number, maxMs: number): number {
  if (attempt < 0) attempt = 0;
  if (minMs < 0) minMs = 0;
  if (maxMs < minMs) maxMs = minMs;

  const exp = Math.min(maxMs, minMs * 2 ** attempt);
  return Math.floor(Math.random() * (exp + 1));
}
