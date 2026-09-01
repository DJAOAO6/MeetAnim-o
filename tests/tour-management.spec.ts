import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * FIX_PLAN.md item 30(e) : gestion des tournées non couverte par la suite
 * E2E, maintenant que la persistance réelle existe (P0-2, Sprint 1 —
 * auparavant un état local simulé qui ne survivait pas au rechargement).
 * Les actions de tournée/zone exigent la permission MANAGE_PUBLIC_SETTINGS,
 * que le compte de test n'a pas par défaut — accordée temporairement, comme
 * dans tests/notifications-toasts.spec.ts.
 *
 * Réécrit pour l'unification des tournées, phase 2 : le panneau Zones et la
 * modale de création multi-zone (TourModal) ne sont plus accessibles depuis
 * /dashboard/tournees (remplacée par la liste de journées datées) et pas
 * encore relogés dans Paramètres — c'est la phase 4 de ce chantier. Modifier
 * et activer/désactiver une tournée existante restent en revanche possibles
 * dès aujourd'hui via Paramètres > Tournées (formulaire d'édition en ligne,
 * plus simple, déjà présent avant même la refonte) : ces deux tests ciblent
 * désormais cet écran, avec leur propre zone/tournée semées directement en
 * base plutôt que de dépendre d'une création UI absente.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testZoneName = "Zone E2E Tournées";
const testTourName = "Tournée E2E Test";

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Tour" WHERE name LIKE ${testTourName + "%"}`;
  await sql`DELETE FROM "Zone" WHERE name = ${testZoneName}`;
}

async function seedZoneAndTour() {
  const sql = neon(process.env.DATABASE_URL!);
  const [zone] = await sql`INSERT INTO "Zone" (id, name) VALUES ('e2e-zone-' || substr(md5(random()::text), 1, 12), ${testZoneName}) ON CONFLICT DO NOTHING RETURNING id`;
  const zoneRow = zone ?? (await sql`SELECT id FROM "Zone" WHERE name = ${testZoneName}`)[0];
  const [existing] = await sql`SELECT id FROM "Tour" WHERE name = ${testTourName}`;
  if (existing) return { zoneId: zoneRow.id, tourId: existing.id };
  const [tour] = await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES ('e2e-tour-' || substr(md5(random()::text), 1, 12), ${testTourName}, 'Toutes les semaines', 'Lundi', 'Tous les lundis', '09:00', '18:00', ${zoneRow.id}, 'ACTIVE')
    RETURNING id
  `;
  await sql`INSERT INTO "_TourZones" ("A", "B") VALUES (${tour.id}, ${zoneRow.id})`;
  return { zoneId: zoneRow.id, tourId: tour.id };
}

test.describe("Gestion des tournées — édition depuis Paramètres", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(grantPermission);
  test.afterAll(async () => {
    await cleanup();
    await revokePermission();
  });

  // Créer une zone puis une tournée multi-zone (avec création de zone en
  // ligne) : n'a plus de chemin d'UI nulle part dans l'application — le
  // panneau Zones et TourModal (multi-zone) ont été retirés de
  // /dashboard/tournees en phase 2 et ne sont pas encore relogés dans
  // Paramètres (phase 4 de PROMPT-TOURNEES-UNIFICATION.md). À restaurer à
  // ce moment-là plutôt que de rewriter contre un écran provisoire.
  test.skip("créer une zone puis une tournée récurrente sur deux zones (dont une créée en ligne) les persiste réellement en base", async () => {});

  test.beforeEach(async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
    await page.goto("/login");
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL("**/dashboard**", { timeout: 10000 });
    await page.goto("/dashboard/parametres");
    await page.getByRole("button", { name: "Tournées", exact: true }).click();
  });

  test("désactiver puis réactiver une tournée persiste réellement le changement de statut", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await seedZoneAndTour();
    await page.reload();
    await page.getByRole("button", { name: "Tournées", exact: true }).click();

    const card = page.locator("div.p-5").filter({ hasText: testTourName }).last();

    // Lit l'état réel en base avant chaque geste plutôt que le texte du
    // bouton dans le DOM (plus fiable qu'un aller-retour lire-puis-décider
    // sur un élément qui vient de se re-rendre après le clic précédent).
    async function setActive(active: boolean) {
      const [current] = await sql`SELECT status FROM "Tour" WHERE name = ${testTourName}`;
      if ((current.status === "ACTIVE") === active) return;
      await card.getByRole("button", { name: active ? "Activer" : "Désactiver", exact: true }).click();
    }

    await setActive(false);
    await expect.poll(async () => (await sql`SELECT status FROM "Tour" WHERE name = ${testTourName}`)[0].status).toBe("INACTIVE");

    await setActive(true);
    await expect.poll(async () => (await sql`SELECT status FROM "Tour" WHERE name = ${testTourName}`)[0].status).toBe("ACTIVE");
  });

  test("modifier le nom d'une tournée existante persiste réellement le changement", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await seedZoneAndTour();
    await page.reload();
    await page.getByRole("button", { name: "Tournées", exact: true }).click();

    const card = page.locator("div.p-5").filter({ hasText: testTourName }).last();
    await card.getByRole("button", { name: "Modifier", exact: true }).click();

    // Une fois en édition, le nom n'est plus qu'une valeur d'input (pas du
    // texte visible) : le locator `card` ci-dessus, filtré par hasText, ne
    // résout donc plus rien — on repasse par la page pour la suite.
    await page.locator('input[value="' + testTourName + '"]').fill(testTourName + " Modifiée");
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

    await expect.poll(async () => {
      const [tour] = await sql`SELECT name FROM "Tour" WHERE name = ${testTourName + " Modifiée"}`;
      return Boolean(tour);
    }).toBe(true);

    await sql`UPDATE "Tour" SET name = ${testTourName} WHERE name = ${testTourName + " Modifiée"}`;
  });
});
