import { config } from "dotenv";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Zones libres de l'agenda rendues interactives.
 *
 * Les cas vérifiés ici sont ceux où une erreur coûte cher : une sélection qui
 * traverserait un rendez-vous existant, un créneau qui partirait à 13:07, ou
 * une action qui enregistrerait quelque chose avant qu'on l'ait choisie.
 */
const TEST_CLIENT = "E2E-Slot Grenadine";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE 'E2E-Slot%'`;
  await sql`DELETE FROM "BlockedSlot" WHERE reason = 'E2E-Slot' OR reason IS NULL AND date > now() + interval '200 days'`;
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

/** Couche interactive d'une colonne de jour, par son index dans la semaine. */
function slotLayer(page: Page, day: number): Locator {
  return page.getByTestId("agenda-slot-layer").nth(day);
}

const menu = (page: Page) => page.getByRole("dialog", { name: "Actions du créneau sélectionné" });

/**
 * Amène la colonne en haut de l'écran avant de calculer où cliquer. Les
 * coordonnées de la souris sont celles de la fenêtre : une grille repoussée
 * plus bas (par le panneau des demandes en attente, par exemple) recevrait
 * sinon un clic hors de l'écran, qui ne fait rien.
 */
async function layerBox(layer: Locator) {
  await layer.evaluate((element) => element.scrollIntoView({ block: "start" }));
  return (await layer.boundingBox())!;
}

/** Glisse dans la colonne, du décalage `fromY` au décalage `toY`. */
async function dragInColumn(page: Page, layer: Locator, fromY: number, toY: number) {
  const box = await layerBox(layer);
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + fromY);
  await page.mouse.down();
  const steps = 6;
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(x, box.y + fromY + ((toY - fromY) * step) / steps);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
}

async function clickInColumn(page: Page, layer: Locator, offsetY: number) {
  const box = await layerBox(layer);
  await page.mouse.move(box.x + box.width / 2, box.y + offsetY);
  await page.mouse.down();
  await page.mouse.up();
}

/**
 * Semaines d'avance affichées. Les tests cliquent dans des zones qu'ils
 * supposent libres : la semaine en cours ne l'est pas sur une base réellement
 * remplie (les données de test y placent des rendez-vous sur les dix
 * prochains jours). Quatre semaines plus loin, il ne reste que les tournées
 * récurrentes du lundi, du mardi et du vendredi — d'où le mercredi (2) et le
 * jeudi (3) comme colonnes de travail.
 */
const WEEKS_AHEAD = 4;

async function openAgenda(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  for (let week = 0; week < WEEKS_AHEAD; week += 1) {
    await page.getByRole("button", { name: "Afficher la semaine suivante" }).click();
  }
  await page.waitForTimeout(1200);
}

/** Jour de la semaine affichée (0 = lundi), en identifiant YYYY-MM-DD. */
function displayedWeekDay(dayIndex: number): string {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + WEEKS_AHEAD * 7 + dayIndex);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
}

test("un clic sur une zone libre sélectionne un créneau et ouvre les actions", async ({ page }) => {
  await openAgenda(page);
  await clickInColumn(page, slotLayer(page, 2), 200);

  await expect(menu(page)).toBeVisible();
  // L'horaire est calé sur le pas de temps réglé : jamais 13:07.
  await expect(menu(page)).toContainText(/\d{2}:(00|15|30|45) → \d{2}:(00|15|30|45)/);
  await expect(menu(page).getByRole("button", { name: "Nouveau rendez-vous" })).toBeVisible();
  await expect(menu(page).getByRole("button", { name: "Bloquer le créneau" })).toBeVisible();
  await expect(menu(page).getByRole("button", { name: "Indisponible / Fermé" })).toBeVisible();
  // Trois actions, dans cet ordre, pas davantage : le menu doit rester lisible.
  await expect(menu(page).getByRole("button")).toHaveText(["Nouveau rendez-vous", "Bloquer le créneau", /^Indisponible \/ Fermé/]);
});

test("un glissement trace une plage plus longue qu’un simple clic", async ({ page }) => {
  await openAgenda(page);

  await clickInColumn(page, slotLayer(page, 2), 150);
  const clicked = (await menu(page).textContent())!;
  await page.keyboard.press("Escape");

  await dragInColumn(page, slotLayer(page, 2), 150, 330);
  const dragged = (await menu(page).textContent())!;

  const minutesOf = (text: string) => {
    const match = text.match(/(\d{2}):(\d{2}) → (\d{2}):(\d{2})/)!;
    return (Number(match[3]) * 60 + Number(match[4])) - (Number(match[1]) * 60 + Number(match[2]));
  };
  expect(minutesOf(dragged), "le glissement doit rallonger la plage").toBeGreaterThan(minutesOf(clicked));
});

test("Échap annule la sélection, un clic ailleurs ferme le menu", async ({ page }) => {
  await openAgenda(page);

  await clickInColumn(page, slotLayer(page, 2), 200);
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);

  await clickInColumn(page, slotLayer(page, 2), 200);
  await expect(menu(page)).toBeVisible();
  await page.mouse.click(40, 300);
  await expect(menu(page)).toHaveCount(0);
});

/**
 * Le cas du §15 : une sélection partie sous un rendez-vous ne doit pas
 * l'enjamber. Le rendez-vous est créé en base pour que la grille le connaisse.
 */
test("une sélection s’arrête au rendez-vous existant au lieu de le traverser", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  // Jeudi de la semaine affichée.
  const dateId = displayedWeekDay(3);

  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE 'E2E-Slot%'`;
  await sql`INSERT INTO "Appointment" ("id", "date", "start", "duration", "clientName", "animalName", "serviceName", "mode", "location", "price", "status", "notes", "createdAt", "updatedAt")
    VALUES (${`e2e-slot-${Date.now()}`}, ${`${dateId}T00:00:00.000Z`}, '12:00', 60, ${TEST_CLIENT}, 'Barrage', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;

  await openAgenda(page);

  // Départ nettement au-dessus de 12:00, arrivée nettement en dessous de 13:00.
  const layer = slotLayer(page, 3);
  const box = await layerBox(layer);
  // La grille démarre à startHour ; on vise 10:00 puis on descend de 5 heures.
  const hourHeight = 72;
  // Première heure de la grille : la première étiquette de la colonne des heures.
  const gridStartHour = Number((await page.getByTestId("agenda-time-column").locator("span").first().textContent())!.slice(0, 2));
  const fromY = (10 - gridStartHour) * hourHeight + 4;
  await dragInColumn(page, layer, fromY, fromY + 5 * hourHeight);

  const text = (await menu(page).textContent())!;
  const match = text.match(/(\d{2}):(\d{2}) → (\d{2}):(\d{2})/)!;
  const endMinutes = Number(match[3]) * 60 + Number(match[4]);
  expect(endMinutes, `la sélection (${match[0]}) ne doit pas dépasser 12:00`).toBeLessThanOrEqual(12 * 60);
  expect(box.width).toBeGreaterThan(0);
});

test("« Créer un rendez-vous » ouvre le formulaire déjà rempli du créneau choisi", async ({ page }) => {
  await openAgenda(page);
  await clickInColumn(page, slotLayer(page, 2), 200);

  const range = (await menu(page).textContent())!.match(/(\d{2}:\d{2}) → (\d{2}:\d{2})/)!;
  await menu(page).getByRole("button", { name: "Nouveau rendez-vous" }).click();

  await expect(page.getByRole("heading", { name: "Nouveau rendez-vous" })).toBeVisible();
  // L'horaire choisi dans la grille n'est pas à ressaisir.
  await expect(page.getByLabel("Heure")).toHaveValue(range[1]);
  const expectedDuration = (Number(range[2].slice(0, 2)) * 60 + Number(range[2].slice(3))) - (Number(range[1].slice(0, 2)) * 60 + Number(range[1].slice(3)));
  await expect(page.getByLabel("Durée")).toHaveValue(String(expectedDuration));
});

test("« Bloquer le créneau » enregistre vraiment le blocage", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  await openAgenda(page);
  // Jeudi : le vendredi porte une tournée récurrente dans les données de test.
  await clickInColumn(page, slotLayer(page, 3), 250);

  const range = (await menu(page).textContent())!.match(/(\d{2}:\d{2}) → (\d{2}:\d{2})/)!;
  await menu(page).getByRole("button", { name: "Bloquer le créneau" }).click();
  await expect(page.getByText(/Créneau bloqué le/)).toBeVisible({ timeout: 15000 });

  const rows = await sql`SELECT "startTime", "endTime" FROM "BlockedSlot" WHERE "startTime" = ${range[1]} AND "endTime" = ${range[2]} ORDER BY "createdAt" DESC LIMIT 1`;
  expect(rows.length, "le blocage doit exister en base").toBe(1);
  await sql`DELETE FROM "BlockedSlot" WHERE "startTime" = ${range[1]} AND "endTime" = ${range[2]}`;
});

test("une zone fermée propose d’autres actions, et prévient avant d’y poser un rendez-vous", async ({ page }) => {
  await openAgenda(page);

  // Tout en haut de la grille : la marge d'une heure ajoutée avant la
  // première ouverture est nécessairement fermée.
  await clickInColumn(page, slotLayer(page, 2), 6);

  await expect(menu(page)).toContainText("Cette période est fermée aux réservations.");
  await expect(menu(page).getByRole("button", { name: "Ouvrir exceptionnellement" })).toBeVisible();
  await expect(menu(page).getByRole("button", { name: "Modifier les horaires" })).toBeVisible();
  // « Bloquer » n'a aucun sens sur une période déjà fermée.
  await expect(menu(page).getByRole("button", { name: "Bloquer le créneau" })).toHaveCount(0);

  await menu(page).getByRole("button", { name: "Ajouter un rendez-vous" }).click();
  await expect(page.getByText("Créneau normalement fermé")).toBeVisible();
  await expect(page.getByText(/ne changera pas vos horaires habituels/)).toBeVisible();

  await page.getByRole("button", { name: "Créer quand même" }).click();
  await expect(page.getByRole("heading", { name: "Nouveau rendez-vous" })).toBeVisible();
});

test("un clic sur un rendez-vous existant n’ouvre pas le menu de zone libre", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  // Mercredi de la semaine affichée (voir WEEKS_AHEAD).
  const dateId = displayedWeekDay(2);
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE 'E2E-Slot%'`;
  await sql`INSERT INTO "Appointment" ("id", "date", "start", "duration", "clientName", "animalName", "serviceName", "mode", "location", "price", "status", "notes", "createdAt", "updatedAt")
    VALUES (${`e2e-slot-card-${Date.now()}`}, ${`${dateId}T00:00:00.000Z`}, '11:00', 60, ${TEST_CLIENT}, 'Praline', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;

  await openAgenda(page);
  const card = page.getByTestId("agenda-event").filter({ hasText: "Praline" }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.click();

  // C'est la fiche du rendez-vous qui s'ouvre, pas le menu de créneau libre.
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByText("Praline").first()).toBeVisible();
});
