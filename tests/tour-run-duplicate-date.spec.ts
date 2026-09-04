import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Audit de conformité, constat n°8 : createTourRunAction ne vérifiait pas
 * l'existence préalable d'une TourRun pour (userId, date) — une seconde
 * création manuelle sur une date déjà occupée passait silencieusement,
 * cassant l'invariant "un seul objet visible par date".
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testDateId = "2027-05-11"; // mardi, sans lien avec une vraie tournée
const testOwnerLastName = "E2EDuplicateDateTest";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

async function seedExistingTourRun(): Promise<string> {
  const sql = neon(process.env.DATABASE_URL!);
  const tourRunId = fakeCuid();
  await sql`
    INSERT INTO "TourRun" (id, "userId", date, name, "departureTime", "startType", "startAddress", "startLatitude", "startLongitude", "endType", "endAddress", "endLatitude", "endLongitude", "createdAt", "updatedAt")
    SELECT ${tourRunId}, u.id, ${testDateId}::date, ${"Tournée déjà là " + testOwnerLastName}, '09:00', 'CABINET', 'Cabinet', 49.44, 1.09, 'CABINET', 'Cabinet', 49.44, 1.09, now(), now()
    FROM "User" u WHERE u.email = ${testEmail}
  `;
  return tourRunId;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
}

async function clearLoginRateLimit() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Création d'une journée — pas de doublon sur une même date", () => {
  test.beforeEach(async () => {
    await clearLoginRateLimit();
    await cleanup();
  });

  test.afterEach(async () => {
    await cleanup();
  });

  test("créer une journée sur une date déjà occupée est refusé, aucune deuxième TourRun n'est créée", async ({ page }) => {
    await seedExistingTourRun();
    await login(page);

    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: "Nouvelle journée" }).click();
    await page.locator("#new-tour-day-date").fill(testDateId);
    await page.locator("#new-tour-day-name").fill(`Tournée en trop ${testOwnerLastName}`);
    await page.getByRole("button", { name: "Créer la journée" }).click();

    await expect(page.getByText("Une journée existe déjà pour cette date.")).toBeVisible({ timeout: 10000 });

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT id, name FROM "TourRun" WHERE date = ${testDateId}::date AND name LIKE ${"%" + testOwnerLastName + "%"}`;
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe(`Tournée déjà là ${testOwnerLastName}`);
  });
});
