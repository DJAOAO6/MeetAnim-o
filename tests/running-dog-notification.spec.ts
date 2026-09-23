import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Le teckel qui annonce une nouvelle demande de rendez-vous
 * (src/components/notifications/running-dog-notification.tsx).
 *
 * Ce qui compte : il ne court que pour une demande réellement nouvelle — ni
 * au chargement, ni deux fois pour la même —, jamais à plusieurs en même
 * temps, et un clic ouvre la demande.
 */
const ANIMAL = "E2EChienFilou";
const CLIENT = "E2E Teckel Cliente";

function inDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE "animalName" = ${ANIMAL}`;
}

/** Ce que fait le tableau de bord toutes les minutes, sans attendre la minute. */
async function refreshLikeTheDashboard(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test.describe.configure({ mode: "serial" });
test.beforeAll(cleanup);
test.afterAll(cleanup);

test("une nouvelle demande fait courir le teckel, une seule fois, et le clic l'ouvre", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  // Des demandes sont déjà en attente dans le jeu de démonstration : aucune
  // ne doit courir au chargement.
  const [pending] = await sql`SELECT count(*)::int AS n FROM "Appointment" WHERE status = 'PENDING'`;
  expect(pending.n, "le test suppose des demandes déjà en attente").toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("running-dog-notification")).toHaveCount(0);

  // Une demande arrive, comme depuis la page de réservation.
  await sql`
    INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES ('e2e-teckel-rdv', ${`${inDays(3)}T00:00:00.000Z`}, '06:05', 45, ${CLIENT}, ${ANIMAL}, 'Ostéopathie canine', 'CABINET', 'Cabinet', 60, 'PENDING', '', now(), now())`;
  await refreshLikeTheDashboard(page);

  const run = page.getByTestId("running-dog-notification");
  await expect(run).toBeVisible({ timeout: 15000 });
  const banner = run.getByRole("button", { name: /Nouvelle demande de rendez-vous/ });
  await expect(banner).toHaveAccessibleName(new RegExp(`${CLIENT}.*${ANIMAL}.*à confirmer`));
  // Le chien est décoratif : il n'est pas annoncé.
  await expect(run.locator("img")).toHaveAttribute("aria-hidden", "true");

  // La banderole se déplace sans cesse : un clic « au repos » n'arriverait
  // jamais. On déclenche le clic sur l'élément lui-même.
  await banner.dispatchEvent("click");
  const manager = page.getByRole("dialog", { name: "Gestion des rendez-vous" });
  await expect(manager).toBeVisible();
  await expect(manager.getByText(ANIMAL).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // La course se termine et quitte la page.
  await expect(run).toHaveCount(0, { timeout: 10000 });

  // Nouvelle relecture : la même demande ne court pas une seconde fois.
  await refreshLikeTheDashboard(page);
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("running-dog-notification")).toHaveCount(0);
});

test("plusieurs demandes à la suite : jamais deux teckels à la fois", async ({ page }) => {
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.evaluate(() => (window as unknown as { __testDogNotification: (count: number) => void }).__testDogNotification(3));
  await expect(page.getByTestId("running-dog-notification")).toBeVisible({ timeout: 5000 });

  const seen = new Set<string>();
  for (let sample = 0; sample < 40; sample += 1) {
    const runs = page.getByTestId("running-dog-notification");
    const count = await runs.count();
    expect(count, "une seule course à la fois").toBeLessThanOrEqual(1);
    if (count === 1) {
      const name = await runs.getByRole("button").getAttribute("aria-label").catch(() => null);
      if (name) seen.add(name);
    }
    if (seen.size === 3) break;
    await page.waitForTimeout(400);
  }
  expect(seen.size, "les trois notifications passent, l'une après l'autre").toBe(3);
});

test("mouvement réduit : la banderole s'affiche sans course", async ({ browser }) => {
  const context = await browser.newContext({ storageState: "tests/.auth/practitioner.json", reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.evaluate(() => (window as unknown as { __testDogNotification: (count: number) => void }).__testDogNotification(1));
    const run = page.getByTestId("running-dog-notification");
    await expect(run).toBeVisible({ timeout: 5000 });
    const animation = await run.locator(".rdn-runner").evaluate((element) => getComputedStyle(element).animationName);
    expect(animation, "un fondu, pas une traversée").toBe("rdn-fade");
  } finally {
    await context.close();
  }
});

test("désactivé dans les Paramètres : la demande arrive sans teckel, l'aperçu reste possible", async ({ page }) => {
  await sql`UPDATE "User" SET "newRequestAnimation" = false WHERE email = 'praticien-test@pf-osteo-animale.fr'`;
  try {
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await sql`
      INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt")
      VALUES ('e2e-teckel-rdv-off', ${`${inDays(4)}T00:00:00.000Z`}, '06:10', 45, ${CLIENT}, ${ANIMAL}, 'Ostéopathie canine', 'CABINET', 'Cabinet', 60, 'PENDING', '', now(), now())`;
    await refreshLikeTheDashboard(page);
    await page.waitForTimeout(4000);
    await expect(page.getByTestId("running-dog-notification"), "éteint : pas de course").toHaveCount(0);

    await page.goto("/dashboard/parametres?tab=customization", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Tableau de bord/ }).first().click();
    await expect(page.getByRole("switch", { name: "Annonce des nouvelles demandes" })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "Voir l’animation" }).click();
    await expect(page.getByTestId("running-dog-notification"), "l'aperçu, lui, court").toBeVisible({ timeout: 5000 });
  } finally {
    await sql`UPDATE "User" SET "newRequestAnimation" = true WHERE email = 'praticien-test@pf-osteo-animale.fr'`;
  }
});
