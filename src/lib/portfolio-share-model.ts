import { createHash, randomBytes } from "node:crypto";

export const SHARE_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_SHARES = 5;
export const MAX_SHARE_CREATIONS_PER_HOUR = 10;
export const MAX_PUBLIC_SHARE_READS_PER_MINUTE = 60;

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export const createShareToken = () => randomBytes(32).toString("base64url");

export const isValidShareToken = (value: unknown): value is string =>
  typeof value === "string" && tokenPattern.test(value);

export const isShareActive = (
  expiresAt: Date,
  revokedAt: Date | null,
  now: Date,
) => revokedAt === null && expiresAt.getTime() > now.getTime();

export function hashShareToken(token: string) {
  if (!isValidShareToken(token)) return null;
  return createHash("sha256").update(token).digest();
}
