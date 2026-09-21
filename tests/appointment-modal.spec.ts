import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Rendez-vous — création et gestion.
 *
 * Le parcours visé est celui d'un appel téléphonique : trouver le client,
 * le créer s'il est inconnu, ajouter son animal, poser le créneau, valider.
 * Les tests suivent ce parcours plutôt que les composants un par un, parce
 * que c'est là que les régressions font mal.
 *
 * Ils nettoient derrière eux : ces scénarios écrivent de vrais clients, de
 * vrais animaux et de vrais rendez-vous en base.
 */
const CREATED_CLIENT = "E2E-Modal Tournesol";

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE 'E2E-Modal%'`;
  await sql`DELETE FROM "Animal" WHERE "clientId" IN (SELECT id FROM "Client" WHERE "lastName" = 'Tournesol')`;
  await sql`DELETE FROM "Client" WHERE "lastName" = 'Tournesol'`;
}

async function openCreate(page: Page) {
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nouveau rendez-vous", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Nouveau rendez-vous" })).toBeVisible();
}

test.beforeAll(cleanup);
test.afterAll(cleanup);

test("la fenêtre est centrée, pas un tiroir latéral, et se ferme par Échap", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await openCreate(page);

  // Le reproche d'origine : un panneau collé au bord droit. Une fenêtre
  // centrée a des marges comparables des deux côtés.
  const box = (await page.getByRole("dialog").first().boundingBox())!;
  const leftGap = box.x;
  const rightGap = 1440 - (box.x + box.width);
  expect(Math.abs(leftGap - rightGap), "la fenêtre doit être centrée").toBeLessThanOrEqual(4);
  expect(box.width, "assez large pour deux colonnes").toBeGreaterThan(880);
  expect(box.height).toBeLessThanOrEqual(950 * 0.92);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Nouveau rendez-vous" })).toHaveCount(0);
});

test("chercher un client remplit l’aperçu avec ses vraies données", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await openCreate(page);

  const preview = page.getByRole("complementary", { name: "Aperçu du rendez-vous" });
  await expect(preview.getByText("Aucun client choisi")).toBeVisible();

  await page.getByRole("combobox", { name: /rechercher un client/i }).fill("Dupont");
  const results = page.getByRole("listbox", { name: "Clients trouvés" });
  await expect(results.getByRole("option").first()).toBeVisible();
  await results.getByRole("option").first().click();

  // L'aperçu se met à jour immédiatement, sans validation intermédiaire.
  await expect(preview.getByText("Aucun client choisi")).toHaveCount(0);
  await expect(preview.getByText(/Dupont/)).toBeVisible();
  // L'animal du client est proposé avec son espèce, sa race et son âge.
  await expect(page.getByRole("button", { name: /Chien/ }).first()).toBeVisible();
});

test("la durée et le tarif viennent des prestations réglées, jamais d\u2019une valeur codée en dur", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  const services = await sql`SELECT name, duration, "cabinetPrice" FROM "Service" WHERE active = true ORDER BY name ASC LIMIT 3`;
  test.skip(services.length === 0, "aucune prestation active enregistrée sur cet environnement");

  await page.setViewportSize({ width: 1440, height: 950 });
  await openCreate(page);

  // Chaque prestation est vérifiée contre ce que la base dit d'elle : c'est
  // la seule façon de prouver qu'aucune durée ni aucun tarif n'est écrit dans
  // le formulaire (l'ancien partait de « Ostéopathie canine », 60 min, 60 €).
  for (const service of services) {
    await page.getByLabel("Prestation").selectOption({ label: service.name as string });
    await expect(page.getByLabel("Durée")).toHaveValue(String(service.duration));
    await expect(page.getByLabel("Prix")).toHaveValue(String(service.cabinetPrice));
  }

  // Le tarif suit aussi le lieu : une visite à domicile n'est pas facturée
  // comme une venue au cabinet.
  const home = await sql`SELECT name, "homePrice", "cabinetPrice" FROM "Service" WHERE active = true AND "homePrice" <> "cabinetPrice" LIMIT 1`;
  if (home.length > 0) {
    await page.getByLabel("Prestation").selectOption({ label: home[0].name as string });
    await page.getByRole("group", { name: "Lieu du rendez-vous" }).getByRole("button", { name: "Domicile" }).click();
    await expect(page.getByLabel("Prix")).toHaveValue(String(home[0].homePrice));
  }
});

test("le créneau est vérifié en direct et le conflit est annoncé avant d’enregistrer", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  const dateId = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await sql`DELETE FROM "Appointment" WHERE "clientName" LIKE 'E2E-Modal%'`;
  await sql`INSERT INTO "Appointment" ("id", "date", "start", "duration", "clientName", "animalName", "serviceName", "mode", "location", "price", "status", "notes", "createdAt", "updatedAt")
    VALUES (${`e2e-modal-${Date.now()}`}, ${`${dateId}T00:00:00.000Z`}, '10:00', 60, 'E2E-Modal Occupe', 'Bloc', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;

  await page.setViewportSize({ width: 1440, height: 950 });
  await openCreate(page);

  await page.getByLabel("Date").fill(dateId);
  await page.getByLabel("Heure").fill("10:30");
  // Le créneau chevauche celui de 10:00–11:00 : le conflit doit être annoncé
  // sans avoir à tenter l'enregistrement.
  await expect(page.getByText("Conflit avec un rendez-vous existant")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Déjà occupé de 10:00/)).toBeVisible();

  await page.getByLabel("Heure").fill("15:00");
  await expect(page.getByText("Créneau disponible")).toBeVisible({ timeout: 15000 });
});

