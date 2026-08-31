import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

/**
 * Refonte tournées, phase 2b : glisser-déposer un arrêt à venir sur un
 * autre échange leurs heures de début (jamais une colonne d'ordre
 * indépendante), validé par la même logique de conflit que le reste de
 * l'agenda, avec confirmation explicite avant application.
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

const testZoneId = "tmp-p2b-zone";
const testTourId = "tmp-p2b-tour";
const clientCurrentId = "tmp-p2b-client-current";
const clientAId = "tmp-p2b-client-a";
const clientBId = "tmp-p2b-client-b";
const clientBlockerId = "tmp-p2b-client-blocker";
const animalCurrentId = "tmp-p2b-animal-current";
const animalAId = "tmp-p2b-animal-a";
const animalBId = "tmp-p2b-animal-b";
const animalBlockerId = "tmp-p2b-animal-blocker";
const appointmentCurrentId = "tmp-p2b-appt-current";
const appointmentAId = "tmp-p2b-appt-a";
const appointmentBId = "tmp-p2b-appt-b";
const appointmentBlockerId = "tmp-p2b-appt-blocker";
const animalCurrentName = "P2bCurrentAnimal";
const animalAName = "P2bStopAnimalA";
const animalBName = "P2bStopAnimalB";
const weekdayLabels = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

// Une date future fixe (tournée "Une seule fois") plutôt qu'aujourd'hui :
// cette base de dev porte de vrais rendez-vous sur les jours proches
// d'aujourd'hui, qui fausseraient la détection de conflit du test.
function futureDateId(): string {
  const date = new Date();
  date.setDate(date.getDate() + 60);
  return date.toISOString().slice(0, 10);
}

function weekdayLabelFor(dateId: string): string {
  return weekdayLabels[new Date(`${dateId}T12:00:00.000Z`).getDay()];
}

async function grantPermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY['MANAGE_PUBLIC_SETTINGS'] WHERE email = ${testEmail}`;
}

async function revokePermission() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`UPDATE "User" SET permissions = ARRAY[]::text[] WHERE email = ${testEmail}`;
}

async function seed(options: { withBlocker: boolean }) {
  const sql = neon(process.env.DATABASE_URL!);
  const dateId = futureDateId();

  await sql`INSERT INTO "Zone" (id, name) VALUES (${testZoneId}, 'Zone E2E Swap P2b')`;
  await sql`INSERT INTO "City" (id, name, "postalCode", "zoneId") VALUES ('tmp-p2b-city', 'VilleTestP2b', '76200', ${testZoneId})`;
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateId", "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES (${testTourId}, 'Tournée E2E Swap P2b', 'Une seule fois', ${weekdayLabelFor(dateId)}, ${dateId}, 'test', '08:00', '20:00', ${testZoneId}, 'ACTIVE')
  `;

  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientCurrentId}, 'Prénom', 'E2ESwapP2bCurrent', '', 'p2b-swap-current@example.fr', 'VilleTestP2b', '0 rue Test', now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientAId}, 'Prénom', 'E2ESwapP2bA', '', 'p2b-swap-a@example.fr', 'VilleTestP2b', '1 rue Test', now())`;
  await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientBId}, 'Prénom', 'E2ESwapP2bB', '', 'p2b-swap-b@example.fr', 'VilleTestP2b', '2 rue Test', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalCurrentId}, ${clientCurrentId}, ${animalCurrentName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalAId}, ${clientAId}, ${animalAName}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalBId}, ${clientBId}, ${animalBName}, 'Chat', '', '', '', '', '', '', '', '', '', '', now())`;

  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentCurrentId}, ${clientCurrentId}, ${animalCurrentId}, 'Prénom E2ESwapP2bCurrent', ${animalCurrentName}, 'Ostéopathie E2E P2b', ${dateId}::date, '09:00', 30, 'DOMICILE', '0 rue Test', '76200', 'VilleTestP2b', 49.9219, 1.0771, 60, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentAId}, ${clientAId}, ${animalAId}, 'Prénom E2ESwapP2bA', ${animalAName}, 'Ostéopathie E2E P2b', ${dateId}::date, '10:00', 30, 'DOMICILE', '1 rue Test', '76200', 'VilleTestP2b', 49.9219, 1.0771, 60, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, "postalCode", city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES (${appointmentBId}, ${clientBId}, ${animalBId}, 'Prénom E2ESwapP2bB', ${animalBName}, 'Ostéopathie E2E P2b', ${dateId}::date, '14:00', 30, 'DOMICILE', '2 rue Test', '76200', 'VilleTestP2b', 49.9219, 1.0771, 60, 'CONFIRMED', '', now(), now())
  `;

  if (options.withBlocker) {
    // Occupe [10:15, 10:45) : après échange, l'arrêt B (30 min) démarrerait
    // à 10:00 et chevaucherait ce bloqueur — l'échange doit être refusé.
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, "updatedAt") VALUES (${clientBlockerId}, 'Prénom', 'E2ESwapP2bBlocker', '', 'p2b-swap-blocker@example.fr', 'Rouen', '9 rue Test', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${animalBlockerId}, ${clientBlockerId}, 'P2bBlockerAnimal', 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
    await sql`
      INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
      VALUES (${appointmentBlockerId}, ${clientBlockerId}, ${animalBlockerId}, 'Prénom E2ESwapP2bBlocker', 'P2bBlockerAnimal', 'Ostéopathie E2E P2b', ${dateId}::date, '10:15', 30, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())
    `;
  }
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE id IN (${appointmentCurrentId}, ${appointmentAId}, ${appointmentBId}, ${appointmentBlockerId})`;
  await sql`DELETE FROM "Animal" WHERE id IN (${animalCurrentId}, ${animalAId}, ${animalBId}, ${animalBlockerId})`;
  await sql`DELETE FROM "Client" WHERE id IN (${clientCurrentId}, ${clientAId}, ${clientBId}, ${clientBlockerId})`;
  await sql`DELETE FROM "Tour" WHERE id = ${testTourId}`;
  await sql`DELETE FROM "City" WHERE "zoneId" = ${testZoneId}`;
  await sql`DELETE FROM "Zone" WHERE id = ${testZoneId}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

async function openTourExecution(page: Page) {
  await page.goto("/dashboard/tournees");
  await page.waitForTimeout(600);
  const heading = page.getByText("Tournée E2E Swap P2b", { exact: true });
  await heading.scrollIntoViewIfNeeded();
  const card = heading.locator("xpath=ancestor::*[contains(@class,'rounded-')][1]");
  await card.getByRole("button", { name: "Voir la journée" }).click();
  // Pas de correspondance exacte : dans la liste "à venir", le nom de
  // l'animal partage toujours son paragraphe avec l'heure ("10:00 · Nom").
  await expect(page.getByText(animalAName)).toBeVisible();
}

async function dragHandle(page: Page, sourceAnimalName: string, targetAnimalName: string) {
  const sourceHandle = page.getByRole("button", { name: new RegExp(`Glisser pour échanger.*${sourceAnimalName}`) });
  const targetHandle = page.getByRole("button", { name: new RegExp(`Glisser pour échanger.*${targetAnimalName}`) });
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Poignée de glissement introuvable.");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
}

test.describe("Mode tournée — échange de deux arrêts (Phase 2b)", () => {
  test.beforeAll(async () => {
    await grantPermission();
  });

  test.afterAll(async () => {
    await cleanup();
    await revokePermission();
  });

  test("glisser un arrêt sur un autre échange réellement leurs heures en base, après confirmation", async ({ page }) => {
    await cleanup();
    await seed({ withBlocker: false });
    await login(page);
    await openTourExecution(page);

    await dragHandle(page, animalAName, animalBName);

    await expect(page.getByText(`Échanger 10:00 ${animalAName} (VilleTestP2b) et 14:00 ${animalBName} (VilleTestP2b) ?`)).toBeVisible();
    await page.getByRole("button", { name: "Échanger", exact: true }).click();

    await expect(page.getByText("Rendez-vous échangés.")).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const [rowA] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentAId}`;
    const [rowB] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentBId}`;
    expect(rowA.start).toBe("14:00");
    expect(rowB.start).toBe("10:00");
  });

  test("un échange qui provoquerait un chevauchement est refusé, sans écriture en base", async ({ page }) => {
    await cleanup();
    await seed({ withBlocker: true });
    await login(page);
    await openTourExecution(page);

    await dragHandle(page, animalAName, animalBName);
    await page.getByRole("button", { name: "Échanger", exact: true }).click();

    await expect(page.getByText(/chevaucherait|chevauche/)).toBeVisible();

    const sql = neon(process.env.DATABASE_URL!);
    const [rowA] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentAId}`;
    const [rowB] = await sql`SELECT start FROM "Appointment" WHERE id = ${appointmentBId}`;
    expect(rowA.start).toBe("10:00");
    expect(rowB.start).toBe("14:00");
  });
});
