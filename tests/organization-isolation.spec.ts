import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);

/**
 * Cloisonnement entre espaces professionnels : la promesse du chantier
 * multi-comptes, vérifiée sur de vraies données plutôt que sur le code.
 *
 * Un deuxième cabinet est créé de toutes pièces, avec son client, son animal
 * et son rendez-vous. Le praticien du premier cabinet ne doit jamais les
 * voir — ni dans ses listes, ni par une recherche, ni même en ouvrant
 * directement leur adresse, identifiant en main.
 *
 * Ce dernier point est le plus important : c'est le seul qu'une interface
 * bien faite ne garantit pas toute seule.
 */
const OTHER = "org-e2e-cabinet-b";
const MARKER = "E2E-Cloisonnement";

async function seedOtherCabinet() {
  await cleanup();
  await sql`INSERT INTO "Organization" (id, name, "createdAt", "updatedAt") VALUES (${OTHER}, ${`${MARKER} Cabinet B`}, now(), now())`;
  await sql`
    INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${`${OTHER}-client`}, ${OTHER}, 'Camille', ${`${MARKER}Voisine`}, '0600000000', 'voisine@example.fr', 'Dieppe', '2 rue Ailleurs', now())`;
  await sql`
    INSERT INTO "Animal" (id, "organizationId", "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt")
    VALUES (${`${OTHER}-animal`}, ${OTHER}, ${`${OTHER}-client`}, ${`${MARKER}Filou`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "organizationId", "clientId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${`${OTHER}-rdv`}, ${OTHER}, ${`${OTHER}-client`}, ${`${MARKER} Voisine`}, ${`${MARKER}Filou`}, 'Ostéopathie',
            ${new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}::date, '10:00', 45, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;
}

async function cleanup() {
  await sql`DELETE FROM "Appointment" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Animal" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Client" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Organization" WHERE id = ${OTHER}`;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(seedOtherCabinet);
test.afterAll(cleanup);

test("la clientèle d'un autre cabinet n'apparaît nulle part", async ({ page }) => {
  await page.goto("/dashboard/clients", { waitUntil: "networkidle" });
  await expect(page.getByText(/Voisine/)).toHaveCount(0);

  // Recherche : même en tapant le nom exact.
  const search = page.getByRole("searchbox").first();
  if (await search.count()) {
    await search.fill(`${MARKER}Voisine`);
    await page.waitForTimeout(800);
    await expect(page.getByText(/Voisine/)).toHaveCount(0);
  }
});

test("ouvrir directement la fiche d'un client d'un autre cabinet ne la montre pas", async ({ page }) => {
  // Identifiant en main : c'est le contrôle qui compte, celui qu'aucune
  // interface ne garantit. Ce qui est vérifié est la fuite, pas le code de
  // réponse : la page « introuvable » de Next n'a pas le même statut en
  // développement et en production.
  await page.goto(`/dashboard/clients/${OTHER}-client`, { waitUntil: "networkidle" });
  await expect(page.getByText(`${MARKER}Voisine`), "le nom du client d'un autre cabinet ne doit jamais s'afficher").toHaveCount(0);
  await expect(page.getByText("2 rue Ailleurs")).toHaveCount(0);
  await expect(page.getByText("voisine@example.fr")).toHaveCount(0);
});

test("l'agenda ne montre pas les rendez-vous d'un autre cabinet", async ({ page }) => {
  await page.goto("/dashboard/agenda", { waitUntil: "networkidle" });
  await expect(page.getByText(new RegExp(`${MARKER}Filou`))).toHaveCount(0);

  // Et les statistiques ne les comptent pas non plus.
  await page.goto("/dashboard/statistiques", { waitUntil: "networkidle" });
  await expect(page.getByText(new RegExp(MARKER))).toHaveCount(0);
});

test("les données de l'autre cabinet sont bien là, elles : le test prouve un cloisonnement, pas une absence", async () => {
  const [client] = await sql`SELECT count(*)::int AS n FROM "Client" WHERE "organizationId" = ${OTHER}`;
  const [appointment] = await sql`SELECT count(*)::int AS n FROM "Appointment" WHERE "organizationId" = ${OTHER}`;
  expect(client.n, "le client du cabinet B existe en base").toBe(1);
  expect(appointment.n, "son rendez-vous aussi").toBe(1);
});