test("créer un client puis son animal sans quitter le rendez-vous, et enregistrer", async ({ page }) => {
  const dateId = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  await page.setViewportSize({ width: 1440, height: 950 });
  await openCreate(page);

  // Créneau et prestation saisis AVANT la création du client : c'est ce qui
  // vérifie que les sous-fenêtres ne font pas perdre la saisie en cours.
  await page.getByLabel("Date").fill(dateId);
  await page.getByLabel("Heure").fill("16:30");

  await page.getByRole("combobox", { name: /rechercher un client/i }).fill("Tournesol");
  await page.getByRole("button", { name: /Créer « Tournesol »/ }).click();

  await expect(page.getByRole("heading", { name: "Création rapide d’un nouveau client" })).toBeVisible();
  const clientForm = page.locator("form#quick-create-client");
  await clientForm.getByLabel("Prénom *").fill("E2E-Modal");
  await clientForm.getByLabel("Nom *", { exact: true }).fill("Tournesol");
  await clientForm.getByLabel("Téléphone").fill("06 99 99 99 99");
  await page.getByRole("button", { name: "Créer le client et continuer" }).click();

  // Enchaînement : un client neuf n'a pas d'animal, la fenêtre suivante
  // s'ouvre d'elle-même.
  await expect(page.getByRole("heading", { name: "Ajout rapide d’un animal" })).toBeVisible({ timeout: 15000 });
  const animalForm = page.locator("form#quick-create-animal");
  await animalForm.getByLabel("Nom *", { exact: true }).fill("Milou");
  await animalForm.getByLabel("Race").fill("Fox-terrier");
  await page.getByRole("button", { name: "Ajouter l’animal et continuer" }).click();
  await expect(page.getByRole("heading", { name: "Ajout rapide d’un animal" })).toHaveCount(0, { timeout: 15000 });

  // Rien n'a été perdu : la date et l'heure saisies avant sont toujours là.
  await expect(page.getByLabel("Date")).toHaveValue(dateId);
  await expect(page.getByLabel("Heure")).toHaveValue("16:30");

  const preview = page.getByRole("complementary", { name: "Aperçu du rendez-vous" });
  await expect(preview.getByText(CREATED_CLIENT)).toBeVisible();
  await expect(preview.getByText("Milou")).toBeVisible();

  await page.getByRole("button", { name: "Créer le rendez-vous" }).click();
  await expect(page.getByText("Rendez-vous créé")).toBeVisible({ timeout: 20000 });

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`SELECT "clientName", "animalName", "start" FROM "Appointment" WHERE "clientName" = ${CREATED_CLIENT}`;
  expect(rows.length, "le rendez-vous doit exister en base").toBe(1);
  expect(rows[0].animalName).toBe("Milou");
  expect(rows[0].start).toBe("16:30");
});

