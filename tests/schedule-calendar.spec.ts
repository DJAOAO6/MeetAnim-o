import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const PROFESSIONAL_SLUG = "pauline-faucillon";

// Le mois/jour "aujourd'hui" de cet environnement de test change à chaque
// exécution (le temps passe réellement) : toutes les dates de ce fichier
// sont calculées à partir de `new Date()` plutôt que codées en dur, pour ne
// pas se retrouver, quelques jours plus tard, à cibler un jour du calendrier
// devenu passé (et donc absent de la grille).
const FRENCH_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
// Fermeture ponctuelle connue du profil de démonstration (cabinet, 14:00-18:00) — évitée pour ne pas fausser un test qui suppose une journée normale.
const KNOWN_CLOSURE_DATE_ID = "2026-09-14";

function toDateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function frenchFullLabel(date: Date): string {
  return `${date.getDate()} ${FRENCH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * \b avant le quantième évite qu'un jour à un chiffre ("6 septembre") ne
 * matche aussi la fin d'un jour à deux chiffres ("16 septembre",
 * "26 septembre") par simple sous-chaîne.
 */
function dateLabelPattern(date: Date): RegExp {
  return new RegExp(`\\b${frenchFullLabel(date)}`);
}

function frenchMonthYearLabel(date: Date): string {
  const month = FRENCH_MONTHS[date.getMonth()];
  return `${month.charAt(0).toLocaleUpperCase("fr-FR")}${month.slice(1)} ${date.getFullYear()}`;
}

function parseFrenchFullLabelToDateId(label: string): string {
  const match = /(\d{1,2}) (\p{L}+) (\d{4})/u.exec(label);
  if (!match) throw new Error(`Date non reconnue dans le libellé : "${label}"`);
  const [, day, monthName, year] = match;
  const monthIndex = FRENCH_MONTHS.indexOf(monthName.toLocaleLowerCase("fr-FR"));
  if (monthIndex === -1) throw new Error(`Mois non reconnu : "${monthName}"`);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

/** Prochain dimanche (jour fermé par défaut du profil de démonstration), au moins un jour après aujourd'hui. */
function nextClosedSunday(from: Date): Date {
  const date = new Date(from);
  date.setDate(date.getDate() + 1);
  while (date.getDay() !== 0) date.setDate(date.getDate() + 1);
  return date;
}

/** Jour ouvré (lundi-samedi) assez loin pour ne heurter ni de vraies données proches d'aujourd'hui, ni la fermeture ponctuelle connue. */
function futureOpenWeekday(from: Date, offsetDays: number): Date {
  const date = new Date(from);
  date.setDate(date.getDate() + offsetDays);
  while (date.getDay() === 0 || toDateId(date) === KNOWN_CLOSURE_DATE_ID) date.setDate(date.getDate() + 1);
  return date;
}

/**
 * Mois actuellement affiché, lu depuis l'en-tête du calendrier plutôt que
 * supposé égal au mois réel d'aujourd'hui : quand le dernier jour du mois
 * courant n'est plus réservable (délai minimum avant rendez-vous), le
 * calendrier s'ouvre directement sur le mois suivant.
 */
async function currentDisplayedMonth(page: Page): Promise<Date> {
  const label = await page.locator('[role="grid"]').getAttribute("aria-label");
  const match = /Calendrier, (\p{L}+) (\d{4})/u.exec(label ?? "");
  if (!match) throw new Error(`Mois affiché non reconnu dans "${label}"`);
  const [, monthName, year] = match;
  const monthIndex = FRENCH_MONTHS.indexOf(monthName.toLocaleLowerCase("fr-FR"));
  if (monthIndex === -1) throw new Error(`Mois non reconnu : "${monthName}"`);
  return new Date(Number(year), monthIndex, 1);
}

/** Clique "Mois suivant" jusqu'à atteindre le mois de `target`, à partir du mois réellement affiché. */
async function navigateToMonth(page: Page, target: Date) {
  const current = await currentDisplayedMonth(page);
  const monthsAhead = (target.getFullYear() - current.getFullYear()) * 12 + (target.getMonth() - current.getMonth());
  for (let i = 0; i < monthsAhead; i += 1) {
    await page.getByRole("button", { name: "Mois suivant" }).click();
    await page.waitForTimeout(150);
  }
}

/**
 * Amène la page jusqu'à l'étape "Rendez-vous" (calendrier), prestation
 * cabinet déjà choisie. Voir PROMPT-CALENDRIER.md — le calendrier remplace
 * l'ancienne grille de dates plate (schedule-step.tsx).
 */
async function gotoScheduleStep(page: Page) {
  // Le tunnel de réservation restaure un brouillon depuis sessionStorage :
  // sans ce nettoyage, un second appel dans le même test (ex. re-visiter la
  // page après avoir seedé des rendez-vous) atterrirait directement sur
  // l'étape 2 avec la prestation déjà choisie, et les clics de l'étape 1
  // ci-dessous ne trouveraient plus rien.
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto(`/reserver/${PROFESSIONAL_SLUG}`);
  await expect(page.getByText("Quelle consultation souhaitez-vous")).toBeVisible();
  await page.locator("button[aria-pressed]").first().click();
  await page.getByRole("button", { name: "Consultation au cabinet", exact: true }).click();
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText("Choisissez votre créneau")).toBeVisible();
}

test.describe("Calendrier de réservation (PROMPT-CALENDRIER.md, Partie A)", () => {
  test.describe.configure({ mode: "serial" });

  test("sélection d'une date puis d'une heure, jusqu'au passage à l'étape suivante", async ({ page }) => {
    await gotoScheduleStep(page);
    // Pas de défilement horizontal (test attendu #8, projet mobile-chromium
    // ci-dessous inclus) : la grille de 7 colonnes doit rester lisible à la
    // largeur de l'appareil plutôt que de déborder.
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalOverflow).toBe(false);

    await page.locator('[role="gridcell"][aria-disabled="false"]').first().click();
    await expect(page.getByText("Choisissez une heure")).toBeVisible();
    await page.locator('button:has-text(":")').first().click();
    // La barre d'actions doit rester atteignable (test #8) : "Continuer"
    // scrollé dans le viewport avant d'être cliqué prouve qu'elle n'est pas
    // coincée hors champ derrière un élément fixe.
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.scrollIntoViewIfNeeded();
    await submitButton.click();
    await expect(page.getByText("Quelques informations")).toBeVisible();
  });

  test("les flèches de mois se désactivent aux bornes de la fenêtre de réservation", async ({ page }) => {
    await gotoScheduleStep(page);
    // Le calendrier s'ouvre toujours sur le premier mois de la fenêtre de
    // réservation : "Mois précédent" doit être désactivé dès l'arrivée.
    await expect(page.getByRole("button", { name: "Mois précédent" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Mois suivant" })).toBeEnabled();

    // Avancer jusqu'au dernier mois de la fenêtre (J+90 ≈ 3 mois plus loin)
    // et vérifier que "Mois suivant" finit par se désactiver.
    for (let i = 0; i < 4; i++) {
      const nextButton = page.getByRole("button", { name: "Mois suivant" });
      if (await nextButton.isDisabled()) break;
      await nextButton.click();
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
  });

  test("un jour dont tous les créneaux sont pris affiche Complet et n'est pas sélectionnable", async ({ page }, testInfo) => {
    // Restreint à un seul projet : ce test insère/nettoie des lignes réelles
    // en base sur un créneau donné ; "serial" ne sérialise que les tests
    // d'un même projet entre eux, pas entre projets — l'exécuter aussi sur
    // mobile-chromium en parallèle provoquait une collision d'insertion
    // (contrainte unique (date, start)) ou un nettoyage prématuré pendant
    // que l'autre projet lisait encore l'état de la cellule.
    test.skip(testInfo.project.name !== "chromium", "évite une course d'écriture en base avec l'autre projet — logique de calcul du statut déjà couverte côté serveur, indépendante du moteur de rendu");
    const target = futureOpenWeekday(new Date(), 10);
    const DATE = `${toDateId(target)}T00:00:00.000Z`;

    // La liste exacte des créneaux d'une journée dépend des réglages de
    // disponibilités réels (durée par défaut, intervalle) — lue depuis la
    // page elle-même plutôt que supposée, pour ne pas se désynchroniser si
    // ces réglages changent (le jour ciblé n'a encore aucun rendez-vous à ce
    // stade, donc tous ses créneaux sont proposés).
    await gotoScheduleStep(page);
    await navigateToMonth(page, target);
    const cell = page.getByRole("gridcell", { name: dateLabelPattern(target) });
    await cell.click();
    await expect(page.getByText("Choisissez une heure")).toBeVisible();
    const timeTexts = await page.locator('button:has-text(":")').allTextContents();
    const slots = timeTexts.map((text) => text.trim()).filter((text) => /^\d{2}:\d{2}$/.test(text));
    expect(slots.length).toBeGreaterThan(0);

    for (const start of slots) {
      await sql`
        INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${DATE}, ${start}, 60, 'E2E Saturate', 'Rex', 'Test', 'CABINET', 'Cabinet', 0, 'CONFIRMED', '', now(), now())
      `;
    }
    try {
      await gotoScheduleStep(page);
      await navigateToMonth(page, target);
      // Laisse le temps à la vérification des créneaux occupés de revenir
      // avant de lire l'état de la cellule.
      await page.waitForTimeout(1000);
      await expect(cell).toHaveAttribute("aria-label", /complet/i);
      await expect(cell).toHaveAttribute("aria-disabled", "true");
      // "COMPLET" à l'écran vient d'un text-transform CSS (uppercase) sur un
      // textContent réel "Complet" — toContainText compare le texte du DOM,
      // pas le rendu visuel.
      await expect(cell).toContainText("Complet");
    } finally {
      await sql`DELETE FROM "Appointment" WHERE "clientName" = 'E2E Saturate'`;
    }
  });

  test("un jour fermé (non ouvré) est grisé sans la mention Complet", async ({ page }) => {
    await gotoScheduleStep(page);
    // Prochain dimanche : aucun créneau candidat ce jour-là (jour fermé par
    // défaut dans le profil de démonstration), distinct d'un jour complet.
    const target = nextClosedSunday(new Date());
    await navigateToMonth(page, target);
    const cell = page.getByRole("gridcell", { name: dateLabelPattern(target) });
    await expect(cell).not.toHaveAttribute("aria-label", /complet/i);
    await expect(cell).toHaveAttribute("aria-disabled", "true");
    await expect(cell).not.toContainText("COMPLET");
  });

  test("parcours complet du calendrier au clavier seul", async ({ page }) => {
    await gotoScheduleStep(page);
    const grid = page.locator('[role="grid"]');
    await grid.locator('[role="gridcell"][tabindex="0"]').focus();

    // Mois réellement affiché à l'arrivée — pas nécessairement celui
    // d'aujourd'hui : quand le dernier jour du mois courant n'est plus
    // réservable, le calendrier s'ouvre directement sur le mois suivant.
    const openingMonth = await currentDisplayedMonth(page);
    const nextMonth = new Date(openingMonth.getFullYear(), openingMonth.getMonth() + 1, 1);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    await page.keyboard.press("PageDown");
    // { exact: true } : le libellé du mois seul cible l'en-tête visible du
    // calendrier, sans ambiguïté avec l'annonce aria-live "<mois> affiché"
    // (texte différent, mais qu'une regex insensible à la casse matcherait aussi).
    await expect(page.getByText(frenchMonthYearLabel(nextMonth), { exact: true })).toBeVisible();
    await page.keyboard.press("PageUp");
    await expect(page.getByText(frenchMonthYearLabel(openingMonth), { exact: true })).toBeVisible();

    const availableCell = page.locator('[role="gridcell"][aria-disabled="false"]').first();
    await availableCell.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Choisissez une heure")).toBeVisible();
  });

  test("changer de date remet la sélection d'heure à zéro", async ({ page }) => {
    await gotoScheduleStep(page);
    const cells = page.locator('[role="gridcell"][aria-disabled="false"]');
    await cells.nth(0).click();
    await page.locator('button:has-text(":")').first().click();
    const timeButton = page.locator('button:has-text(":")').first();
    await expect(timeButton).toHaveAttribute("aria-pressed", "true");

    await cells.nth(1).click();
    await expect(page.locator('button[aria-pressed="true"]:has-text(":")')).toHaveCount(0);
  });

  test("un créneau pris pendant la saisie des coordonnées est rejeté au passage vers la confirmation", async ({ page }, testInfo) => {
    // PROMPT-CALENDRIER.md §B3 : la fenêtre entre sélection du créneau et
    // soumission finale s'étend désormais sur toute l'étape "Vous & votre
    // animal" (details-step.tsx) — revérifié une deuxième fois à sa propre
    // transition, pas seulement à celle du calendrier. Restreint à un seul
    // projet pour la même raison que le test "Complet" ci-dessus (insertion
    // réelle en base).
    test.skip(testInfo.project.name !== "chromium", "évite une course d'écriture en base avec l'autre projet");

    await gotoScheduleStep(page);
    const firstAvailableCell = page.locator('[role="gridcell"][aria-disabled="false"]').first();
    // Lu depuis le DOM plutôt que fixé : le premier jour disponible de la
    // fenêtre dépend du jour réel d'exécution du test.
    const cellLabel = await firstAvailableCell.getAttribute("aria-label");
    await firstAvailableCell.click();
    await page.locator('button:has-text(":")').first().click();
    const time = await page.locator('button[aria-pressed="true"]:has-text(":")').textContent();
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Quelques informations")).toBeVisible();

    const DATE = `${parseFrenchFullLabelToDateId(cellLabel ?? "")}T00:00:00.000Z`;

    await page.fill('#booking-details-firstName', "Reval");
    await page.fill('#booking-details-lastName', "DetailsStep");
    await page.fill('#booking-details-phone', "0611223344");
    await page.fill('#booking-details-email', "reval.detailsstep@example.fr");
    await page.locator('#booking-details-email').blur();
    await page.fill('#booking-details-address', "24 rue des Carmes");
    await page.fill('#booking-details-postalCode', "76000");
    await page.fill('#booking-details-city', "Rouen");
    await page.locator('#booking-details-city').blur();
    await page.fill('#booking-details-animalName', "Rex");
    await page.fill('#booking-details-reason', "Test motif.");
    await page.locator('#booking-details-reason').blur();

    // Simule un autre visiteur qui réserve exactement ce créneau pendant que
    // celui-ci remplissait le formulaire.
    await sql`
      INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${DATE}, ${time}, 60, 'E2E Concurrent', 'Rex', 'Test', 'CABINET', 'Cabinet', 0, 'CONFIRMED', '', now(), now())
    `;

    try {
      await page.locator('button[type="submit"]').click();
      // Reste sur l'étape coordonnées, pas de passage à la confirmation.
      await expect(page.getByText("vient d'être réservé")).toBeVisible();
      await expect(page.getByText("Quelques informations")).toBeVisible();
      await expect(page.getByText("Vérifiez votre demande")).toHaveCount(0);
    } finally {
      await sql`DELETE FROM "Appointment" WHERE "clientName" = 'E2E Concurrent'`;
    }
  });
});
