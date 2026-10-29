// Reintento exponencial con tope: 30 s, 1 min, 2 min ... hasta 30 min.
export const MAX_ATTEMPTS = 8;
const BASE_MS = 30_000;
const CAP_MS = 30 * 60_000;

export function nextAttemptDelay(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 1) return BASE_MS;
  return Math.min(CAP_MS, BASE_MS * 2 ** (attempts - 1));
}

export function nextAttemptAt(attempts: number, now: Date): string {
  return new Date(now.getTime() + nextAttemptDelay(attempts)).toISOString();
}

// Después de MAX_ATTEMPTS la acción queda en 'failed' hasta un reintento manual.
export function shouldGiveUp(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}
