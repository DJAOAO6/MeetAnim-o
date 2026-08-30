import "server-only";
import { prisma } from "@/lib/db";
import { getPublicZones } from "@/lib/tours";
import { findMatchingZone } from "@/lib/booking-validation";
import { animalSpeciesList, type AnimalSpecies } from "@/data/species";
import type { StatsData, StatsFilters } from "@/data/stats";
import { Prisma } from "@/generated/prisma/client";

function startOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function resolveRange(filters: StatsFilters, now: Date): { from: Date; to: Date } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (filters.period) {
    case "previous":
      return { from: startOfMonthUtc(y, m - 1), to: startOfMonthUtc(y, m) };
    case "3months":
      return { from: startOfMonthUtc(y, m - 2), to: startOfMonthUtc(y, m + 1) };
    case "6months":
      return { from: startOfMonthUtc(y, m - 5), to: startOfMonthUtc(y, m + 1) };
    case "year":
      return { from: new Date(Date.UTC(y, 0, 1)), to: new Date(Date.UTC(y + 1, 0, 1)) };
    case "previousYear":
      return { from: new Date(Date.UTC(y - 1, 0, 1)), to: new Date(Date.UTC(y, 0, 1)) };
    case "custom": {
      const from = parseDateOnly(filters.startDate) ?? startOfMonthUtc(y, m);
      const endDay = parseDateOnly(filters.endDate) ?? startOfMonthUtc(y, m + 1);
      const to = new Date(endDay.getTime() + 86_400_000);
      return to > from ? { from, to } : { from, to: new Date(from.getTime() + 86_400_000) };
    }
    case "current":
    default:
      return { from: startOfMonthUtc(y, m), to: startOfMonthUtc(y, m + 1) };
  }
}

function previousEquivalentRange(from: Date, to: Date): { from: Date; to: Date } {
  const spanMs = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - spanMs), to: from };
}

// Table figée plutôt que Intl.DateTimeFormat({month:"short"}) : cette valeur
// est calculée côté serveur et embarquée dans le HTML initial — une
// éventuelle différence de version ICU entre Node et le navigateur (mois
// abrégés en fr-FR) provoquerait une vraie erreur d'hydratation (constatée
// en vérifiant : "janv." côté client contre un rendu serveur différent).
const shortMonthLabels = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

function normalizeSex(raw: string): "Mâles" | "Femelles" | "Non renseigné" {
  const normalized = raw.trim().toLocaleLowerCase("fr-FR");
  if (/^(m|male|mâle)$/.test(normalized)) return "Mâles";
  if (/^(f|female|femelle)$/.test(normalized)) return "Femelles";
  return "Non renseigné";
}

function ageBucket(birthDate: Date | null, now: Date): string {
  if (!birthDate) return "Non renseigné";
  const years = (now.getTime() - birthDate.getTime()) / (365.25 * 86_400_000);
  if (years < 2) return "0 à 2 ans";
  if (years < 6) return "3 à 5 ans";
  if (years < 10) return "6 à 9 ans";
  return "10 ans et plus";
}

function toPercent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/**
 * Remplace l'ancienne simulation (statsMockData multiplié par des facteurs
 * arbitraires, AUDIT_COMPLET.md P2-24) par de vraies requêtes. Basé sur
 * Appointment (status COMPLETED = consultation réellement tenue) plutôt que
 * Consultation, qui n'a aucun chemin d'écriture applicatif — voir la note
 * dans reminders-actions.ts, même constat.
 */
