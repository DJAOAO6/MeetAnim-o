import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";
import { loginAsSecretary } from "./helpers/secretary-login";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const PRACTITIONER = "praticien-test@pf-osteo-animale.fr";

/**
 * Affichage de l'agenda (intervalle, densité, heures, week-end) : appliqué
 * aussitôt, enregistré pour le compte sur demande, jamais pour un autre.
 */
async function resetPreferences() {
  await sql`DELETE FROM "AgendaPreferences" WHERE "userId" IN (SELECT id FROM "User" WHERE email IN (${PRACTITIONER}, 'secretariat-test@pf-osteo-animale.fr'))`;
}

test.describe.configure({ mode: "serial" });
test.beforeAll(resetPreferences);
test.afterAll(resetPreferences);

test("les réglages s'appliquent aussitôt et ne s'enregistrent que sur demande", async ({ page }) => {
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  const dayHeaders = page.getByRole("region", { name: "Planning de la semaine" }).locator("p.uppercase");
  await expect(dayHeaders).toHaveCount(7);

  await page.getByRole("button", { name: "Affichage" }).click();
  await expect(page.getByRole("button", { name: "30 min" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "1 h 30" }).click();
  await page.getByRole("switch", { name: "Afficher le dimanche" }).click();
  await expect(dayHeaders, "dimanche masqué aussitôt").toHaveCount(6);
  // Intervalle d'1 h 30 : une étiquette par ligne (08:00, 09:30…).
  await expect(page.getByTestId("agenda-time-column").getByText("09:30", { exact: true })).toBeVisible();

  // Pas encore enregistré.
  const [before] = await sql`SELECT count(*)::int AS n FROM "AgendaPreferences" p JOIN "User" u ON u.id = p."userId" WHERE u.email = ${PRACTITIONER}`;
  expect(before.n).toBe(0);

  await page.getByRole("button", { name: "Définir comme affichage par défaut" }).click();
  await expect(page.getByText("Affichage enregistré")).toBeVisible();
  const [saved] = await sql`SELECT p."slotMinutes", p."showSunday" FROM "AgendaPreferences" p JOIN "User" u ON u.id = p."userId" WHERE u.email = ${PRACTITIONER}`;
  expect([saved.slotMinutes, saved.showSunday]).toEqual([90, false]);

  // Retrouvé à la prochaine ouverture.
  await page.reload({ waitUntil: "networkidle" });
  await expect(dayHeaders).toHaveCount(6);
});

test("l'affichage enregistré par un compte ne touche pas celui d'un autre", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    const page = await context.newPage();
    await loginAsSecretary(page);
    await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
    await expect(page.getByRole("region", { name: "Planning de la semaine" }).locator("p.uppercase"), "7 jours : l'affichage par défaut").toHaveCount(7);
    await page.getByRole("button", { name: "Affichage" }).click();
    await expect(page.getByRole("button", { name: "30 min" })).toHaveAttribute("aria-pressed", "true");
  } finally {
    await context.close();
  }
});
