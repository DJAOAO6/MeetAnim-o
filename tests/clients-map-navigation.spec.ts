import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 3 : parcourir les clients localisés (Précédent /
 * Suivant, flèches du clavier) dans l'ordre de la liste, trier par nom ou
 * par proximité, et garder les clients sans position à part.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const ROUEN = { lat: 49.4432, lng: 1.0999 };

function eastOf(origin: { lat: number; lng: number }, km: number) {
  const angular = km / 6371;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lng1 = (origin.lng * Math.PI) / 180;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(Math.PI / 2));
  const lng2 = lng1 + Math.atan2(Math.sin(Math.PI / 2) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

const fixtures = [
  { suffix: "a", lastName: "NavAlphaE2E", point: eastOf(ROUEN, 5) },
  { suffix: "b", lastName: "NavBetaE2E", point: eastOf(ROUEN, 15) },
  { suffix: "c", lastName: "NavGammaE2E", point: eastOf(ROUEN, 30) },
  { suffix: "d", lastName: "NavDeltaE2E", point: null },
] as const;
const animalId = (suffix: string) => `tmp-nav-animal-${suffix}`;
// Une ligne par client : les lignes portent l'identifiant du client.
const rowId = (suffix: string) => `tmp-nav-client-${suffix}`;

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const [index, fixture] of fixtures.entries()) {
    const clientId = `tmp-nav-client-${fixture.suffix}`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Test', ${fixture.lastName}, '0600000008', ${`nav-${fixture.suffix}@example.fr`}, 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId(fixture.suffix)}, ${clientId}, ${`Nav${fixture.suffix}Pet`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    if (fixture.point) {
      await sql`
        INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
        VALUES (${`tmp-nav-appt-${fixture.suffix}`}, ${clientId}, ${animalId(fixture.suffix)}, 'Test', ${`Nav${fixture.suffix}Pet`}, 'Ostéopathie E2E', '2031-06-05'::date, ${`${10 + index}:00`}, 30, 'DOMICILE', 'Adresse test', ${fixture.point.lat}, ${fixture.point.lng}, 50, 'COMPLETED', '', now(), now())
      `;
    }
  }
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    await sql`DELETE FROM "Appointment" WHERE id = ${`tmp-nav-appt-${fixture.suffix}`}`;
    await sql`DELETE FROM "Animal" WHERE id = ${animalId(fixture.suffix)}`;
    await sql`DELETE FROM "Client" WHERE id = ${`tmp-nav-client-${fixture.suffix}`}`;
  }
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

const row = (page: Page, suffix: string) => page.locator(`[data-client-row="${rowId(suffix)}"]`);
const selectedRowId = (page: Page) => page.locator("[data-client-row]:has([aria-current='true'])").getAttribute("data-client-row");
const counter = (page: Page) => page.getByTestId("map-navigation-counter");

/** Identifiants des lignes localisées, dans l'ordre affiché (avant « Sans position »). */
async function locatedOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ids: string[] = [];
    for (const element of document.querySelectorAll("[data-client-row], p")) {
      if (element.tagName === "P" && element.textContent?.startsWith("Sans position")) break;
      const id = element.getAttribute("data-client-row");
      if (id) ids.push(id);
    }
    return ids;
  });
}

test.describe("Carte clients — navigation entre clients", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    await expect(row(page, "a")).toBeVisible({ timeout: 15000 });
  });

  test("Précédent / Suivant suivent l'ordre de la liste, avec le compteur", async ({ page }) => {
    const order = await locatedOrder(page);
    await row(page, "a").getByRole("button").first().click();
    const position = order.indexOf(rowId("a"));
    await expect(counter(page)).toHaveText(`${position + 1} / ${order.length}`);

    await page.getByRole("button", { name: "Client suivant" }).click();
    expect(await selectedRowId(page)).toBe(order[position + 1]);
    await expect(counter(page)).toHaveText(`${position + 2} / ${order.length}`);
    await expect(page.getByTestId("map-navigation-live")).toHaveText(/, \d+ sur \d+\.$/);

    await page.getByRole("button", { name: "Client précédent" }).click();
    expect(await selectedRowId(page)).toBe(rowId("a"));
  });

  test("au clavier : → et ← dans la liste ; rien dans un champ de saisie", async ({ page }) => {
    const order = await locatedOrder(page);
    const position = order.indexOf(rowId("a"));
    await row(page, "a").getByRole("button").first().click();
    await page.keyboard.press("ArrowRight");
    expect(await selectedRowId(page)).toBe(order[position + 1]);
    await page.keyboard.press("ArrowLeft");
    expect(await selectedRowId(page)).toBe(rowId("a"));

    await page.getByPlaceholder("Rechercher un client, un animal ou un lieu").focus();
    await page.keyboard.press("ArrowRight");
    expect(await selectedRowId(page), "une flèche dans un champ reste au champ").toBe(rowId("a"));
    await page.keyboard.press("Escape");
  });

  test("proximité : depuis le client choisi, le plus proche d'abord, distances en km", async ({ page }) => {
    await row(page, "a").getByRole("button").first().click();
    await page.getByRole("button", { name: "Proximité" }).click();
    await expect(page.getByText("À vol d’oiseau depuis Test NavAlphaE2E")).toBeVisible();
    const order = await locatedOrder(page);
    expect(order[0], "le client choisi en tête (0 km)").toBe(rowId("a"));
    expect(order.indexOf(rowId("b"))).toBeLessThan(order.indexOf(rowId("c")));
    await expect(row(page, "a")).toContainText("0,0 km");
    await expect(row(page, "b")).toContainText(/1[0-9],\d km/);
  });

  test("les clients sans position sont à part, et jamais parcourus", async ({ page }) => {
    await expect(page.getByText(/^Sans position \(\d+\)$/)).toBeVisible();
    const order = await locatedOrder(page);
    expect(order).not.toContain(rowId("d"));
    // Précédent sans sélection : le dernier client localisé, montré dans la liste.
    await page.getByRole("button", { name: "Client précédent" }).click();
    expect(await selectedRowId(page)).toBe(order[order.length - 1]);
    await expect(counter(page)).toHaveText(`${order.length} / ${order.length}`);
    await expect(page.getByRole("button", { name: "Client suivant" })).toBeDisabled();
    const list = page.locator("[data-client-row]").first().locator("xpath=..");
    const listBox = (await list.boundingBox())!;
    const lastBox = (await page.locator(`[data-client-row="${order[order.length - 1]}"]`).boundingBox())!;
    expect(lastBox.y, "la ligne du client est visible dans la liste").toBeGreaterThanOrEqual(listBox.y - 1);
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(listBox.y + listBox.height + 1);
  });
});
