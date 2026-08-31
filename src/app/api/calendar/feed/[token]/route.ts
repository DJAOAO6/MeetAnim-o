import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildIcsCalendar, type IcsEventInput } from "@/lib/booking-validation";

/**
 * Flux ICS privé, abonnement Apple Calendar / assimilés (étape 17-19 du
 * chantier calendrier) : aucune authentification par cookie, seule
 * l'inconnaissabilité du jeton protège l'accès — c'est le fonctionnement
 * attendu d'un flux calendrier (les applications clientes n'envoient pas de
 * cookie). Jamais l'id utilisateur dans l'URL : uniquement User.icsFeedToken,
 * régénérable indépendamment (calendar-actions.ts).
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await context.params;
  const token = rawToken.endsWith(".ics") ? rawToken.slice(0, -4) : rawToken;

  const user = await prisma.user.findUnique({ where: { icsFeedToken: token }, select: { id: true } });
  if (!user) return new NextResponse("Not found", { status: 404 });

  // Cabinet unique dans cette version (voir docs/GOOGLE-CALENDAR-SETUP.md) :
  // le flux reflète le même agenda partagé que le tableau de bord interne,
  // pas seulement les rendez-vous "de" cet utilisateur. Jamais les rendez-
  // vous annulés (étape 18 : "ne pas montrer les RDV supprimés").
  const appointments = await prisma.appointment.findMany({
    where: { status: { not: "CANCELLED" } },
    orderBy: { date: "asc" },
    select: { id: true, date: true, start: true, duration: true, animalName: true, clientName: true, serviceName: true, location: true, mode: true, status: true },
  });

  const events: IcsEventInput[] = appointments.map((appointment) => {
    const summary = appointment.status === "PENDING"
      ? `(à confirmer) ${appointment.serviceName} — ${appointment.animalName}`
      : `${appointment.serviceName} — ${appointment.animalName}`;
    return {
      uid: `${appointment.id}@animeo.app`,
      dateId: appointment.date.toISOString().slice(0, 10),
      start: appointment.start,
      durationMinutes: appointment.duration,
      summary,
      description: `Client : ${appointment.clientName}\nAnimal : ${appointment.animalName}\nMode : ${appointment.mode === "DOMICILE" ? "À domicile" : "Au cabinet"}\n\nGénéré depuis Animéo.`,
      location: appointment.mode === "DOMICILE" ? appointment.location : "Cabinet",
    };
  });

  const content = buildIcsCalendar(events, "Animéo — Agenda");

  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="animeo-agenda.ics"',
      // Court : un flux abonné doit refléter les modifications récentes
      // (étape 18), pas rester figé côté serveur/CDN.
      "Cache-Control": "private, max-age=300",
    },
  });
}
