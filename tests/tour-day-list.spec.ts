import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

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

async function cleanupE2EListFixtures() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "TourRun" WHERE name LIKE 'E2E Liste%' OR name = ${tourName}`;
  await sql`DELETE FROM "Tour" WHERE name = ${tourName}`;
  await sql`DELETE FROM "Zone" WHERE name = ${zoneName}`;
}

test.describe("Page Tournées — liste de journées datées", () => {
  test.describe.configure({ mode: "serial" });

  // Filet de sécurité si une exécution précédente a planté avant son
  // afterAll (voir le commentaire ci-dessous sur la portée du nettoyage).
  test.beforeAll(async () => {
    await cleanupE2EListFixtures();
  });

  // Le motif "Tournée E2E Liste" créé ci-dessous est ACTIF (récurrence
  // hebdomadaire réelle) : generateUpcomingTourRuns() tourne à chaque
  // chargement de /dashboard/tournees, par N'IMPORTE QUEL utilisateur (le
  // motif Tour n'a pas de userId, voir tour-run-generation.ts) — une vraie
  // visite du praticien pendant que ce test tourne génère donc des journées
  // fantômes SUR SON PROPRE COMPTE, pas seulement sur celui du test.
  // cleanupE2EListFixtures nettoie par nom (jamais un nom qu'un vrai
  // praticien choisirait) plutôt que scopé à testUserId, pour rattraper ces cas.
  test.afterAll(async () => {
    await cleanupE2EListFixtures();
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
    await expect(page.getByRole("button", { name: "Nouveau rendez-vous", exact: true })).toHaveCount(0);

    await page.goto("/dashboard/agenda");
    await expect(page.getByRole("button", { name: "Nouveau rendez-vous", exact: true })).toBeVisible({ timeout: 10000 });
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
  /**
   * Suppression groupée.
   *
   * Le besoin n'est pas théorique : une même journée peut être régénérée en
   * boucle (voir le test suivant), et se retrouver à en supprimer des dizaines
   * une par une n'est pas une tâche qu'on peut demander à quelqu'un.
   */
  test("sélectionner plusieurs journées et les supprimer d'un seul geste", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    // Point de départ net : ce compte de test n'a pas de journée à lui.
    await sql`DELETE FROM "TourRun" WHERE "userId" = ${testUserId}`;

    const today = new Date();
    for (let offset = 3; offset <= 6; offset++) {
      const dateId = formatDateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
      await sql`
        INSERT INTO "TourRun" (id, "userId", name, date, "startType", "endType", "departureTime", "createdAt", "updatedAt")
        VALUES (${fakeCuid()}, ${testUserId}, ${`E2E Liste — Lot ${offset}`}, ${dateId}::date, 'CABINET', 'SAME_AS_START', '09:00', now(), now())
      `;
    }

    await login(page);
    await page.goto("/dashboard/tournees");
    await expect(page.getByRole("button", { name: /Tout sélectionner \(4\)/ })).toBeVisible({ timeout: 15000 });

    // Rien n'est proposé à la suppression tant que rien n'est sélectionné.
    await expect(page.getByRole("button", { name: /Supprimer la sélection/ })).toHaveCount(0);

    await page.getByRole("button", { name: /Tout sélectionner/ }).click();
    await expect(page.getByText("4 journées sélectionnées")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Supprimer la sélection/ }).click();

    await expect(page.getByText("Aucune journée à venir pour l’instant.")).toBeVisible({ timeout: 15000 });
    const reste = await sql`SELECT COUNT(*)::int AS n FROM "TourRun" WHERE "userId" = ${testUserId}`;
    expect(reste[0].n, "plus aucune journée en base").toBe(0);
  });

  /**
   * La cause des journées en double.
   *
   * Les journées générées survivent à leur motif (TourRun.template est en
   * SetNull). Orphelines, elles échappent à l'index unique qui garantit
   * l'idempotence de la génération — deux NULL n'étant jamais égaux en SQL —
   * et le lot entier se recrée au chargement suivant.
   *
   * Supprimer le motif doit donc emporter ses journées à venir encore vides.
   * Mais elles seulement : une journée qui porte des arrêts porte du travail,
   * et une journée passée est de l'historique.
   */
  test("supprimer un motif emporte ses journées à venir vides, jamais celles qui portent quelque chose", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "TourRun" WHERE "userId" = ${testUserId}`;
    await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;

    const [zone] = await sql`INSERT INTO "Zone" (id, name) VALUES (${fakeCuid()}, ${zoneName}) RETURNING id`;
    const [tour] = await sql`
      INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
      VALUES (${fakeCuid()}, ${tourName}, 'Toutes les semaines', 'Jeudi', 'Tous les jeudis', '09:00', '17:00', ${zone.id}, 'ACTIVE')
      RETURNING id
    `;

    const today = new Date();
    const futureId = formatDateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 4));
    const futureWithStopId = formatDateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5));
    const pastId = formatDateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4));

    const vide = fakeCuid();
    const avecArret = fakeCuid();
    const passee = fakeCuid();
    for (const [id, dateId] of [[vide, futureId], [avecArret, futureWithStopId], [passee, pastId]] as const) {
      await sql`
        INSERT INTO "TourRun" (id, "userId", "templateId", name, date, "startType", "endType", "departureTime", "createdAt", "updatedAt")
        VALUES (${id}, ${testUserId}, ${tour.id}, ${tourName}, ${dateId}::date, 'CABINET', 'SAME_AS_START', '09:00', now(), now())
      `;
    }
    await sql`
      INSERT INTO "TourStop" (id, "tourRunId", "order", type, label, "createdAt", "updatedAt")
      VALUES (${fakeCuid()}, ${avecArret}, 0, 'OTHER', 'Arrêt test', now(), now())
    `;

    // Paramètres › Tournées › le motif › Supprimer.
    await login(page);
    await page.goto("/dashboard/parametres?tab=tours");
    await page.getByText(tourName, { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Modifier" }).first().click();
    await page.getByRole("button", { name: "Supprimer la tournée" }).first().click();
    await page.getByRole("button", { name: "Supprimer la tournée" }).last().click();
    await expect(page.getByText("Tournée supprimée.")).toBeVisible({ timeout: 15000 });

    const restants = await sql`SELECT id FROM "TourRun" WHERE "userId" = ${testUserId}`;
    const ids = restants.map((row) => row.id as string);
    expect(ids, "la journée à venir vide part avec son motif").not.toContain(vide);
    expect(ids, "la journée qui porte un arrêt reste").toContain(avecArret);
    expect(ids, "l’historique reste").toContain(passee);

    await sql`DELETE FROM "TourRun" WHERE "userId" = ${testUserId}`;
    await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
  });
});
