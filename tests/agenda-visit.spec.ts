import { expect, test, type Page } from "./helpers/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Visites multi-animaux dans l'agenda (chantier C6, phase 3) : reliées
 * (« 1/2 », « 2/2 »), déplacées ensemble par défaut ou une seule (qui quitte
 * la visite), annulées ensemble.
 *
 * Rendez-vous de test, et pause entre rendez-vous mise à zéro le temps du
 * test : rétablis à la fin.
 */
const MARKER = "E2E Visite Agenda";
const GROUP = "e2e-agenda-visit";

/** Un mercredi dans trois semaines environ, jour ouvert de la démonstration. */
function wednesdayAhead(): string {
  const day = new Date(Date.now() + 21 * 24 * 3600_000);
  day.setUTCDate(day.getUTCDate() + ((3 - day.getUTCDay() + 7) % 7));
  return day.toISOString().slice(0, 10);
}
const DAY = wednesdayAhead();
let savedAvailability: unknown = null;

async function insertVisit(group: string) {
  await sql`DELETE FROM "Appointment" WHERE "clientName" = ${MARKER}`;
  for (const [index, [animal, start]] of [["Pomme", "10:00"], ["Poire", "11:00"]].entries()) {
    await sql`INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "visitGroupId", "updatedAt")
      VALUES (${`${group}-${index}`}, ${`${DAY}T00:00:00.000Z`}, ${start}, 60, ${MARKER}, ${animal}, 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', ${group}, now())`;
  }
}

async function rows() {
  return sql`SELECT "animalName", start, status::text AS status, "visitGroupId" FROM "Appointment" WHERE "clientName" = ${MARKER} ORDER BY "animalName"`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const [profile] = await sql`SELECT availability FROM "BusinessProfile" WHERE "organizationId" = 'org-1002-pattes'`;
  savedAvailability = profile.availability;
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify({ ...(profile.availability as object), breakAfterAppointment: 0 })}::jsonb WHERE "organizationId" = 'org-1002-pattes'`;
});

test.afterAll(async () => {
  await sql`DELETE FROM "Appointment" WHERE "clientName" = ${MARKER}`;
  if (savedAvailability) await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(savedAvailability)}::jsonb WHERE "organizationId" = 'org-1002-pattes'`;
});

async function openWeek(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/dashboard/agenda?date=${DAY}`, { waitUntil: "networkidle" });
  const pomme = page.locator("[data-testid='agenda-event'][aria-label*='Pomme']");
  const poire = page.locator("[data-testid='agenda-event'][aria-label*='Poire']");
  // Les deux cartes au milieu de l'écran, avec de la marge en dessous pour glisser.
  await pomme.evaluate((element) => element.scrollIntoView({ block: "center" }));
  return { pomme, poire };
}

/** Glisse une carte de `deltaY` pixels et la lâche. */
async function drag(page: Page, card: ReturnType<Page["locator"]>, deltaY: number) {
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY / 2, { steps: 8 });
  await page.mouse.move(x, y + deltaY, { steps: 8 });
  await page.mouse.up();
}

test("une visite s'affiche reliée, et la fiche nomme l'autre animal", async ({ page }) => {
  await insertVisit(GROUP);
  const { pomme, poire } = await openWeek(page);
  await expect(pomme).toHaveAttribute("data-visit", "1/2");
  await expect(poire).toHaveAttribute("data-visit", "2/2");
  await expect(pomme).toHaveAttribute("aria-label", /visite 1 sur 2/);
  await pomme.click();
  await expect(page.getByRole("dialog", { name: "Rendez-vous de Pomme" })).toContainText("Visite 1/2 · avec Poire (11:00)");
});

test("glisser un rendez-vous d'une visite déplace toute la visite, contiguë", async ({ page }) => {
  await insertVisit(GROUP);
  const { pomme, poire } = await openWeek(page);
  // Une heure plus bas : l'écart entre les deux cartes.
  const hour = (await poire.boundingBox())!.y - (await pomme.boundingBox())!.y;
  await drag(page, pomme, hour);
  const choice = page.getByRole("dialog", { name: "Déplacer la visite ?" });
  await expect(choice).toBeVisible();
  await choice.getByRole("button", { name: "Déplacer toute la visite" }).click();
  await expect(page.getByText(/Visite déplacée au .* à 11:00 \(Pomme, Poire\)/)).toBeVisible({ timeout: 15000 });
  const after = await rows();
  expect(after.map((row) => [row.animalName, row.start])).toEqual([["Poire", "12:00"], ["Pomme", "11:00"]]);
  expect(after.every((row) => row.visitGroupId === GROUP), "toujours une seule visite").toBe(true);
});

test("« Seulement ce rendez-vous » le sort de la visite", async ({ page }) => {
  await insertVisit(GROUP);
  const { pomme, poire } = await openWeek(page);
  const hour = (await poire.boundingBox())!.y - (await pomme.boundingBox())!.y;
  await drag(page, poire, hour * 2);
  await page.getByRole("dialog", { name: "Déplacer la visite ?" }).getByRole("button", { name: "Seulement ce rendez-vous" }).click();
  await expect(page.getByText(/Rendez-vous de Poire déplacé au .* à 13:00, hors de la visite\./)).toBeVisible({ timeout: 15000 });
  const after = await rows();
  expect(after.map((row) => [row.animalName, row.start, row.visitGroupId])).toEqual([["Poire", "13:00", null], ["Pomme", "10:00", null]]);
});

test("annuler depuis la fiche propose toute la visite", async ({ page }) => {
  await insertVisit(GROUP);
  const { pomme } = await openWeek(page);
  await pomme.click();
  await page.getByRole("dialog", { name: "Rendez-vous de Pomme" }).getByRole("button", { name: /Annuler le rendez-vous/ }).click();
  const choice = page.getByRole("dialog", { name: "Annuler la visite ?" });
  await expect(choice).toContainText("Pomme et Poire");
  await choice.getByRole("button", { name: "Annuler toute la visite" }).click();
  await expect(page.getByText("Visite annulée (Pomme et Poire).")).toBeVisible({ timeout: 15000 });
  expect((await rows()).map((row) => row.status)).toEqual(["CANCELLED", "CANCELLED"]);
});
