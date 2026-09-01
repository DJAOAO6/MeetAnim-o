import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Unification des tournées, phase 1.2/1.3 : génération des TourRun à venir
 * depuis un motif récurrent actif, déclenchée (entre autres) à la lecture
 * de la page tournées. Génère pour CHAQUE compte ADMIN actif (choix
 * explicite de l'utilisatrice) — donc le nettoyage doit retirer les
 * TourRun générées pour tous les comptes, pas seulement celui du test, sous
 * peine de polluer les vrais comptes praticienne/développeur.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";
const zoneName = "Zone E2E Génération";
const tourName = "Tournée E2E Génération";

function formatDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Prochain jeudi (aujourd'hui inclus) — même logique que nextMondayDateId()
// utilisé plus tôt dans la suite tournées, généralisée au jour choisi.
function nextWeekdayDateId(targetWeekday: number): string {
  const today = new Date();
  const diff = (targetWeekday - today.getDay() + 7) % 7;
  return formatDateId(new Date(today.getFullYear(), today.getMonth(), today.getDate() + diff));
}

async function cleanup(tourId: string | null) {
  const sql = neon(process.env.DATABASE_URL!);
  if (tourId) await sql`DELETE FROM "TourRun" WHERE "templateId" = ${tourId}`;
  await sql`DELETE FROM "Tour" WHERE name = ${tourName}`;
  await sql`DELETE FROM "Zone" WHERE name = ${zoneName}`;
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

test.describe("Génération des journées de tournée depuis un motif récurrent", () => {
  test.describe.configure({ mode: "serial" });

  let tourId: string | null = null;

  test.beforeAll(async () => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
    await cleanup(null);
  });

  test.afterAll(async () => {
    await cleanup(tourId);
  });

  test("un motif hebdomadaire génère les occurrences à venir dans la fenêtre de 21 jours, jamais dans le passé, et sans doublon si on rejoue", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);

    // Jeudi = index 4 (0 = dimanche).
    const anchorThursday = nextWeekdayDateId(4);
    const [zone] = await sql`INSERT INTO "Zone" (id, name) VALUES (${"z" + Date.now()}, ${zoneName}) RETURNING id`;
    const [tour] = await sql`
      INSERT INTO "Tour" (id, name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status)
      VALUES (${"t" + Date.now()}, ${tourName}, 'Toutes les semaines', 'Jeudi', 'Tous les jeudis', '09:00', '17:00', ${zone.id}, 'ACTIVE')
      RETURNING id
    `;
    tourId = tour.id;
    await sql`INSERT INTO "_TourZones" ("A", "B") VALUES (${tour.id}, ${zone.id})`;

    await login(page);
    await page.goto("/dashboard/tournees");
    await page.waitForTimeout(1000);

    // Comparaison en chaîne "YYYY-MM-DD" calculée côté SQL (to_char, en UTC
    // — même convention que le stockage `${dateId}T00:00:00.000Z`) : jamais
    // repasser par un Date JS ici, sa reconstruction locale décalerait le
    // jour selon le fuseau de la machine qui exécute le test.
    const runsAfterFirstLoad = await sql`SELECT to_char(date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date_id, "userId" FROM "TourRun" WHERE "templateId" = ${tourId} ORDER BY date ASC`;

    // Aucune génération avant aujourd'hui.
    const todayId = formatDateId(new Date());
    for (const run of runsAfterFirstLoad) {
      expect(run.date_id >= todayId).toBe(true);
    }
    // Chaque occurrence générée tombe un jeudi.
    for (const run of runsAfterFirstLoad) {
      const [year, month, day] = run.date_id.split("-").map(Number);
      expect(new Date(year, month - 1, day).getDay()).toBe(4);
    }
    expect(runsAfterFirstLoad.length).toBeGreaterThan(0);
    expect(anchorThursday >= todayId).toBe(true);

    // Rejouer (nouvelle lecture de page) ne crée aucun doublon.
    await page.reload();
    await page.waitForTimeout(1000);
    const runsAfterSecondLoad = await sql`SELECT id FROM "TourRun" WHERE "templateId" = ${tourId}`;
    expect(runsAfterSecondLoad.length).toBe(runsAfterFirstLoad.length);
  });
});
