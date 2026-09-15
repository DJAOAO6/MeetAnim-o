import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Sécurité tactile de l'agenda : un défilement au doigt ne doit jamais
 * replanifier un rendez-vous. Le planning (week-planner.tsx) démarrait
 * auparavant un glissement dès 4 px de mouvement, quel que soit le type de
 * pointeur — un simple swipe vertical déplaçait donc le rendez-vous touché
 * au départ et changeait son horaire en base, sans aucune intention.
 *
 * Le déplacement tactile est désormais armé par un appui long immobile
 * (TOUCH_HOLD_MS) : ces tests vérifient les deux faces de la règle — le
 * défilement ne déplace rien, l'appui long déplace toujours.
 */

const TEST_CLIENT_NAME = "E2E Touch Scroll";
const TEST_START = "10:00";

// Le jour courant : c'est celui que l'agenda ouvre par défaut, en vue jour
// comme en vue semaine — aucune navigation à simuler avant le geste tactile.
function today(): Date {
  return new Date();
}

function toDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function readStart(dateId: string): Promise<string | null> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT "start" FROM "Appointment" WHERE "clientName" = ${TEST_CLIENT_NAME} AND "date" = ${`${dateId}T00:00:00.000Z`}`;
  return rows.length ? (rows[0] as { start: string }).start : null;
}

/**
 * Playwright n'expose que le tap tactile : les gestes composés (maintien,
 * glissement) passent par le protocole Chrome DevTools, seul moyen d'émettre
 * une vraie séquence touchStart/touchMove/touchEnd — c'est elle qui produit
 * les événements pointer tactiles que le planning arbitre.
 */
async function touchGesture(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, holdMs: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  const steps = 6;
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps }],
    });
    await page.waitForTimeout(30);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.describe("Agenda tactile", () => {
  const dateId = toDateId(today());

  test.afterAll(async () => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "Appointment" WHERE "clientName" = ${TEST_CLIENT_NAME}`;
  });

  /**
   * Les trois vérifications tiennent dans une seule session : la connexion
   * est limitée en débit côté serveur (protection anti-force brute), et un
   * test par vérification déclencherait cette limite d'une exécution à
   * l'autre. L'ordre compte — le défilement est vérifié avant tout
   * déplacement volontaire.
   */
  test("le défilement ne replanifie rien, l'appui long replanifie", async ({ page }) => {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`DELETE FROM "Appointment" WHERE "clientName" = ${TEST_CLIENT_NAME}`;
    await sql`INSERT INTO "Appointment" ("id", "date", "start", "duration", "clientName", "animalName", "serviceName", "mode", "location", "price", "status", "notes", "createdAt", "updatedAt")
      VALUES (${`e2e-touch-${Date.now()}`}, ${`${dateId}T00:00:00.000Z`}, ${TEST_START}, 60, ${TEST_CLIENT_NAME}, 'Touchy', 'Séance test', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;

    // Session ouverte par le projet "setup" (tests/auth.setup.ts).
    await page.goto("/dashboard/agenda");

    const card = page.getByTestId("agenda-event").filter({ hasText: "Touchy" }).first();
    await expect(card).toBeVisible({ timeout: 20000 });

    // 1. Défilement au doigt, départ sur le rendez-vous : rien ne doit bouger.
    const scrollBox = (await card.boundingBox())!;
    const scrollFrom = { x: scrollBox.x + scrollBox.width / 2, y: scrollBox.y + scrollBox.height / 2 };
    await touchGesture(page, scrollFrom, { x: scrollFrom.x, y: scrollFrom.y - 220 }, 0);
    await page.waitForTimeout(800);
    await expect(card).not.toHaveAttribute("data-drag-armed", "true");
    expect(await readStart(dateId)).toBe(TEST_START);

    // 2. L'axe horaire ne suit pas le défilement horizontal (sticky left-0).
    const timeColumn = page.getByTestId("agenda-time-column").first();
    const before = (await timeColumn.boundingBox())!;
    await page.mouse.wheel(300, 0);
    await page.waitForTimeout(300);
    const after = (await timeColumn.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(2);

    // 3. Appui long maintenu : le déplacement devient possible et s'applique.
    // Le défilement de l'étape 1 a pu sortir le rendez-vous de l'écran :
    // sans ce recentrage, le geste suivant atomberait à côté de la carte.
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const dragBox = (await card.boundingBox())!;
    const dragFrom = { x: dragBox.x + dragBox.width / 2, y: dragBox.y + dragBox.height / 2 };
    // 72 px = une heure de planning (HOUR_HEIGHT).
    await touchGesture(page, dragFrom, { x: dragFrom.x, y: dragFrom.y + 72 }, 700);
    await expect
      .poll(async () => readStart(dateId), { timeout: 15000, message: "l'appui long doit replanifier le rendez-vous" })
      .not.toBe(TEST_START);
  });
});
