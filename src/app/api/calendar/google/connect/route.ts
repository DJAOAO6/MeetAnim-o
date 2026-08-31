import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { googleCalendarProvider } from "@/lib/calendar/google-calendar-provider";
import { createOAuthState } from "@/lib/calendar/google-oauth-state";

/**
 * Lance le consentement OAuth Google (étape 4 du chantier calendrier).
 * requireUser() redirige déjà vers /login si personne n'est connecté —
 * c'est la session locale, jamais l'e-mail Google, qui détermine quel
 * professionnel connecte son agenda (voir google-oauth-state.ts).
 */
export async function GET() {
  const user = await requireUser();
  const nonce = await createOAuthState(user.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const authorizationUrl = googleCalendarProvider.getAuthorizationUrl(nonce, `${appUrl}/api/calendar/google/callback`);
  return NextResponse.redirect(authorizationUrl);
}
