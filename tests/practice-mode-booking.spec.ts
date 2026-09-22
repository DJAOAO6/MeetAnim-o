import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Mode d'exercice, vu par le client qui réserve.
 *
 * Tous les professionnels n'ont pas de cabinet, et certains n'en auront
 * jamais. La page de réservation ne doit alors ni proposer le cabinet, ni
 * l'annoncer « fermé » — il n'existe pas —, ni laisser fuiter l'adresse de
 * départ, qui est chez eux.
 *
 * Et quand il n'y a qu'une façon de consulter, on ne pose pas la question :
 * le mode est posé d'office.
 */
const SLUG = "pauline-faucillon";

async function setMode(mode: "HOME_ONLY" | "OFFICE_ONLY" | "BOTH") {
  await sql`UPDATE "BusinessProfile" SET "practiceMode" = ${mode}::"PracticeMode"`;
}

async function openConsultationStep(page: Page) {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${SLUG}`, { waitUntil: "networkidle" });
  await expect(page.getByText("Quelle consultation souhaitez-vous")).toBeVisible();
  await page.locator("button[aria-pressed]").first().click();
}

/** Une date acceptée par la fenêtre de réservation (demain → 90 jours). */
function dateWithinBookingWindow(): string {
  return new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const cabinetCard = (page: Page) => page.getByRole("button", { name: "Consultation au cabinet", exact: true });
const homeCard = (page: Page) => page.getByRole("button", { name: "Consultation à domicile", exact: true });

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await setMode("BOTH");
});

test("à domicile uniquement : ni carte cabinet, ni adresse, ni question inutile", async ({ page }) => {
  await setMode("HOME_ONLY");
  await openConsultationStep(page);

  await expect(cabinetCard(page)).toHaveCount(0);
  await expect(homeCard(page)).toHaveCount(0);
  // Rien à choisir : la question « Où ? » ne se pose pas.
  await expect(page.getByText("Où ?", { exact: true })).toHaveCount(0);

  // Le cabinet n'est pas annoncé fermé : il n'existe pas.
  await expect(page.getByText(/cabinet fermé/i)).toHaveCount(0);
  await expect(page.getByText("24 rue des Carmes")).toHaveCount(0);

  // Le mode est posé d'office : l'étape suivante s'ouvre sans autre choix.
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
});

test("au cabinet uniquement : le domicile disparaît de la même façon", async ({ page }) => {
  await setMode("OFFICE_ONLY");
  await openConsultationStep(page);

  await expect(homeCard(page)).toHaveCount(0);
  await expect(page.getByText(/domicile fermé/i)).toHaveCount(0);
  await expect(page.getByText("Où ?", { exact: true })).toHaveCount(0);

  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
});

test("les deux : le choix revient, avec l'adresse du cabinet", async ({ page }) => {
  await setMode("BOTH");
  await openConsultationStep(page);

  await expect(page.getByText("Où ?", { exact: true })).toBeVisible();
  await expect(cabinetCard(page)).toBeVisible();
  await expect(homeCard(page)).toBeVisible();
  await expect(cabinetCard(page)).toContainText("24 rue des Carmes");
});

test("une demande au cabinet est refusée par le serveur quand il n'y en a pas", async ({ request }) => {
  await setMode("HOME_ONLY");
  // La page publique ne propose plus le cabinet ; une demande fabriquée à la
  // main, elle, arrive quand même — et doit être refusée côté serveur.
  const page = await request.get(`/reserver/${SLUG}`);
  const html = await page.text();
  const chunks = [...new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])];
  let actionId = "";
  let serviceId = "";
  for (const chunk of chunks) {
    const js = await (await request.get(chunk)).text();
    const match = /"([0-9a-f]{40,})":\{"name":"submitPublicBookingAction"\}/.exec(js);
    if (match) actionId = match[1];
  }
  expect(actionId, "identifiant de l'action de réservation introuvable").toBeTruthy();
  [{ id: serviceId }] = await sql`SELECT id FROM "Service" WHERE active = true AND "cabinetEnabled" = true ORDER BY "createdAt" LIMIT 1`;

  const response = await request.post(`/reserver/${SLUG}`, {
    headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
    // Le lien du cabinet est le premier argument de l'action : c'est lui qui
    // désigne où la demande atterrit.
    data: JSON.stringify([SLUG, {
      serviceId, date: dateWithinBookingWindow(), start: "10:00", mode: "cabinet", location: "Cabinet", notes: "",
      clientName: "E2E-Mode Exercice", animalName: "Rex", bookingStartedAt: Date.now() - 20_000,
      ownerFirstName: "Test", ownerLastName: "E2E-Mode", ownerPhone: "0600000000",
      ownerEmail: `mode-e2e-${Date.now()}@example.fr`, animalSpecies: "Chien",
    }]),
  });
  const raw = await response.text();
  expect(raw, "le serveur doit refuser un mode qui n'est pas pratiqué").toContain("n’est pas proposé");

  const [count] = await sql`SELECT count(*)::int AS n FROM "Appointment" WHERE "clientName" LIKE 'E2E-Mode%'`;
  expect(count.n, "aucun rendez-vous ne doit être créé").toBe(0);
});
