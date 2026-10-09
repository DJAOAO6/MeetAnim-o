import { expect, test, type APIRequestContext, type Page } from "./helpers/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Ouverture exceptionnelle d'un créneau fermé (chantier C2, phase 4), de bout
 * en bout : dimanche fermé → ouverture 10:00–12:00 à domicile depuis
 * l'agenda → réservable sur la page publique à domicile, pas au cabinet →
 * ouverture supprimée → plus réservable.
 *
 * Les disponibilités du profil sont posées pour le test puis rétablies : la
 * base est celle du serveur local.
 */
const SLUG = "pauline-faucillon";
const WEEKDAYS = [["monday", "Lundi"], ["tuesday", "Mardi"], ["wednesday", "Mercredi"], ["thursday", "Jeudi"], ["friday", "Vendredi"], ["saturday", "Samedi"], ["sunday", "Dimanche"]];

let saved: { availability: unknown; practiceMode: string } | null = null;

/** Un dimanche à plus d'une semaine, dans la fenêtre de réservation. */
const sunday = (() => {
  const date = new Date();
  date.setDate(date.getDate() + 8);
  while (date.getDay() !== 0) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
})();

async function storedOpenings(): Promise<Array<{ date: string; start: string; end: string; cabinet: boolean; home: boolean }>> {
  const [row] = await sql`SELECT availability FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  return (row.availability as { openings?: [] }).openings ?? [];
}

async function publicDays(request: APIRequestContext, mode: "cabinet" | "home"): Promise<string> {
  const html = await (await request.get(`/reserver/${SLUG}`)).text();
  let actionId = "";
  for (const chunk of new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])) {
    const match = /"([0-9a-f]{40,})":\{"name":"getPublicScheduleAction"\}/.exec(await (await request.get(chunk)).text());
    if (match) actionId = match[1];
  }
  expect(actionId, "action des créneaux publics introuvable").toBeTruthy();
  const response = await request.post(`/reserver/${SLUG}`, {
    headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
    data: JSON.stringify([SLUG, mode, 60]),
  });
  return response.text();
}

/** Clique dans la colonne d'un jour (dimanche par défaut), à l'heure donnée (affichage par défaut : 8 h – 21 h). */
async function clickColumnAt(page: Page, hour: number, day = 6) {
  const layer = page.getByTestId("agenda-slot-layer").nth(day);
  await layer.evaluate((element) => element.scrollIntoView({ block: "start" }));
  const box = (await layer.boundingBox())!;
  const y = box.y + ((hour - 8) / (21 - 8)) * box.height;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.up();
}

const menu = (page: Page) => page.getByRole("dialog", { name: "Actions du créneau sélectionné" });

// Le compte de test règle les horaires : la permission lui est donnée le
// temps de la spec, puis ses permissions d'origine rétablies (d'autres specs
// la lui retirent).
let savedPermissions: string[] | null = null;
const PRACTITIONER_EMAIL = "praticien-test@pf-osteo-animale.fr";

test.beforeAll(async () => {
  const [account] = await sql`SELECT permissions FROM "User" WHERE email = ${PRACTITIONER_EMAIL}`;
  savedPermissions = (account?.permissions as string[] | undefined) ?? null;
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${PRACTITIONER_EMAIL}`;
  const [row] = await sql`SELECT availability, "practiceMode"::text AS "practiceMode" FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  saved = row as typeof saved;
  const days = WEEKDAYS.map(([id, label], index) => ({ id, label, enabled: index < 5, slots: index < 5 ? [{ id: `${id}-1`, start: "09:00", end: "18:00", cabinet: true, home: true }] : [] }));
  const next = { ...(row.availability as object), days, closures: [], openings: [], vacations: [], slotInterval: 30, breakAfterAppointment: 0 };
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify(next)}::jsonb, "practiceMode" = 'BOTH' WHERE slug = ${SLUG}`;
});

test.afterAll(async () => {
  if (savedPermissions) await sql`UPDATE "User" SET permissions = ${savedPermissions} WHERE email = ${PRACTITIONER_EMAIL}`;
  if (!saved) return;
  await sql`UPDATE "BusinessProfile" SET availability = ${saved.availability === null ? null : JSON.stringify(saved.availability)}::jsonb, "practiceMode" = ${saved.practiceMode}::"PracticeMode" WHERE slug = ${SLUG}`;
});

