import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import { neon } from "./helpers/sql";

config({ path: ".env.local" });

/**
 * Carte clients, phase 8.1 : quatre modes — Clients, Activité (rendez-vous
 * de la période), Relances (ancienneté de la dernière visite), Tournées
 * (zones, tournées prévues, clients rattachés ou non).
 */

const testEmail = "praticien-test@pf-osteo-animale.fr";
const testPassword = "Praticien-Test-2026!";

// Zone vide de clients de démonstration (pays de Caux).
const IN_ZONE = { lat: 49.551, lng: 0.551 };
const OUT_ZONE = { lat: 49.4, lng: 0.4 };

function parisDateId(days = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + days * 86400000));
}
function weekdayOf(dateId: string): string {
  const label = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${dateId}T00:00:00Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "Appointment" WHERE id LIKE 'tmp-modes-appt-%'`;
  await sql`DELETE FROM "Animal" WHERE id LIKE 'tmp-modes-animal-%'`;
  await sql`DELETE FROM "Client" WHERE id LIKE 'tmp-modes-client-%'`;
  await sql`DELETE FROM "Tour" WHERE id = 'tmp-modes-tour'`;
  await sql`DELETE FROM "Zone" WHERE id = 'tmp-modes-zone'`;
}

async function seed() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`INSERT INTO "Zone" (id, name, "centerLabel", "centerLatitude", "centerLongitude", "radiusKm") VALUES ('tmp-modes-zone', 'Secteur ModesE2E', 'Centre test', 49.55, 0.55, 5)`;
  const tourDate = parisDateId(3);
  await sql`
    INSERT INTO "Tour" (id, name, recurrence, day, "dateId", "dateLabel", "startTime", "endTime", "zoneId", status)
    VALUES ('tmp-modes-tour', 'Tournée ModesE2E', 'Une seule fois', ${weekdayOf(tourDate)}, ${tourDate}, 'test', '09:00', '12:00', 'tmp-modes-zone', 'ACTIVE')
  `;
  for (const [suffix, lastName, point] of [["in", "ModesDansZoneE2E", IN_ZONE], ["out", "ModesHorsZoneE2E", OUT_ZONE]] as const) {
    await sql`INSERT INTO "Client" (id, "firstName", "lastName", phone, email, city, address, latitude, longitude, "geocodePrecision", "updatedAt") VALUES (${`tmp-modes-client-${suffix}`}, 'Test', ${lastName}, '0600000031', ${`modes-${suffix}@example.fr`}, 'Commune test', '1 rue Test', ${point.lat}, ${point.lng}, 'EXACT', now())`;
    await sql`INSERT INTO "Animal" (id, "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt") VALUES (${`tmp-modes-animal-${suffix}`}, ${`tmp-modes-client-${suffix}`}, ${`Pet${suffix}ModesE2E`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  }
  // À domicile dans deux jours (localisé) ; au cabinet aujourd'hui.
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, city, latitude, longitude, price, status, notes, "createdAt", "updatedAt")
    VALUES ('tmp-modes-appt-home', 'tmp-modes-client-in', 'tmp-modes-animal-in', 'Test ModesDansZoneE2E', 'PetinModesE2E', 'Séance E2E', ${parisDateId(2)}::date, '10:00', 30, 'DOMICILE', '1 rue Test', 'Commune test', ${IN_ZONE.lat}, ${IN_ZONE.lng}, 50, 'CONFIRMED', '', now(), now())
  `;
  await sql`
    INSERT INTO "Appointment" (id, "clientId", "animalId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES ('tmp-modes-appt-cabinet', 'tmp-modes-client-out', 'tmp-modes-animal-out', 'Test ModesHorsZoneE2E', 'PetoutModesE2E', 'Séance E2E', ${parisDateId(0)}::date, '23:30', 15, 'CABINET', 'Cabinet', 50, 'PENDING', '', now(), now())
  `;
}

async function login(page: Page) {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM "RateLimitEvent" WHERE key LIKE 'login:%'`;
  await page.goto("/login");
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard**", { timeout: 10000 });
}

const appointmentRow = (page: Page, id: string) => page.locator(`[data-appointment-row="${id}"]`);
const clientRow = (page: Page, lastName: string) => page.locator("[data-client-row]").filter({ hasText: lastName });

test.describe("Carte clients — modes", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => { await cleanup(); await seed(); });
  test.afterAll(cleanup);
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("le choix du mode passe dans l'adresse", async ({ page }) => {
    await page.goto("/dashboard/carte", { waitUntil: "networkidle" });
    const modes = page.getByRole("tablist", { name: "Mode de la carte" });
    await expect(modes.getByRole("tab", { name: "Clients" })).toHaveAttribute("aria-selected", "true");
    await modes.getByRole("tab", { name: "Activité" }).click();
    await expect(page.getByTestId("map-mode-question")).toHaveText("Où vais-je travailler ?");
    await expect.poll(() => page.url()).toContain("mode=activite");
  });

  test("Activité : rendez-vous de la période, fiche et actions", async ({ page }) => {
    await page.goto("/dashboard/carte?mode=activite", { waitUntil: "networkidle" });
    await expect(appointmentRow(page, "tmp-modes-appt-home")).toContainText("Test ModesDansZoneE2E · PetinModesE2E");
    await expect(appointmentRow(page, "tmp-modes-appt-cabinet")).toContainText("Cabinet");
    await expect(page.locator('.leaflet-marker-icon[title*="ModesDansZoneE2E"]').first()).toBeAttached();

    await appointmentRow(page, "tmp-modes-appt-home").getByRole("button").first().click();
    await expect(page.getByRole("link", { name: "Itinéraire" })).toHaveAttribute("href", /destination=49\.551,0\.551/);
    await expect(page.getByRole("link", { name: "Fiche client" })).toHaveAttribute("href", "/dashboard/clients/tmp-modes-client-in");

    // Aujourd'hui seulement : le rendez-vous à domicile (dans deux jours) sort.
    await page.getByRole("group", { name: "Période" }).getByRole("button", { name: "Aujourd’hui" }).click();
    await expect(appointmentRow(page, "tmp-modes-appt-home")).toHaveCount(0);
    const cabinet = appointmentRow(page, "tmp-modes-appt-cabinet");
    await cabinet.getByRole("button").first().click();
    // Au cabinet : pas de point sur la carte, les actions restent dans la liste.
    await expect(cabinet.getByRole("link", { name: "Itinéraire" })).toHaveCount(0);
    await cabinet.getByRole("button", { name: "Voir le RDV" }).click();
    await expect(page.getByRole("dialog")).toContainText("ModesHorsZoneE2E");
  });

  test("Relances : filtrer par ancienneté de la dernière visite", async ({ page }) => {
    await page.goto("/dashboard/carte?mode=relances&suivi=old", { waitUntil: "networkidle" });
    await expect(page.getByTestId("map-mode-question")).toContainText("pas une indication de soin");
    await expect(clientRow(page, "ModesDansZoneE2E"), "jamais vu").toBeVisible();
    await page.getByRole("group", { name: "Suivi des visites" }).getByRole("button", { name: "Moins de 3 mois" }).click();
    await expect(clientRow(page, "ModesDansZoneE2E")).toHaveCount(0);
    await expect.poll(() => page.url()).toContain("suivi=recent");
  });

  test("Tournées : zones, tournée prévue, clients rattachés ou non", async ({ page }) => {
    await page.goto("/dashboard/carte?mode=tournees", { waitUntil: "networkidle" });
    const panel = page.getByTestId("map-tours-panel");
    await expect(panel.getByRole("button", { name: /Tournée ModesE2E/ })).toBeVisible();
    await panel.getByRole("button", { name: "Secteur ModesE2E · 1" }).click();
    await expect(clientRow(page, "ModesDansZoneE2E")).toBeVisible();
    await expect(clientRow(page, "ModesHorsZoneE2E")).toHaveCount(0);

    await panel.getByRole("button", { name: /^Non rattachés/ }).click();
    await expect(clientRow(page, "ModesHorsZoneE2E")).toBeVisible();
    await expect(clientRow(page, "ModesDansZoneE2E")).toHaveCount(0);
    await expect.poll(() => page.url()).toContain("zone=aucune");

    await panel.getByRole("button", { name: /Tournée ModesE2E/ }).click();
    await expect(clientRow(page, "ModesDansZoneE2E")).toBeVisible();
    await expect(panel.getByRole("link", { name: "Organiser dans Tournées" })).toHaveAttribute("href", "/dashboard/tournees");
  });
});