test("le centre de gestion filtre, sélectionne et propose les actions du statut", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Gestion des rendez-vous/ }).first().click();
  await expect(page.getByRole("heading", { name: "Gestion des rendez-vous" })).toBeVisible();

  // Toutes les dates : la liste ne dépend plus de la semaine en cours.
  await page.getByLabel("Filtrer par date").selectOption("all");
  const rows = page.getByRole("dialog").locator("li");
  await expect(rows.first()).toBeVisible({ timeout: 15000 });

  // Sélection : la fiche s'ouvre à droite, sans quitter la liste.
  await expect(page.getByText("Aucun rendez-vous sélectionné")).toBeVisible();
  await rows.first().getByRole("button").first().click();
  await expect(page.getByText("Aucun rendez-vous sélectionné")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Modifier le rendez-vous" })).toBeVisible();

  // Recherche sans résultat : message dédié et remise à zéro proposée.
  await page.getByRole("dialog").getByRole("searchbox", { name: /rechercher un client/i }).fill("zzzzz-introuvable");
  await expect(page.getByText("Aucun rendez-vous ne correspond à votre recherche")).toBeVisible();
  await page.getByRole("button", { name: "Réinitialiser les filtres" }).last().click();
  await expect(rows.first()).toBeVisible();
});

test("le menu d’actions n’offre que ce que le statut autorise", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Gestion des rendez-vous/ }).first().click();
  await page.getByLabel("Filtrer par date").selectOption("all");
  await page.getByLabel("Filtrer par statut").selectOption("confirmed");

  const row = page.getByRole("dialog").locator("li").first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: /Actions pour le rendez-vous/ }).click();

  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Modifier" })).toBeVisible();
  // Déjà confirmé : proposer « Marquer comme confirmé » serait un clic sans effet.
  await expect(menu.getByRole("menuitem", { name: "Marquer comme confirmé" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Marquer comme terminé" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Annuler le rendez-vous" })).toBeVisible();

  // Échap referme le menu sans refermer la fenêtre qui le contient.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Gestion des rendez-vous" })).toBeVisible();
});

test("annuler un rendez-vous passe par une confirmation et libère le créneau", async ({ page }) => {
  const sql = neon(process.env.DATABASE_URL!);
  const dateId = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const id = `e2e-modal-cancel-${Date.now()}`;
  await sql`INSERT INTO "Appointment" ("id", "date", "start", "duration", "clientName", "animalName", "serviceName", "mode", "location", "price", "status", "notes", "createdAt", "updatedAt")
    VALUES (${id}, ${`${dateId}T00:00:00.000Z`}, '11:00', 60, 'E2E-Modal Annule', 'Filou', 'Séance', 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;

  await page.setViewportSize({ width: 1440, height: 950 });
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Gestion des rendez-vous/ }).first().click();
  await page.getByLabel("Filtrer par date").selectOption("all");
  await page.getByRole("dialog").getByRole("searchbox", { name: /rechercher un client/i }).fill("E2E-Modal Annule");

  const row = page.getByRole("dialog").locator("li").first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: /Actions pour le rendez-vous/ }).click();
  await page.getByRole("menuitem", { name: "Annuler le rendez-vous" }).click();

  // Action destructive : jamais sans confirmation.
  await expect(page.getByText("Annuler ce rendez-vous ?")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Annuler le rendez-vous" }).click();
  await expect(page.getByText(/le créneau est de nouveau libre/i)).toBeVisible({ timeout: 20000 });

  const rows = await sql`SELECT status FROM "Appointment" WHERE id = ${id}`;
  expect(rows[0].status, "annulé, pas supprimé : l’historique est conservé").toBe("CANCELLED");
  await sql`DELETE FROM "Appointment" WHERE id = ${id}`;
});
