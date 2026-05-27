/**
 * Google OAuth token verifier.
 *
 * Validates bearer tokens by calling Google's tokeninfo endpoint.
 * Confirms: valid token, verified email, @example.com domain, correct audience.
 */

import { createHash } from "crypto";

const TOKEN_CACHE_TTL_MS = 60 * 1000;
const tokenCache = new Map<string, { email: string; expiresAt: number }>();
const TOKEN_CACHE_MAX = 500;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Periodically prune expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (entry.expiresAt <= now) tokenCache.delete(key);
  }
}, 60_000);

export interface AuthResult {
  email: string;
}

export class AuthError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export async function verifyGoogleToken(
  token: string,
  allowedDomain: string = "example.com"
): Promise<AuthResult> {
  const cacheKey = hashToken(token);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { email: cached.email };
  }

  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(5000) }
  ).catch((err: unknown) => {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new AuthError("Google OAuth verification timed out. Try again.", 503);
    }
    throw new AuthError("Failed to verify Google OAuth token.", 502);
  });

  if (!res.ok) {
    throw new AuthError("Invalid or expired Google OAuth token.", 401);
  }

  const info = (await res.json()) as {
    email?: string;
    email_verified?: string;
    expires_in?: string;
    aud?: string;
  };

  if (!info.email || info.email_verified !== "true") {
    throw new AuthError("Google OAuth token has no verified email.", 401);
  }

  const emailDomain = info.email.split("@")[1]?.toLowerCase();
  if (emailDomain !== allowedDomain.toLowerCase()) {
    throw new AuthError(`Access restricted to @${allowedDomain} accounts.`, 403);
  }

  const expectedClientId = process.env.GOOGLE_CLIENT_ID;
  if (expectedClientId && info.aud !== expectedClientId) {
    throw new AuthError("OAuth token audience mismatch.", 401);
  }

  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const firstKey = tokenCache.keys().next().value;
    if (firstKey) tokenCache.delete(firstKey);
  }

  const ttl = info.expires_in
    ? Math.min(parseInt(info.expires_in, 10) * 1000, TOKEN_CACHE_TTL_MS)
    : TOKEN_CACHE_TTL_MS;

  tokenCache.set(cacheKey, { email: info.email, expiresAt: Date.now() + ttl });

  return { email: info.email };
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}
