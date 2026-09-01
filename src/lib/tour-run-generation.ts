import "server-only";
import { prisma } from "@/lib/db";
import { tourRunsOnDate, weekdayLabelFor } from "@/lib/tour-schedule";
import { parseDateIdToLocalNoon, toLocalDateId } from "@/lib/booking-validation";
import type { Prisma } from "@/generated/prisma/client";
import type { Tour } from "@/data/tours";

// Fenêtre de pré-génération — voir PROMPT-TOURNEES-UNIFICATION.md, phase 1.2.
const GENERATION_WINDOW_DAYS = 21;

// Tour.startType (CABINET | CUSTOM) et TourRun.startType (TourEndpointType,
// un ensemble plus large) sont deux enums Prisma distincts qui partagent ces
// deux valeurs — mappage explicite plutôt qu'une assignation directe.
const startTypeToEndpointType = { CABINET: "CABINET", CUSTOM: "CUSTOM" } as const;

function upcomingDateIds(count: number): string[] {
  const today = new Date();
  const ids: string[] = [];
  for (let offset = 0; offset < count; offset++) {
    const candidate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    ids.push(toLocalDateId(candidate));
  }
  return ids;
}

export type GenerateTourRunsResult = { created: number };

/**
 * Génère les TourRun manquantes des GENERATION_WINDOW_DAYS prochains jours à
 * partir des motifs (Tour) actifs — jamais rétroactif (la boucle part
 * d'aujourd'hui inclus). Une TourRun par motif × occurrence × compte ADMIN
 * actif (choix explicite de l'utilisatrice : plusieurs comptes ADMIN gèrent
 * la pratique, chacun doit voir ses propres journées générées — voir
 * TourRun.userId).
 *
 * Idempotent par construction : l'index unique (templateId, date, userId)
 * fait qu'un doublon est simplement ignoré (skipDuplicates), jamais recréé
 * ni modifié — rejouer cette fonction ne touche jamais une journée déjà
 * générée que l'utilisatrice a pu retoucher depuis. Un seul aller-retour
 * base de données (createMany), pas une écriture par occurrence.
 */
export async function generateUpcomingTourRuns(): Promise<GenerateTourRunsResult> {
  const [tours, adminUsers] = await Promise.all([
    prisma.tour.findMany({ where: { status: "ACTIVE" } }),
    prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } }),
  ]);
  if (tours.length === 0 || adminUsers.length === 0) return { created: 0 };

  const dateIds = upcomingDateIds(GENERATION_WINDOW_DAYS);
  const rows: Prisma.TourRunCreateManyInput[] = [];

  for (const tour of tours) {
    const schedule: Pick<Tour, "day" | "dateId" | "recurrence"> = { day: tour.day, dateId: tour.dateId ?? undefined, recurrence: tour.recurrence as Tour["recurrence"] };
    for (const dateId of dateIds) {
      const weekday = weekdayLabelFor(parseDateIdToLocalNoon(dateId));
      if (!tourRunsOnDate(schedule, dateId, weekday)) continue;
      const date = new Date(`${dateId}T00:00:00.000Z`);

      for (const user of adminUsers) {
        rows.push({
          userId: user.id,
          templateId: tour.id,
          name: tour.name,
          date,
          departureTime: tour.startTime,
          // Tour ne modélise qu'un seul point ("départ") — l'arrivée générée
          // reprend le même point par défaut (aller-retour), modifiable
          // ensuite depuis l'écran de journée comme n'importe quelle TourRun.
          startType: startTypeToEndpointType[tour.startType],
          startAddress: tour.startType === "CUSTOM" ? tour.startAddress : null,
          startLatitude: tour.startType === "CUSTOM" ? tour.startLatitude : null,
          startLongitude: tour.startType === "CUSTOM" ? tour.startLongitude : null,
          endType: "SAME_AS_START",
        });
      }
    }
  }

  if (rows.length === 0) return { created: 0 };
  const result = await prisma.tourRun.createMany({ data: rows, skipDuplicates: true });
  return { created: result.count };
}
