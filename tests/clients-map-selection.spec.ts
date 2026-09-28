import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 1 : aucune fiche ouverte à l'arrivée, et une fiche
 * se referme comme on s'y attend — fond de carte, Échap, bouton ×, second
 * clic sur le marqueur. Un client sans position ne s'ouvre jamais sur la
 * carte : il se traite depuis la liste.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

const fixtures = [
  { suffix: "a", lastName: "SelectionAE2E", animal: "SelectAlphaE2E", point: { lat: 49.4432, lng: 1.17 } },
  { suffix: "b", lastName: "SelectionBE2E", animal: "SelectBetaE2E", point: { lat: 49.47, lng: 1.2 } },
  { suffix: "c", lastName: "SelectionCE2E", animal: "SelectGammaE2E", point: null },
] as const;

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const [index, fixture] of fixtures.entries()) {
    const clientId = `tmp-select-client-${fixture.suffix}`;
    const animalId = `tmp-select-animal-${fixture.suffix}`;
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientId}, 'Test', ${fixture.lastName}, '0600000007', ${`select-${fixture.suffix}@example.fr`}, 'Rouen', '1 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalId}, ${clientId}, ${fixture.animal}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    if (fixture.point) {
      await sql`
        INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
        VALUES (${`tmp-select-appt-${fixture.suffix}`}, ${clientId}, ${animalId}, 'Test', ${fixture.animal}, 'Ostéopathie E2E', '2031-06-05'::date, ${`${10 + index}:00`}, 30, 'DOMICILE', 'Adresse test', ${fixture.point.lat}, ${fixture.point.lng}, 50, 'COMPLETED', '', now(), now())
      `;
    }
  }
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  for (const fixture of fixtures) {
    await sql`DELETE FROM "Appointment" WHERE id = ${`tmp-select-appt-${fixture.suffix}`}`;
    await sql`DELETE FROM "Animal" WHERE id = ${`tmp-select-animal-${fixture.suffix}`}`;
    await sql`DELETE FROM "Client" WHERE id = ${`tmp-select-client-${fixture.suffix}`}`;
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

const popup = (page: Page) => page.getByRole("link", { name: "Voir la fiche client" });
const marker = (page: Page, lastName: string) => page.locator(`.leaflet-marker-icon[title*="${lastName}"]`);
const dueToggle = (page: Page) => page.locator("button[aria-pressed]").filter({ hasText: /^À relancer$/ });
const row = (page: Page, lastName: string) => page.locator("[data-client-row]").filter({ hasText: lastName });

async function openMap(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
  await expect(row(page, "SelectionAE2E")).toBeVisible({ timeout: 15000 });
  // Vue d'ensemble : les marqueurs proches sont regroupés. Choisir le client
  // dans la liste zoome sur lui (les groupes se séparent), Échap referme.
  await row(page, "SelectionAE2E").getByRole("button").first().click();
  await expect(marker(page, "SelectionAE2E")).toBeVisible({ timeout: 15000 });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900); // fin du recentrage
}

/** Un point du fond de carte, vérifié : ni marqueur, ni contrôle, ni fiche. */
async function clickBackground(page: Page) {
  const box = (await page.locator(".leaflet-container").boundingBox())!;
  for (const [dx, dy] of [[0.12, 0.85], [0.1, 0.5], [0.5, 0.1], [0.3, 0.3]]) {
    const x = box.x + box.width * dx;
    const y = box.y + box.height * dy;
    const isBackground = await page.evaluate(([px, py]) => {
      const element = document.elementFromPoint(px, py);
      return Boolean(element?.closest(".leaflet-container")) && !element?.closest(".leaflet-marker-icon, .leaflet-control, a, button");
    }, [x, y]);
    if (isBackground) { await page.mouse.click(x, y); return; }
  }
  throw new Error("aucun point de fond de carte libre");
}

test.describe("Carte clients — sélection et désélection", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => { await login(page); await openMap(page); });

  test("aucune fiche ouverte à l'arrivée, aucune ligne sélectionnée", async ({ page }) => {
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    await expect(row(page, "SelectionAE2E")).toBeVisible({ timeout: 15000 });
    await expect(popup(page)).toHaveCount(0);
    await expect(page.locator("[data-client-row] [aria-current='true']")).toHaveCount(0);
  });

  test("un marqueur ouvre sa fiche et sa ligne ; le fond de carte la referme", async ({ page }) => {
    await marker(page, "SelectionAE2E").click();
    await expect(popup(page)).toBeVisible();
    await expect(row(page, "SelectionAE2E").locator("[aria-current='true']")).toBeVisible();
    // La fiche ne recouvre pas le marqueur choisi.
    await page.waitForTimeout(900);
    const pin = (await marker(page, "SelectionAE2E").boundingBox())!;
    const card = (await page.getByRole("button", { name: /^Fermer la fiche de/ }).locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]").boundingBox())!;
    const overlaps = pin.x < card.x + card.width && pin.x + pin.width > card.x && pin.y < card.y + card.height && pin.y + pin.height > card.y;
    expect(overlaps, "la fiche laisse voir le marqueur").toBe(false);

    await clickBackground(page);
    await expect(popup(page)).toHaveCount(0);
  });

  test("Échap, le bouton × et un second clic sur le marqueur referment la fiche", async ({ page }) => {
    await marker(page, "SelectionAE2E").click();
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup(page)).toHaveCount(0);

    await marker(page, "SelectionAE2E").click();
    await page.getByRole("button", { name: "Fermer la fiche de Test SelectionAE2E" }).click();
    await expect(popup(page)).toHaveCount(0);

    // Second clic sur le marqueur déjà choisi (une fois la carte recentrée).
    await marker(page, "SelectionAE2E").click();
    await expect(popup(page)).toBeVisible();
    await page.waitForTimeout(900);
    await marker(page, "SelectionAE2E").click();
    await expect(popup(page)).toHaveCount(0);
  });

  test("un client sans position ne s'ouvre pas sur la carte : la liste propose de le localiser", async ({ page }) => {
    const unlocated = row(page, "SelectionCE2E");
    await unlocated.getByRole("button").first().click();
    await expect(popup(page), "aucune fiche flottante").toHaveCount(0);
    await expect(unlocated.getByRole("button", { name: "Localiser" })).toBeVisible();
    await expect(unlocated.getByRole("link", { name: "Fiche client" })).toBeVisible();
  });

  test("un filtre qui écarte le client choisi referme sa fiche", async ({ page }) => {
    await marker(page, "SelectionAE2E").click();
    await expect(popup(page)).toBeVisible();
    await dueToggle(page).click();
    await expect(popup(page)).toHaveCount(0);
    await dueToggle(page).click();
    await expect(popup(page), "il ne revient pas sélectionné").toHaveCount(0);
  });
});
