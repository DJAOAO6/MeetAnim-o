import "server-only";
import bcrypt from "bcryptjs";

export async function verifyCredentials(email: string, password: string) {
  const expectedEmail = process.env.AUTH_EMAIL;
  const expectedHashBase64 = process.env.AUTH_PASSWORD_HASH_BASE64;
  if (!expectedEmail || !expectedHashBase64) throw new Error("Identifiants professionnels non configurés (AUTH_EMAIL / AUTH_PASSWORD_HASH_BASE64).");

  if (email.trim().toLowerCase() !== expectedEmail.toLowerCase()) return false;

  const expectedHash = Buffer.from(expectedHashBase64, "base64").toString("utf8");
  return bcrypt.compare(password, expectedHash);
}
