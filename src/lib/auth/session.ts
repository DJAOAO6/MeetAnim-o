import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const sessionCookieName = "animeo-session";
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET n'est pas configurée.");
  return new TextEncoder().encode(secret);
}

type SessionPayload = {
  email: string;
  expiresAt: number;
};

async function encryptSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(payload.expiresAt / 1000))
    .sign(getSecretKey());
}

async function decryptSession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecretKey(), { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(email: string) {
  const expiresAt = Date.now() + sessionDurationMs;
  const token = await encryptSession({ email, expiresAt });
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(expiresAt),
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  return decryptSession(token);
}

export { sessionCookieName, decryptSession };
