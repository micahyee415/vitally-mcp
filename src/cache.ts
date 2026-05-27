/**
 * Simple in-memory TTL cache with a max-size cap.
 */
export class TTLCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  private defaultTTL: number;
  private maxSize: number;

  constructor(defaultTTLMs: number, maxSize = 500) {
    this.defaultTTL = defaultTTLMs;
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (!this.store.has(key) && this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    for (const [key, entry] of this.store) {
      if (Date.now() > entry.expiresAt) this.store.delete(key);
    }
    return this.store.size;
  }
}
