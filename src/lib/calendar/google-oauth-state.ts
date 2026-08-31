import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Protection CSRF du flux OAuth Google (étape 4 du chantier calendrier) :
 * un jeton signé (même bibliothèque que la session, jose/HS256 — voir
 * src/lib/auth/session.ts), déposé en cookie httpOnly au moment de la
 * redirection vers Google, et vérifié au retour. Le `state` transmis à
 * Google n'est qu'un nonce aléatoire ; l'identité de l'utilisateur qui a
 * initié la connexion reste uniquement dans le cookie signé, jamais dans
 * l'URL — un attaquant qui devine/vole seulement le nonce ne peut pas
 * associer une connexion Google à un autre compte local.
 */

const stateCookieName = "animeo-google-oauth-state";
const stateDurationMs = 10 * 60 * 1000;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET n'est pas configurée.");
  return new TextEncoder().encode(secret);
}

type StatePayload = { userId: string; nonce: string };

export async function createOAuthState(userId: string): Promise<string> {
  const nonce = randomBytes(24).toString("base64url");
  const token = await new SignJWT({ userId, nonce } satisfies StatePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + stateDurationMs) / 1000))
    .sign(getSecretKey());

  const cookieStore = await cookies();
  cookieStore.set(stateCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(Date.now() + stateDurationMs),
    path: "/",
  });
  return nonce;
}

/** Consomme le cookie d'état (toujours supprimé, même en cas d'échec) — jamais rejouable. */
export async function verifyAndConsumeOAuthState(currentUserId: string, receivedNonce: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(stateCookieName)?.value;
  cookieStore.delete(stateCookieName);
  if (!token) return false;

  try {
    const { payload } = await jwtVerify<StatePayload>(token, getSecretKey(), { algorithms: ["HS256"] });
    return payload.userId === currentUserId && payload.nonce === receivedNonce;
  } catch {
    return false;
  }
}
