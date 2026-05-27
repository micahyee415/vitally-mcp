/**
 * Per-key fixed-window rate limiter.
 * Default: 120 requests per minute per user.
 */

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max = 120, windowMs = 60_000) {
    this.max = max;
    this.windowMs = windowMs;
  }

  check(key: string): boolean {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || now >= existing.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (existing.count >= this.max) {
      return false;
    }

    existing.count++;
    return true;
  }

  retryAfter(key: string): number {
    const existing = this.windows.get(key);
    if (!existing) return 0;
    return Math.ceil((existing.resetAt - Date.now()) / 1000);
  }
}
