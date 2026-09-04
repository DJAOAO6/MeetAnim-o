import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Unification des tournées, phase 2 : la page /dashboard/tournees est
 * désormais une liste de journées datées (Aujourd'hui / À venir / Passées),
 * un seul point de création.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const testUserId = "cmt9uie2k0001vow17mo9b4rj";
const zoneName = "Zone E2E Liste";
const tourName = "Tournée E2E Liste";

function fakeCuid(): string {
  return `c${randomBytes(12).toString("hex")}`;
}

function formatDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextWeekdayDateId(targetWeekday: number, minOffsetDays = 1): string {
  const today = new Date();
  let diff = (targetWeekday - today.getDay() + 7) % 7;
  if (diff < minOffsetDays) diff += 7;
  return formatDateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff));
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

test.describe("Page Tournées — liste de journées datées", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "TourRun" WHERE "userId" = ${testUserId} AND (name LIKE 'E2E Liste%' OR name = ${tourName})`;
    await sql`DELETE FROM "Tour" WHERE name = ${tourName}`;
    await sql`DELETE FROM "Zone" WHERE name = ${zoneName}`;
  });

  test("affiche Aujourd'hui, À venir (avec mention du motif) et Passées, chacune avec le bon résumé", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const todayId = formatDateId(new Date());
    const upcomingId = nextWeekdayDateId(4, 2); // un jeudi à au moins 2 jours, distinct d'aujourd'hui
    const todayForOffset = new Date();
    const pastId = formatDateId(new Date(todayForOffset.getFullYear(), todayForOffset.getMonth(), todayForOffset.getDate() - 3));

    const [zone] = await sql`INSERT INTO "Zone" (id, name) VALUES (${fakeCuid()}, ${zoneName}) RETURNING id`;
    const [tour] = await sql`
      INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
      VALUES (${fakeCuid()}, ${tourName}, 'Toutes les semaines', 'Jeudi', 'Tous les jeudis', '09:00', '17:00', ${zone.id}, 'ACTIVE')
      RETURNING id
    `;
    await sql`INSERT INTO "_TourZones" ("A", "B") VALUES (${tour.id}, ${zone.id})`;

    // Aujourd'hui : une vraie journée avec un arrêt.
    const todayRunId = fakeCuid();
    await sql`
      INSERT INTO "TourRun" (id, "userId", name, date, "startType", "endType", "departureTime", "createdAt", "updatedAt")
      VALUES (${todayRunId}, ${testUserId}, 'E2E Liste — Aujourd’hui', ${todayId}::date, 'CABINET', 'SAME_AS_START', '09:00', now(), now())
    `;
    await sql`
      INSERT INTO "TourStop" (id, "tourRunId", "order", type, label, "createdAt", "updatedAt")
      VALUES (${fakeCuid()}, ${todayRunId}, 0, 'OTHER', 'Arrêt test', now(), now())
    `;

    // À venir : issue du motif "Tournée E2E Liste", sans arrêt.
    await sql`
      INSERT INTO "TourRun" (id, "userId", "templateId", name, date, "startType", "endType", "departureTime", "createdAt", "updatedAt")
      VALUES (${fakeCuid()}, ${testUserId}, ${tour.id}, ${tourName}, ${upcomingId}::date, 'CABINET', 'SAME_AS_START', '09:00', now(), now())
    `;

    // Passée : sans motif.
    await sql`
      INSERT INTO "TourRun" (id, "userId", name, date, "startType", "endType", "createdAt", "updatedAt")
      VALUES (${fakeCuid()}, ${testUserId}, 'E2E Liste — Passée', ${pastId}::date, 'CABINET', 'SAME_AS_START', now(), now())
    `;

    await login(page);
    await page.goto("/dashboard/tournees");
    await page.waitForTimeout(800);

    // Aujourd'hui : carte mise en avant avec le résumé sur une ligne.
    await expect(page.getByText("Aujourd’hui", { exact: true })).toBeVisible();
    await expect(page.getByText(/E2E Liste — Aujourd/)).toBeVisible();
    await expect(page.getByText(/1 arrêt/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Ouvrir ma tournée" })).toBeVisible();

    // À venir : secteur (zones du motif) + mention du motif, sans arrêt → message dédié.
    const upcomingRow = page.getByRole("button", { name: new RegExp(zoneName) });
    await expect(upcomingRow).toBeVisible();
    await expect(upcomingRow.getByText("chaque jeudi")).toBeVisible();
    await expect(upcomingRow.getByText("aucun rendez-vous pour l’instant")).toBeVisible();

    // Passées : présente et repliable — d'autres journées passées peuvent déjà
    // exister pour ce compte de test (utilisé par ailleurs dans la suite),
    // au-delà des 5 dernières visibles par défaut : ouvrir "Afficher plus" au
    // besoin plutôt que supposer que la nôtre est dans les 5 plus récentes.
    // Une ligne de liste n'affiche jamais le nom de la journée (seulement
    // date/secteur/résumé, voir DayRow) — on cherche donc son intitulé de date.
    await expect(page.getByText("Passées")).toBeVisible();
    const showMorePast = page.getByRole("button", { name: /Afficher .* de plus/ });
    if (await showMorePast.isVisible().catch(() => false)) await showMorePast.click();
    const pastDateId = new Date(`${pastId}T12:00:00.000Z`);
    const pastDateLabel = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(pastDateId);
    await expect(page.getByText(pastDateLabel, { exact: false })).toBeVisible();
  });

  test("le cluster de boutons flottants est masqué sur cette page mais reste présent ailleurs", async ({ page }) => {
    await login(page);

    await page.goto("/dashboard/tournees");
    await expect(page.getByRole("button", { name: "Créer un nouveau rendez-vous" })).toHaveCount(0);

    await page.goto("/dashboard/agenda");
    await expect(page.getByRole("button", { name: "Créer un nouveau rendez-vous" })).toBeVisible({ timeout: 10000 });
  });

  test("créer une nouvelle journée persiste réellement en base et ouvre directement son écran", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    const dateId = nextWeekdayDateId(2, 5); // mardi, assez loin pour ne collisionner avec rien

    await login(page);
    await page.goto("/dashboard/tournees");
    await page.getByRole("button", { name: "Nouvelle journée" }).click();

    await page.locator("#new-tour-day-date").fill(dateId);
    await page.locator("#new-tour-day-name").fill("E2E Liste — Créée");
    await page.getByRole("button", { name: "Créer la journée" }).click();

    await page.waitForURL(new RegExp(`date=${dateId}`), { timeout: 10000 });

    const [run] = await sql`SELECT id, name FROM "TourRun" WHERE "userId" = ${testUserId} AND name = 'E2E Liste — Créée'`;
    expect(run).toBeTruthy();
  });
});
