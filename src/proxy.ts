import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decryptSession, sessionCookieName } from "@/lib/auth/session";

const protectedPrefix = "/dashboard";
const loginPath = "/login";

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(sessionCookieName)?.value;
  const session = await decryptSession(token);
  // Un cookie signé avant l'introduction des comptes multi-rôles ne contient
  // pas de userId : il doit être traité comme "non connecté", sinon la page
  // /login le juge valide (redirige vers /dashboard) alors que la
  // vérification stricte du layout le rejette (redirige vers /login) —
  // boucle de redirection infinie.
  const hasValidSession = Boolean(session?.userId);

  if (pathname.startsWith(protectedPrefix) && !hasValidSession) {
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (token) response.cookies.delete(sessionCookieName);
    return response;
  }

  if (pathname === loginPath && hasValidSession) {
    return NextResponse.redirect(new URL(protectedPrefix, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};

// /login/verification (étape 2FA) et les pages de réinitialisation de mot de
// passe restent hors de ce matcher : elles gèrent elles-mêmes leur propre
// redirection (session 2FA en attente, jeton de réinitialisation), un
// contrôle optimiste ici n'apporterait rien.
