import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Annuler un rendez-vous depuis l'agenda, et répondre aux demandes depuis la
 * gestion des rendez-vous. Chaque essai remet les statuts touchés comme
 * avant.
 */
test.describe.configure({ mode: "serial" });

// Heure prise côté base : « updatedAt » est un horodatage sans fuseau, et
// une date JavaScript comparée à lui décalait la fenêtre de deux heures —
// rien n'était retrouvé, donc rien n'était remis en état.
let startedAt = "";
const touched = new Map<string, string>();

test.beforeEach(async () => {
  const [row] = await sql`SELECT to_char(now() AT TIME ZONE 'UTC' - interval '1 second', 'YYYY-MM-DD HH24:MI:SS.MS') AS t`;
  startedAt = row.t;
});
test.afterEach(async () => {
  for (const [id, status] of touched) await sql`UPDATE "Appointment" SET status = ${status}::"AppointmentStatus" WHERE id = ${id}`;
  touched.clear();
});

async function remember(previousStatus: string) {
  const rows = await sql`SELECT id FROM "Appointment" WHERE status = 'CANCELLED' AND "updatedAt" >= ${startedAt}::timestamp`;
  for (const row of rows) touched.set(row.id, previousStatus);
}

test("depuis l'agenda : « Annuler le rendez-vous » libère le créneau et ferme la fiche", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  // Un rendez-vous confirmé : un rendez-vous terminé ne s'annule plus.
  const cards = page.locator("[data-testid='agenda-event'][aria-label^='Ouvrir le rendez-vous de']");
  const sheet = page.getByRole("dialog").first();
  const cancel = sheet.getByRole("button", { name: "Annuler le rendez-vous" });
  let label = "";
  for (let index = 0; index < (await cards.count()) && !label; index += 1) {
    const card = cards.nth(index);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(sheet).toBeVisible();
    if (await cancel.count()) label = (await card.getAttribute("aria-label"))!;
    else { await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0); }
  }
  expect(label, "un rendez-vous confirmé dans la semaine").not.toBe("");
  await cancel.click();
  const confirm = page.getByRole("dialog", { name: "Annuler ce rendez-vous ?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Annuler le rendez-vous" }).click();

  await expect(page.getByText("Rendez-vous annulé — le créneau est de nouveau libre.")).toBeVisible();
  await remember("CONFIRMED");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(`[data-testid='agenda-event'][aria-label="${label}"]`), "la carte a quitté l'agenda").toHaveCount(0);
});

test("gestion des rendez-vous : une demande se refuse d'un clic, et un rendez-vous annulé garde un menu lisible", async ({ page }) => {
  await page.setViewportSize({ width: 1336, height: 760 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Gestion des rendez-vous/ }).click();
  const dialog = page.getByRole("dialog", { name: "Gestion des rendez-vous" });
  await expect(dialog).toBeVisible();

  const decline = dialog.getByRole("button", { name: /^Refuser la demande de/ }).first();
  await expect(decline, "une demande en attente porte ses actions").toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Accepter la demande de/ }).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Proposer un autre horaire/ }).first()).toBeVisible();
  await decline.click();
  await expect(page.getByText("Demande refusée — le créneau est de nouveau libre.")).toBeVisible();
  await remember("PENDING");

  // Ligne annulée : aucune transparence, ni sur la ligne ni sur son menu.
  const cancelledRow = dialog.locator("li").filter({ hasText: "Annulé" }).first();
  await expect(cancelledRow).toBeVisible();
  await cancelledRow.getByRole("button", { name: /^Actions pour/ }).click();
  const menu = cancelledRow.getByRole("menu");
  await expect(menu).toBeVisible();
  const opacity = await menu.evaluate((element) => {
    let value = 1;
    for (let node: Element | null = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
    return value;
  });
  expect(opacity).toBe(1);
});
