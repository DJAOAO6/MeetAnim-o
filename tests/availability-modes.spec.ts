import { expect, test, type APIRequestContext } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Cabinet et domicile se ferment indépendamment (chantier C2, phase 3).
 * Fermer le cabinet le mardi depuis le tableau de bord : le domicile du mardi
 * reste réservable sur la page publique, le cabinet non — ni proposé, ni
 * accepté par le serveur si on le demande quand même.
 *
 * Les disponibilités du profil sont posées pour le test puis rétablies : la
 * base est celle du serveur local.
 */
const SLUG = "pauline-faucillon";
const WEEKDAYS = [["monday", "Lundi"], ["tuesday", "Mardi"], ["wednesday", "Mercredi"], ["thursday", "Jeudi"], ["friday", "Vendredi"], ["saturday", "Samedi"], ["sunday", "Dimanche"]];

let saved: { availability: unknown; cabinetAvailable: boolean; homeAvailable: boolean; practiceMode: string } | null = null;

/** Un mardi à plus d'une semaine : dans la fenêtre de réservation, loin du bord. */
function nextTuesdayId(): string {
  const date = new Date();
  date.setDate(date.getDate() + 8);
  while (date.getDay() !== 2) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Identifiants des actions serveur de la page publique, lus dans ses scripts. */
async function actionIds(request: APIRequestContext): Promise<Record<string, string>> {
  const html = await (await request.get(`/reserver/${SLUG}`)).text();
  const chunks = [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])];
  const ids: Record<string, string> = {};
  for (const chunk of chunks) {
    const js = await (await request.get(chunk)).text();
    for (const match of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) ids[match[2]] = match[1];
  }
  return ids;
}

async function callAction(request: APIRequestContext, id: string, args: unknown[]): Promise<string> {
  const response = await request.post(`/reserver/${SLUG}`, {
    headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
    data: JSON.stringify(args),
  });
  return response.text();
}

test.beforeAll(async () => {
  const [row] = await sql`SELECT availability, "cabinetAvailable", "homeAvailable", "practiceMode"::text AS "practiceMode" FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  saved = row as typeof saved;
  const days = WEEKDAYS.map(([id, label], index) => ({ id, label, enabled: index < 5, slots: index < 5 ? [{ id: `${id}-1`, start: "09:00", end: "18:00", cabinet: true, home: true }] : [] }));
  const next = { ...(row.availability as object), days, closures: [], vacations: [], slotInterval: 30, breakAfterAppointment: 0 };
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(next)}::jsonb, "cabinetAvailable" = true, "homeAvailable" = true, "practiceMode" = 'BOTH' WHERE slug = ${SLUG}`;
});

test.afterAll(async () => {
  if (!saved) return;
  await sql`UPDATE "BusinessProfile" SET availability = ${saved.availability === null ? null : JSON.stringify(saved.availability)}::jsonb,
    "cabinetAvailable" = ${saved.cabinetAvailable}, "homeAvailable" = ${saved.homeAvailable}, "practiceMode" = ${saved.practiceMode}::"PracticeMode" WHERE slug = ${SLUG}`;
});

test("fermer le cabinet le mardi laisse le domicile du mardi réservable", async ({ page, request }) => {
  await page.goto("/dashboard");
  await page.getByTestId("block-availabilityCabinet").getByRole("button", { name: /gérer les disponibilités/i }).click();
  await expect(page.getByRole("heading", { name: "Gérer les disponibilités" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Modifier les horaires du mardi" }).click();
  await page.getByRole("button", { name: "Fermer ce jour pour le cabinet" }).click();
  await expect(page.getByRole("button", { name: "Rouvrir ce jour pour le cabinet" })).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  // Des rendez-vous de démonstration peuvent tomber un mardi au cabinet : on
  // enregistre quand même, c'est le praticien qui décide.
  const force = page.getByRole("button", { name: "Enregistrer quand même" });
  await expect(force.or(page.getByText("Disponibilités enregistrées."))).toBeVisible({ timeout: 15000 });
  if (await force.isVisible()) await force.click();

  await expect.poll(async () => {
    const [row] = await sql`SELECT availability FROM "BusinessProfile" WHERE slug = ${SLUG}`;
    const tuesday = (row.availability as { days: Array<{ label: string; enabled: boolean; slots: Array<{ cabinet: boolean; home: boolean }> }> }).days.find((day) => day.label === "Mardi")!;
    return { enabled: tuesday.enabled, flags: tuesday.slots.map((slot) => [slot.cabinet, slot.home]) };
  }, { timeout: 15000 }).toEqual({ enabled: true, flags: [[false, true]] });

  // Page publique : le mardi est proposé à domicile, pas au cabinet.
  const tuesdayId = nextTuesdayId();
  const ids = await actionIds(request);
  expect(ids.getPublicScheduleAction, "action des créneaux publics introuvable").toBeTruthy();
  expect(ids.submitPublicBookingAction, "action de réservation introuvable").toBeTruthy();
  const home = await callAction(request, ids.getPublicScheduleAction, [SLUG, "home", 45]);
  const cabinet = await callAction(request, ids.getPublicScheduleAction, [SLUG, "cabinet", 45]);
  expect(home, "le mardi reste ouvert à domicile").toContain(`"${tuesdayId}"`);
  expect(cabinet, "le mardi n'est plus proposé au cabinet").not.toContain(`"${tuesdayId}"`);

  // Et une demande au cabinet ce mardi-là, envoyée quand même, est refusée.
  const [{ id: serviceId }] = await sql`SELECT s.id FROM "Service" s JOIN "BusinessProfile" p ON p."organizationId" = s."organizationId" WHERE p.slug = ${SLUG} AND s.active AND s."cabinetEnabled" ORDER BY s."createdAt" LIMIT 1`;
  const raw = await callAction(request, ids.submitPublicBookingAction, [SLUG, {
    serviceId, date: tuesdayId, start: "10:00", mode: "cabinet", location: "Cabinet", notes: "",
    clientName: "E2E-Modes Cabinet", animalName: "Rex", bookingStartedAt: Date.now() - 20_000,
    ownerFirstName: "Test", ownerLastName: "E2E-Modes", ownerPhone: "0600000000",
    ownerEmail: `modes-e2e-${Date.now()}@example.fr`, animalSpecies: "Chien",
  }]);
  expect(raw, "le serveur refuse le cabinet un mardi fermé au cabinet").toContain("n’est pas disponible");
  const [count] = await sql`SELECT count(*)::int AS n FROM "Appointment" WHERE "clientName" LIKE 'E2E-Modes%'`;
  expect(count.n).toBe(0);
});