test("ouvrir exceptionnellement un dimanche à domicile, puis supprimer l'ouverture", async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto(`/dashboard/agenda?date=${sunday}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Dimanche fermé : le menu propose l'ouverture exceptionnelle.
  await clickColumnAt(page, 10.25);
  await expect(menu(page)).toContainText("Cette période est fermée aux réservations.");
  await menu(page).getByRole("menuitem", { name: "Ouvrir exceptionnellement" }).click();

  const dialog = page.getByRole("dialog", { name: "Ouvrir exceptionnellement" });
  await expect(dialog).toBeVisible();
  // Horaires repris de la sélection, modifiables ; les deux modes sont fermés,
  // donc présélectionnés ensemble.
  await expect(dialog.getByLabel("De", { exact: true })).toHaveValue("10:00");
  await expect(dialog.getByRole("radio", { name: "Les deux" })).toBeChecked();
  await dialog.getByLabel("À", { exact: true }).fill("12:00");
  await dialog.getByRole("radio", { name: "Domicile" }).check();
  await dialog.getByLabel("Motif (facultatif)").fill("E2E rattrapage");
  await dialog.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await expect(page.getByText(/Ouvert exceptionnellement de 10:00 à 12:00/)).toBeVisible();
  expect(await storedOpenings()).toEqual([expect.objectContaining({ date: sunday, start: "10:00", end: "12:00", cabinet: false, home: true, reason: "E2E rattrapage" })]);

  // La grille suit aussitôt, sans rechargement : 11:00 n'est plus fermé.
  await page.keyboard.press("Escape");
  await clickColumnAt(page, 11.25);
  await expect(menu(page)).toBeVisible();
  await expect(menu(page)).not.toContainText("fermée aux réservations");
  await page.keyboard.press("Escape");

  // Page publique : proposé à domicile, pas au cabinet.
  expect(await publicDays(request, "home"), "le dimanche est réservable à domicile").toContain(`"${sunday}"`);
  expect(await publicDays(request, "cabinet"), "mais pas au cabinet").not.toContain(`"${sunday}"`);

  // Suppression depuis la gestion des disponibilités (onglet Domicile).
  await page.goto("/dashboard");
  await page.getByTestId("block-availabilityHome").getByRole("button", { name: /gérer les disponibilités/i }).click();
  const openings = page.getByRole("list", { name: "Ouvertures exceptionnelles" });
  await expect(openings).toContainText("10:00 – 12:00");
  await expect(openings).toContainText("E2E rattrapage");
  await openings.getByRole("button", { name: /Supprimer l’ouverture du/ }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const force = page.getByRole("button", { name: "Enregistrer quand même" });
  await expect(force.or(page.getByText("Disponibilités enregistrées."))).toBeVisible({ timeout: 15000 });
  if (await force.isVisible()) await force.click();
  await expect.poll(storedOpenings, { timeout: 15000 }).toEqual([]);

  expect(await publicDays(request, "home"), "plus réservable une fois l'ouverture supprimée").not.toContain(`"${sunday}"`);
});

test("dans une fermeture ponctuelle, l'agenda propose de rouvrir la sélection plutôt qu'une ouverture par-dessus", async ({ page }) => {
  // Mercredi de la même semaine (sans tournée de démonstration), fermé de
  // 10:00 à 15:00 comme par « Indisponible / Fermé ».
  const wednesday = new Date(`${sunday}T12:00:00`);
  wednesday.setDate(wednesday.getDate() - 4);
  const wednesdayId = `${wednesday.getFullYear()}-${String(wednesday.getMonth() + 1).padStart(2, "0")}-${String(wednesday.getDate()).padStart(2, "0")}`;
  const [row] = await sql`SELECT availability FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  const closures = [{ id: "e2e-closure", date: wednesdayId, start: "10:00", end: "15:00", scope: "Tout fermer", reason: "Indisponible" }];
  await sql`UPDATE "BusinessProfile" SET availability = ${JSON.stringify({ ...(row.availability as object), closures, openings: [] })}::jsonb WHERE slug = ${SLUG}`;

  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto(`/dashboard/agenda?date=${sunday}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await clickColumnAt(page, 11.25, 2);
  await menu(page).getByRole("menuitem", { name: "Ouvrir exceptionnellement" }).click();

  const dialog = page.getByRole("dialog", { name: "Rouvrir ce créneau" });
  await expect(dialog).toContainText("« Indisponible », de 10:00 à 15:00");
  // La fin de la sélection dépend de la case cliquée : lue sur le bouton.
  const reopen = dialog.getByRole("button", { name: /^Rouvrir de 11:00 à/ });
  const selectionEnd = /à (\d{2}:\d{2})/.exec((await reopen.textContent()) ?? "")![1];
  await reopen.click();
  await expect(page.getByText(/Rouvert de 11:00 à/)).toBeVisible();

  const [after] = await sql`SELECT availability FROM "BusinessProfile" WHERE slug = ${SLUG}`;
  const stored = after.availability as { closures: Array<{ start: string; end: string }>; openings: unknown[] };
  expect(stored.openings, "aucune ouverture posée par-dessus").toEqual([]);
  expect(stored.closures.map((closure) => [closure.start, closure.end])).toEqual([["10:00", "11:00"], [selectionEnd, "15:00"]]);
});