export async function getStatsData(filters: StatsFilters): Promise<StatsData> {
  const now = new Date();
  const { from, to } = resolveRange(filters, now);

  const service = filters.serviceId !== "all"
    ? await prisma.service.findUnique({ where: { id: filters.serviceId }, select: { name: true } })
    : null;
  const serviceName = service?.name;
  const species: AnimalSpecies | undefined = filters.species !== "all" ? filters.species : undefined;

  const baseWhere: Prisma.AppointmentWhereInput = {
    date: { gte: from, lt: to },
    ...(serviceName ? { serviceName } : {}),
    ...(species ? { animal: { species } } : {}),
  };
  // Aucune action de l'app ne fait jamais passer un rendez-vous au statut
  // COMPLETED (vérifié : absent de tout onClick/server action, seulement
  // lu/filtré) — le baser uniquement dessus laisserait cette page vide en
  // permanence. Un rendez-vous CONFIRMED dont la date est passée sans
  // annulation est considéré comme réellement tenu, en plus de COMPLETED
  // pour le jour où ce statut serait vraiment posé quelque part.
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const realizedOr: Prisma.AppointmentWhereInput[] = [{ status: "COMPLETED" }, { status: "CONFIRMED", date: { lt: todayUtc } }];
  const completedWhere: Prisma.AppointmentWhereInput = { ...baseWhere, OR: realizedOr };
  const prevRange = previousEquivalentRange(from, to);

  const [completedAppointments, cancelledCount, totalBookedCount, prevRevenueAgg] = await Promise.all([
    prisma.appointment.findMany({
      where: completedWhere,
      select: { date: true, mode: true, price: true, serviceName: true, animalId: true, clientId: true, postalCode: true, city: true },
    }),
    prisma.appointment.count({ where: { ...baseWhere, status: "CANCELLED" } }),
    prisma.appointment.count({ where: { ...baseWhere, status: { in: ["CONFIRMED", "COMPLETED", "CANCELLED"] } } }),
    prisma.appointment.aggregate({
      where: { ...baseWhere, date: { gte: prevRange.from, lt: prevRange.to }, OR: realizedOr },
      _sum: { price: true },
    }),
  ]);

  const revenue = Math.round(completedAppointments.reduce((sum, a) => sum + a.price, 0));
  const homeConsultations = completedAppointments.filter((a) => a.mode === "DOMICILE").length;
  const clientIds = [...new Set(completedAppointments.map((a) => a.clientId).filter((id): id is string => id != null))];

  const firstVisits = clientIds.length > 0
    ? await prisma.appointment.groupBy({ by: ["clientId"], where: { clientId: { in: clientIds }, OR: realizedOr }, _min: { date: true } })
    : [];
  const newClientsCount = firstVisits.filter((f) => f._min.date && f._min.date >= from).length;
  const returningClientsCount = clientIds.length - newClientsCount;

  const prevRevenue = prevRevenueAgg._sum.price ?? 0;
  const revenueVariationPct = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;

  // Courbe sur 8 mois calendaires se terminant par le mois contenant la fin
  // de la période sélectionnée, indépendamment de la durée de celle-ci.
  const anchor = new Date(to.getTime() - 1);
  const anchorMonthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const seriesFrom = new Date(Date.UTC(anchorMonthStart.getUTCFullYear(), anchorMonthStart.getUTCMonth() - 7, 1));
  const seriesTo = new Date(Date.UTC(anchorMonthStart.getUTCFullYear(), anchorMonthStart.getUTCMonth() + 1, 1));
  const seriesAppointments = await prisma.appointment.findMany({
    where: { date: { gte: seriesFrom, lt: seriesTo }, OR: realizedOr, ...(serviceName ? { serviceName } : {}), ...(species ? { animal: { species } } : {}) },
    select: { date: true, price: true },
  });
  const revenueSeries: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < 8; i++) {
    const monthStart = new Date(Date.UTC(seriesFrom.getUTCFullYear(), seriesFrom.getUTCMonth() + i, 1));
    const monthEnd = new Date(Date.UTC(seriesFrom.getUTCFullYear(), seriesFrom.getUTCMonth() + i + 1, 1));
    const value = seriesAppointments
      .filter((a) => a.date >= monthStart && a.date < monthEnd)
      .reduce((sum, a) => sum + a.price, 0);
    revenueSeries.push({ label: shortMonthLabels[monthStart.getUTCMonth()], value: Math.round(value) });
  }

  const modeGroups = new Map<string, { consultations: number; revenue: number }>([["Domicile", { consultations: 0, revenue: 0 }], ["Cabinet", { consultations: 0, revenue: 0 }]]);
  for (const a of completedAppointments) {
    const key = a.mode === "DOMICILE" ? "Domicile" : "Cabinet";
    const entry = modeGroups.get(key)!;
    entry.consultations += 1;
    entry.revenue += a.price;
  }
  const consultationModes = [...modeGroups.entries()].map(([label, v]) => ({
    label,
    consultations: v.consultations,
    revenue: Math.round(v.revenue),
    share: toPercent(v.consultations, completedAppointments.length),
  }));

  const serviceGroups = new Map<string, { consultations: number; revenue: number }>();
  for (const a of completedAppointments) {
    const entry = serviceGroups.get(a.serviceName) ?? { consultations: 0, revenue: 0 };
    entry.consultations += 1;
    entry.revenue += a.price;
    serviceGroups.set(a.serviceName, entry);
  }
  const services = [...serviceGroups.entries()]
    .map(([label, v]) => ({ label, consultations: v.consultations, revenue: Math.round(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6);

  const animalIds = [...new Set(completedAppointments.map((a) => a.animalId).filter((id): id is string => id != null))];
  const animals = animalIds.length > 0
    ? await prisma.animal.findMany({ where: { id: { in: animalIds } }, select: { species: true, breed: true, sex: true, birthDate: true } })
    : [];

  const speciesCounts = new Map<AnimalSpecies, number>();
  for (const animal of animals) {
    const key = animalSpeciesList.find((s) => s === animal.species);
    if (key) speciesCounts.set(key, (speciesCounts.get(key) ?? 0) + 1);
  }
  const speciesBreakdown = animalSpeciesList
    .filter((label) => (speciesCounts.get(label) ?? 0) > 0)
    .map((label) => ({ label, value: toPercent(speciesCounts.get(label) ?? 0, animals.length) }));

  const sexCounts = new Map<string, number>();
  for (const animal of animals) {
    const key = normalizeSex(animal.sex);
    sexCounts.set(key, (sexCounts.get(key) ?? 0) + 1);
  }
  const sex = [...sexCounts.entries()].map(([label, count]) => ({ label, value: toPercent(count, animals.length) }));

  const ageCounts = new Map<string, number>();
  for (const animal of animals) {
    const key = ageBucket(animal.birthDate, now);
    ageCounts.set(key, (ageCounts.get(key) ?? 0) + 1);
  }
  const ageOrder = ["0 à 2 ans", "3 à 5 ans", "6 à 9 ans", "10 ans et plus", "Non renseigné"];
  const ages = ageOrder.filter((label) => (ageCounts.get(label) ?? 0) > 0).map((label) => ({ label, value: toPercent(ageCounts.get(label) ?? 0, animals.length) }));

  const breeds: StatsData["breeds"] = {};
  for (const speciesLabel of animalSpeciesList) {
    const speciesAnimals = animals.filter((a) => a.species === speciesLabel);
    if (speciesAnimals.length === 0) continue;
    const breedCounts = new Map<string, number>();
    for (const a of speciesAnimals) {
      const breedName = a.breed.trim();
      if (!breedName) continue;
      breedCounts.set(breedName, (breedCounts.get(breedName) ?? 0) + 1);
    }
    breeds[speciesLabel] = {
      total: speciesAnimals.length,
      distinct: breedCounts.size,
      items: [...breedCounts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5),
    };
  }

  let averageDelayMonths: number | null = null;
  if (clientIds.length > 0) {
    const allCompletedForDelay = await prisma.appointment.findMany({
      where: { OR: realizedOr, ...(serviceName ? { serviceName } : {}), ...(species ? { animal: { species } } : {}) },
      select: { clientId: true, date: true },
      orderBy: { date: "asc" },
    });
    const byClient = new Map<string, Date[]>();
    for (const a of allCompletedForDelay) {
      if (!a.clientId) continue;
      const dates = byClient.get(a.clientId) ?? [];
      dates.push(a.date);
      byClient.set(a.clientId, dates);
    }
    const clientAverageGapsDays: number[] = [];
    for (const dates of byClient.values()) {
      if (dates.length < 2) continue;
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) gaps.push((dates[i].getTime() - dates[i - 1].getTime()) / 86_400_000);
      clientAverageGapsDays.push(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
    }
    if (clientAverageGapsDays.length > 0) {
      const averageDays = clientAverageGapsDays.reduce((sum, gap) => sum + gap, 0) / clientAverageGapsDays.length;
      averageDelayMonths = Math.round((averageDays / 30.44) * 10) / 10;
    }
  }

  const cancelled = cancelledCount;
  const totalBooked = totalBookedCount;

  const reminders = await prisma.reminder.findMany({ where: { updatedAt: { gte: from, lt: to }, status: { in: ["SENT", "BOOKED"] } }, select: { status: true } });
  const remindersSent = reminders.length;
  const remindersBookedAgain = reminders.filter((r) => r.status === "BOOKED").length;

  const publicZones = await getPublicZones();
  const zoneAgg = new Map<string, { revenue: number; consultations: number; clients: Set<string> }>();
  for (const a of completedAppointments) {
    const zone = findMatchingZone(publicZones, a.postalCode ?? undefined, a.city ?? undefined);
    if (!zone) continue;
    const entry = zoneAgg.get(zone.name) ?? { revenue: 0, consultations: 0, clients: new Set<string>() };
    entry.revenue += a.price;
    entry.consultations += 1;
    if (a.clientId) entry.clients.add(a.clientId);
    zoneAgg.set(zone.name, entry);
  }
  const zones = [...zoneAgg.entries()]
    .map(([label, v]) => ({ label, consultations: v.consultations, revenue: Math.round(v.revenue), clients: v.clients.size }))
    .sort((a, b) => b.revenue - a.revenue);

  const homeAppointments = completedAppointments.filter((a) => a.mode === "DOMICILE");
  const homeRevenue = Math.round(homeAppointments.reduce((sum, a) => sum + a.price, 0));

  return {
    overview: { revenue, revenueVariationPct, consultations: completedAppointments.length, newClients: newClientsCount, homeConsultations },
    revenueSeries,
    consultationModes,
    services,
    species: speciesBreakdown,
    sex,
    ages,
    breeds,
    loyalty: {
      newClients: newClientsCount,
      returningClients: returningClientsCount,
      returnRate: toPercent(returningClientsCount, clientIds.length),
      averageDelayMonths,
    },
    cancellations: { totalBooked, honored: completedAppointments.length, cancelled, cancellationRate: toPercent(cancelled, totalBooked) },
    reminders: { sent: remindersSent, bookedAgain: remindersBookedAgain, returnRate: toPercent(remindersBookedAgain, remindersSent) },
    zones,
    home: { consultations: homeAppointments.length, revenue: homeRevenue, averageRevenue: homeAppointments.length > 0 ? Math.round(homeRevenue / homeAppointments.length) : 0 },
  };
}

export async function getStatsServiceOptions(): Promise<Array<{ id: string; name: string }>> {
  return prisma.service.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
}
