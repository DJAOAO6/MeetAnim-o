import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

const PROFESSIONAL_SLUG = "pauline-faucillon";

/**
 * Amène la page jusqu'à l'étape "Rendez-vous" (calendrier), prestation
 * cabinet déjà choisie. Voir PROMPT-CALENDRIER.md — le calendrier remplace
 * l'ancienne grille de dates plate (schedule-step.tsx).
 */
async function gotoScheduleStep(page: import("@playwright/test").Page) {
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
    // Août 2026 est le mois de départ de la fenêtre (le 28/08/2026 est
    // "aujourd'hui" dans cet environnement de test) : "Mois précédent" doit
    // être désactivé dès l'arrivée sur le calendrier.
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
    const DATE = "2026-08-31T00:00:00.000Z";
    const slots = ["10:30", "11:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"];
    for (const start of slots) {
      await sql`
        INSERT INTO "Appointment" (id, date, start, duration, "clientName", "animalName", "serviceName", mode, location, price, status, notes, "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${DATE}, ${start}, 60, 'E2E Saturate', 'Rex', 'Test', 'CABINET', 'Cabinet', 0, 'CONFIRMED', '', now(), now())
      `;
    }
    try {
      await gotoScheduleStep(page);
      // Laisse le temps à la vérification des créneaux occupés de revenir
      // avant de lire l'état de la cellule.
      await page.waitForTimeout(1000);
      const cell = page.getByRole("gridcell", { name: /31 août 2026/ });
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
    // Dimanche 30 août 2026 : aucun créneau candidat ce jour-là (jour
    // habituellement fermé), distinct d'un jour complet.
    const cell = page.getByRole("gridcell", { name: /30 août 2026/ });
    await expect(cell).not.toHaveAttribute("aria-label", /complet/i);
    await expect(cell).toHaveAttribute("aria-disabled", "true");
    await expect(cell).not.toContainText("COMPLET");
  });

  test("parcours complet du calendrier au clavier seul", async ({ page }) => {
    await gotoScheduleStep(page);
    const grid = page.locator('[role="grid"]');
    await grid.locator('[role="gridcell"][tabindex="0"]').focus();

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Home");
    await page.keyboard.press("End");
    await page.keyboard.press("PageDown");
    // { exact: true } : "Septembre 2026" seul cible l'en-tête visible du
    // calendrier, sans ambiguïté avec l'annonce aria-live "Septembre 2026
    // affiché" (texte différent, mais que /septembre 2026/i matcherait aussi).
    await expect(page.getByText("Septembre 2026", { exact: true })).toBeVisible();
    await page.keyboard.press("PageUp");
    await expect(page.getByText("Août 2026", { exact: true })).toBeVisible();

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
    await page.locator('[role="gridcell"][aria-disabled="false"]').first().click();
    await page.locator('button:has-text(":")').first().click();
    const time = await page.locator('button[aria-pressed="true"]:has-text(":")').textContent();
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText("Quelques informations")).toBeVisible();

    // La date choisie est "29 août 2026" (premier jour disponible de la
    // fenêtre dans cet environnement de test — voir les autres tests de ce
    // fichier) ; fixé plutôt que reparsé depuis le DOM pour rester lisible.
    const DATE = "2026-08-29T00:00:00.000Z";

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
