import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Bug B4 : un rendez-vous dont la durée ne figure pas dans la liste (50 min
 * avant la liste commune, 40 min aujourd'hui) s'affichait « 30 minutes » à
 * la modification, et l'enregistrer changeait sa durée sans prévenir.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE id LIKE 'tmp-duration-%'`;
}

async function login(page: Page) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Durée d'un rendez-vous à la modification", () => {
  test.beforeAll(async () => {
    await cleanup();
    const sql = neon(process.env.DATABASE_URL!);
    for (const [id, name, start, duration] of [["a", "CinquanteE2E", "10:00", 50], ["b", "QuaranteE2E", "14:00", 40]] as const) {
      await sql`
        INSERT INTO "Appointment" (id, "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
        VALUES (${`tmp-duration-${id}`}, 'Test Durée', ${name}, 'Séance E2E', ${today}::date, ${start}, ${duration}, 'CABINET', 'Cabinet', 50, 'CONFIRMED', '', now(), now())
      `;
    }
  });
  test.afterAll(cleanup);

  test("la durée réelle est toujours proposée, 50 min fait partie de la liste", async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });

    for (const [name, expected] of [["CinquanteE2E", "50"], ["QuaranteE2E", "40"]] as const) {
      // Défilement d'abord, clic ensuite aux coordonnées : la fiche se
      // referme au défilement (voir agenda-events.spec.ts).
      const card = page.locator(`[data-testid='agenda-event'][aria-label*='${name}']`).first();
      await card.scrollIntoViewIfNeeded();
      const box = (await card.boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + 12);
      // Sans défilement automatique : il refermerait la fiche.
      await page.getByRole("button", { name: "Modifier", exact: true }).dispatchEvent("click");
      // Le <select> est dans son <label> : son nom accessible contient aussi
      // ses options, d'où une recherche par l'intitulé du champ.
      const duration = page.locator("label").filter({ has: page.locator("span", { hasText: /^Durée$/ }) }).locator("select");
      await expect(duration, `${name} garde sa durée`).toHaveValue(expected);
      await expect(duration.locator("option[value='50']")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
    }
  });
});
