import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const sessionCookieName = "animeo-session";
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

const pendingTwoFactorCookieName = "animeo-2fa-pending";
const pendingTwoFactorDurationMs = 10 * 60 * 1000;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET n'est pas configurée.");
  return new TextEncoder().encode(secret);
}

type SessionPayload = {
  userId: string;
};

type PendingTwoFactorPayload = {
  userId: string;
};

async function signPayload<T extends Record<string, unknown>>(payload: T, durationMs: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + durationMs) / 1000))
    .sign(getSecretKey());
}

async function verifyPayload<T>(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<T>(token, getSecretKey(), { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const token = await signPayload<SessionPayload>({ userId }, sessionDurationMs);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(Date.now() + sessionDurationMs),
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getSessionPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  return verifyPayload<SessionPayload & { iat: number }>(token);
}

export async function createPendingTwoFactorSession(userId: string) {
  const token = await signPayload<PendingTwoFactorPayload>({ userId }, pendingTwoFactorDurationMs);
  const cookieStore = await cookies();
  cookieStore.set(pendingTwoFactorCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(Date.now() + pendingTwoFactorDurationMs),
    path: "/",
  });
}

export async function getPendingTwoFactorSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(pendingTwoFactorCookieName)?.value;
  return verifyPayload<PendingTwoFactorPayload>(token);
}

export async function deletePendingTwoFactorSession() {
  const cookieStore = await cookies();
  cookieStore.delete(pendingTwoFactorCookieName);
}

export { sessionCookieName };
export async function decryptSession(token: string | undefined) {
  return verifyPayload<SessionPayload>(token);
}
