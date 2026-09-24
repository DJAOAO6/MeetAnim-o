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
  await expect(page.getByRole("button", { name: "1 h 30" }), "plus de cases de 1 h 30").toHaveCount(0);
  await page.getByRole("button", { name: "1 h", exact: true }).click();
  await page.getByRole("switch", { name: "Afficher le dimanche" }).click();
  await expect(dayHeaders, "dimanche masqué aussitôt").toHaveCount(6);
  // Cases d'une heure : 13 cases de 56 px entre 08:00 et 21:00.
  await expect.poll(async () => (await page.getByTestId("agenda-time-column").boundingBox())!.height).toBe(13 * 56);

  // Pas encore enregistré.
  const [before] = await sql`SELECT count(*)::int AS n FROM "AgendaPreferences" p JOIN "User" u ON u.id = p."userId" WHERE u.email = ${PRACTITIONER}`;
  expect(before.n).toBe(0);

  await page.getByRole("button", { name: "Définir comme affichage par défaut" }).click();
  await expect(page.getByText("Affichage enregistré")).toBeVisible();
  const [saved] = await sql`SELECT p."slotMinutes", p."showSunday" FROM "AgendaPreferences" p JOIN "User" u ON u.id = p."userId" WHERE u.email = ${PRACTITIONER}`;
  expect([saved.slotMinutes, saved.showSunday]).toEqual([60, false]);

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

test("9 h – 21 h, c'est 9 h – 21 h : ce qui en sort est signalé, et s'ouvre d'un clic", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Affichage" }).click();
  await page.getByLabel("Début des horaires visibles").selectOption("9");
  await page.keyboard.press("Escape");

  const labels = page.getByTestId("agenda-time-column").locator("span:not([data-testid])");
  await expect(labels.first()).toHaveText("09:00");
  await expect(labels.last()).toHaveText("21:00");

  // Aucune carte ne dépasse de la grille.
  const column = (await page.getByTestId("agenda-time-column").boundingBox())!;
  for (const box of await page.getByTestId("agenda-event").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect()).map(({ top, bottom }) => ({ top, bottom })))) {
    expect(box.top).toBeGreaterThanOrEqual(column.y - 1);
    expect(box.bottom).toBeLessThanOrEqual(column.y + column.height + 1);
  }
  // Pas d'ascenseur vertical dans la grille.
  expect(await page.getByTestId("agenda-grid-scroller").evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(0);

  const markers = page.getByTestId("agenda-outside-range");
  if (await markers.count()) {
    await expect(markers.first()).toHaveAccessibleName(/rendez-vous (avant|après) \d{2}:00/);
    await markers.first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
  }
});
