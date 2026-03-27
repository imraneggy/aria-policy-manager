/**
 * session.ts — JWT session management with expiry detection.
 *
 * Parses the JWT payload (without validation — that's the server's job)
 * to detect imminent session expiry and show a warning banner.
 */

const TOKEN_KEY = "token";

interface JWTPayload {
  sub: string;
  exp: number;
}

/**
 * Decode a JWT payload without validation.
 * Returns null if the token is malformed.
 */
function decodePayload(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Returns seconds until the current JWT expires.
 * Returns -1 if no valid token exists.
 */
export function secondsUntilExpiry(): number {
  if (typeof window === "undefined") return -1;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return -1;

  const payload = decodePayload(token);
  if (!payload?.exp) return -1;

  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp - nowSec;
}

/**
 * Returns true if the token will expire within `thresholdSeconds`.
 */
export function isSessionExpiringSoon(thresholdSeconds = 300): boolean {
  const remaining = secondsUntilExpiry();
  return remaining > 0 && remaining <= thresholdSeconds;
}

/**
 * Returns true if the token has already expired.
 */
export function isSessionExpired(): boolean {
  const remaining = secondsUntilExpiry();
  return remaining !== -1 && remaining <= 0;
}
