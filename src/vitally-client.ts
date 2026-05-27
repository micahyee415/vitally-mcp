/**
 * Vitally REST API client.
 *
 * Auth: Basic Auth — API key as username, empty password, base64-encoded.
 * Base URL: https://your-subdomain.rest.vitally.io/resources
 * Rate limit: 1000 req/min (Vitally-enforced, sliding window)
 * Pagination: Cursor-based — { results: [...], next: "cursor" | null }
 */

import { logger } from "./logger.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export type QueryParams = Record<string, string | number | boolean | undefined>;

export interface PaginatedResponse<T> {
  results: T[];
  next: string | null;
}

export class VitallyApiError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "VitallyApiError";
    this.statusCode = statusCode;
  }
}

export class VitallyClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(apiKey: string, subdomain: string = "your-subdomain") {
    this.baseUrl = `https://${subdomain}.rest.vitally.io/resources`;
    // Vitally Basic Auth: API key as username, empty password
    this.authHeader = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
  }

  async request<T>(
    method: string,
    path: string,
    options: { params?: QueryParams; body?: unknown } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 200;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch(url.toString(), {
            method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        const remaining = res.headers.get("RateLimit-Remaining");
        if (remaining && parseInt(remaining, 10) < 50) {
          logger.warn("Vitally API rate limit running low", {
            remaining: parseInt(remaining, 10),
          });
        }

        if (RETRYABLE_STATUS_CODES.has(res.status) && attempt < MAX_RETRIES) {
          const retryAfter = res.headers.get("RateLimit-Reset");
          if (retryAfter) {
            const waitMs = parseInt(retryAfter, 10) * 1000;
            if (!isNaN(waitMs) && waitMs > 0 && waitMs <= 30000) {
              await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
          }
          lastError = new VitallyApiError(
            `Vitally API ${method} ${path} returned ${res.status}`,
            res.status
          );
          continue;
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          if (res.status === 401) {
            throw new VitallyApiError(
              "Vitally API authentication failed — check VITALLY_API_KEY",
              401
            );
          }
          throw new VitallyApiError(
            `Vitally API ${method} ${path} returned ${res.status}: ${text}`,
            res.status
          );
        }

        if (res.status === 204) {
          return {} as T;
        }

        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof VitallyApiError) throw err;
        if (attempt < MAX_RETRIES) {
          lastError = err instanceof Error ? err : new Error(String(err));
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error(`Vitally API ${method} ${path} failed after ${MAX_RETRIES} retries`);
  }

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  async del<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  async list<T>(
    path: string,
    params: QueryParams = {},
    maxResults: number = 500
  ): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;

    do {
      const queryParams: QueryParams = {
        ...params,
        limit: 100,
        ...(cursor ? { from: cursor } : {}),
      };

      const page = await this.get<PaginatedResponse<T>>(path, queryParams);
      results.push(...page.results);

      cursor = page.next ?? undefined;
    } while (cursor && results.length < maxResults);

    return results;
  }
}
