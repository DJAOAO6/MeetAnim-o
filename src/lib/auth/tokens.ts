import "server-only";
import { randomBytes, randomInt, createHash } from "node:crypto";

export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function generateNumericCode(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits - 1;
  return String(randomInt(min, max + 1));
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
