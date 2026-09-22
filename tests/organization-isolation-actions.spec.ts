import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { neon } from "./helpers/sql";
import { config } from "dotenv";

config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL!);
const BASE = "http://localhost:3000";

/**
 * Cloisonnement, épreuve de force : identifiants d'un autre cabinet en main.
 *
 * L'interface ne propose jamais les données d'un autre professionnel, mais
 * les actions du serveur sont appelables directement — leurs identifiants
 * sont dans le JavaScript public, comme le montre tests/audit. Ce fichier
 * s'en sert pour demander, au nom du cabinet A, la modification ou la
 * suppression de données du cabinet B.
 *
 * **Tous les droits sont accordés au compte de test** pendant ces essais :
 * sans cela, un refus pourrait venir d'une permission manquante, et ne
 * prouverait rien du cloisonnement. Ici, le seul motif possible de refus est
 * que la donnée appartient à quelqu'un d'autre.
 *
 * Chaque essai vérifie la base, pas le message : ce qui compte est que la
 * ligne de B soit toujours là, inchangée.
 *
 * Ces essais demandent un serveur de développement : un build ne publie pas
 * le nom des actions, seulement leur identifiant. C'est une bonne chose en
 * production — mais ici, sans les noms, on ne saurait pas laquelle appeler.
 */
const OTHER = "org-e2e-actions-b";
const MARKER = "E2E-Forcage";
const EMAIL = "praticien-test@pf-osteo-animale.fr";

const id = (suffix: string) => `${OTHER}-${suffix}`;

let originalPermissions: string[] = [];

async function seedOtherCabinet() {
  await cleanup();
  await sql`INSERT INTO "Organization" (id, name, "createdAt", "updatedAt") VALUES (${OTHER}, ${`${MARKER} Cabinet B`}, now(), now())`;

  await sql`
    INSERT INTO "Client" (id, "organizationId", "firstName", "lastName", phone, email, city, address, "updatedAt")
    VALUES (${id("client")}, ${OTHER}, 'Camille', ${`${MARKER}Cliente`}, '0600000000', 'forcage@example.fr', 'Dieppe', '2 rue Ailleurs', now())`;
  await sql`
    INSERT INTO "Animal" (id, "organizationId", "clientId", name, species, breed, age, weight, sex, avatar, "avatarBackground", history, conditions, treatments, notes, "updatedAt")
    VALUES (${id("animal")}, ${OTHER}, ${id("client")}, ${`${MARKER}Filou`}, 'Chien', '', '', '', '', '', '', '', '', '', '', now())`;
  await sql`
    INSERT INTO "Appointment" (id, "organizationId", "clientId", "clientName", "animalName", "serviceName", date, start, duration, mode, location, price, status, notes, "createdAt", "updatedAt")
    VALUES (${id("rdv")}, ${OTHER}, ${id("client")}, ${`${MARKER} Cliente`}, ${`${MARKER}Filou`}, 'Ostéopathie',
            ${new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}::date, '10:00', 45, 'CABINET', 'Cabinet', 60, 'CONFIRMED', '', now(), now())`;
  await sql`
    INSERT INTO "Service" (id, "organizationId", name, description, duration, animals, "cabinetPrice", "homePrice", "zoneFees", "suggestedReminder", "createdAt")
    VALUES (${id("service")}, ${OTHER}, ${`${MARKER} Prestation`}, '', 45, ARRAY['Chien']::text[], 60, 70, '{}'::jsonb, '6 mois', now())`;
  await sql`INSERT INTO "Zone" (id, "organizationId", name) VALUES (${id("zone")}, ${OTHER}, ${`${MARKER} Zone`})`;
  await sql`
    INSERT INTO "Tour" (id, "organizationId", name, recurrence, day, "dateLabel", "startTime", "endTime", "zoneId", status, "estimatedKm", "startType")
    VALUES (${id("tour")}, ${OTHER}, ${`${MARKER} Tournée`}, 'Toutes les semaines', 'Jeudi', 'Chaque jeudi', '09:00', '18:00', ${id("zone")}, 'ACTIVE', 0, 'CABINET')`;
  await sql`
    INSERT INTO "Reminder" (id, "organizationId", "clientId", "animalId", "lastConsultation", "dueDate", delay, status, note, "createdAt", "updatedAt")
    VALUES (${id("rappel")}, ${OTHER}, ${id("client")}, ${id("animal")}, now(), now(), 'SIX_MONTHS', 'UPCOMING', ${MARKER}, now(), now())`;
  await sql`
    INSERT INTO "BlockedSlot" (id, "organizationId", date, "startTime", "endTime", reason, "createdAt")
    VALUES (${id("blocage")}, ${OTHER}, ${new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}::date, '08:00', '09:00', ${MARKER}, now())`;
}

async function cleanup() {
  await sql`DELETE FROM "Reminder" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "BlockedSlot" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Appointment" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Animal" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Client" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Tour" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Zone" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Service" WHERE "organizationId" = ${OTHER}`;
  await sql`DELETE FROM "Organization" WHERE id = ${OTHER}`;
}

function practitionerCookie(): string {
  const state = JSON.parse(readFileSync("tests/.auth/practitioner.json", "utf8")) as { cookies: { name: string; value: string }[] };
  return state.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

/**
 * Identifiants des actions, tels qu'ils apparaissent dans le JavaScript
 * servi. Une action n'apparaît que dans les pages qui s'en servent : on
 * parcourt donc plusieurs écrans et on réunit ce qu'on y trouve, comme le
 * ferait quelqu'un qui cherche à en appeler une de l'extérieur.
 */
async function collectActionIds(paths: string[]): Promise<Record<string, string>> {
  const cookie = practitionerCookie();
  const ids: Record<string, string> = {};
  const seen = new Set<string>();
  for (const path of paths) {
    const html = await (await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } })).text();
    for (const chunk of new Set(html.match(/\/_next\/static\/[^"'\s]+\.js/g) ?? [])) {
      if (seen.has(chunk)) continue;
      seen.add(chunk);
      const js = await (await fetch(`${BASE}${chunk}`)).text();
      for (const match of js.matchAll(/"([0-9a-f]{40,})":\{"name":"(\w+)"\}/g)) ids[match[2]] = match[1];
    }
  }
  return ids;
}

let actions: Record<string, string> = {};

/**
 * Appelle une action et rend sa réponse brute, après s'être assuré que le
 * refus éventuel ne vient pas d'un droit manquant : le compte de test les a
 * tous. Sans cette vérification, un test pourrait « passer » pour une raison
 * qui n'a rien à voir avec le cloisonnement.
 */
async function callAction(actionId: string, args: unknown[], path: string): Promise<string> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Next-Action": actionId,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      Origin: BASE,
      Cookie: practitionerCookie(),
    },
    body: JSON.stringify(args),
  });
  const raw = await response.text();
  // Le message rendu à l'utilisateur, pas le mot « permission » : une erreur
  // Prisma cite le code source, qui contient le nom de la vérification.
  expect(/n[’']avez pas la permission/.test(raw), `refus pour droit manquant, pas pour cloisonnement : ${raw.slice(0, 200)}`).toBe(false);
  return raw;
}

/**
 * Ce qui reste au cabinet B, table par table. Une requête par table plutôt
 * qu'un nom de table interpolé : on n'assemble pas de SQL à la main, même
 * dans un test.
 */
async function remainingRows(): Promise<Record<string, number>> {
  const [row] = await sql`
    SELECT
      (SELECT count(*)::int FROM "Client"       WHERE "organizationId" = ${OTHER}) AS clients,
      (SELECT count(*)::int FROM "Animal"       WHERE "organizationId" = ${OTHER}) AS animaux,
      (SELECT count(*)::int FROM "Appointment"  WHERE "organizationId" = ${OTHER}) AS rendezvous,
      (SELECT count(*)::int FROM "Service"      WHERE "organizationId" = ${OTHER}) AS prestations,
      (SELECT count(*)::int FROM "Zone"         WHERE "organizationId" = ${OTHER}) AS zones,
      (SELECT count(*)::int FROM "Tour"         WHERE "organizationId" = ${OTHER}) AS tournees,
      (SELECT count(*)::int FROM "Reminder"     WHERE "organizationId" = ${OTHER}) AS rappels,
      (SELECT count(*)::int FROM "BlockedSlot"  WHERE "organizationId" = ${OTHER}) AS blocages`;
  return row as Record<string, number>;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seedOtherCabinet();
  const [ownClient] = await sql`SELECT id FROM "Client" WHERE "organizationId" <> ${OTHER} ORDER BY "createdAt" LIMIT 1`;
  actions = await collectActionIds([
    "/dashboard",
    "/dashboard/clients",
    ownClient ? `/dashboard/clients/${ownClient.id}` : "/dashboard/clients",
    "/dashboard/agenda",
    "/dashboard/tournees",
    "/dashboard/rappels",
    "/dashboard/prestations",
    "/dashboard/parametres?tab=tours",
  ]);
  // Tous les droits : un refus ne pourra donc venir que du cloisonnement.
  const [account] = await sql`SELECT permissions FROM "User" WHERE email = ${EMAIL}`;
  originalPermissions = account.permissions as string[];
  await sql`UPDATE "User" SET permissions = ARRAY['DELETE_CLIENTS', 'VIEW_FINANCES', 'MANAGE_PUBLIC_SETTINGS', 'MANAGE_DOCUMENTS'] WHERE email = ${EMAIL}`;
});

test.afterAll(async () => {
  await sql`UPDATE "User" SET permissions = ${originalPermissions}::text[] WHERE email = ${EMAIL}`;
  await cleanup();
});

test("supprimer le client d'un autre cabinet ne supprime rien", async () => {
  expect(actions.deleteClientAction, "l'action de suppression doit être trouvable : sans elle, ce test ne prouverait rien").toBeTruthy();
  await callAction(actions.deleteClientAction, [id("client")], "/dashboard/clients");

  const [row] = await sql`SELECT count(*)::int AS n FROM "Client" WHERE id = ${id("client")}`;
  expect(row.n, "le client du cabinet B est toujours là").toBe(1);
});

test("supprimer son animal, son rendez-vous ou son rappel ne supprime rien non plus", async () => {
  expect(actions.deleteAnimalAction, "action de suppression d'animal trouvée").toBeTruthy();
  expect(actions.updateAppointmentStatusAction, "action de changement de statut trouvée").toBeTruthy();
  await callAction(actions.deleteAnimalAction, [id("animal")], "/dashboard/clients");
  await callAction(actions.updateAppointmentStatusAction, [id("rdv"), "cancelled"], "/dashboard/agenda");

  const [animal] = await sql`SELECT count(*)::int AS n FROM "Animal" WHERE id = ${id("animal")}`;
  const [rdv] = await sql`SELECT status FROM "Appointment" WHERE id = ${id("rdv")}`;
  expect(animal.n, "l'animal du cabinet B est toujours là").toBe(1);
  expect(rdv?.status, "son rendez-vous n'a pas été annulé depuis un autre cabinet").toBe("CONFIRMED");
});

test("modifier le client d'un autre cabinet ne change rien chez lui", async () => {
  expect(actions.updateClientAction, "action de modification trouvée").toBeTruthy();
  await callAction(actions.updateClientAction, [id("client"), { firstName: "Piraté", lastName: "Piraté", phone: "0000000000", email: "pirate@example.fr", address: "", postalCode: "", city: "", notes: "" }], "/dashboard/clients");

  const [row] = await sql`SELECT "firstName", "lastName" FROM "Client" WHERE id = ${id("client")}`;
  expect(row.firstName, "le prénom n'a pas bougé").toBe("Camille");
  expect(row.lastName, "le nom n'a pas bougé").toBe(`${MARKER}Cliente`);
});

test("supprimer la tournée, la zone ou la prestation d'un autre cabinet ne supprime rien", async () => {
  expect(actions.deleteTourAction, "action de suppression de tournée trouvée").toBeTruthy();
  expect(actions.deleteZoneAction, "action de suppression de zone trouvée").toBeTruthy();
  expect(actions.deleteServiceAction, "action de suppression de prestation trouvée").toBeTruthy();
  await callAction(actions.deleteTourAction, [id("tour")], "/dashboard/parametres");
  await callAction(actions.deleteZoneAction, [id("zone")], "/dashboard/parametres");
  await callAction(actions.deleteServiceAction, [id("service")], "/dashboard/prestations");

  const [tour] = await sql`SELECT count(*)::int AS n FROM "Tour" WHERE id = ${id("tour")}`;
  const [zone] = await sql`SELECT count(*)::int AS n FROM "Zone" WHERE id = ${id("zone")}`;
  const [service] = await sql`SELECT count(*)::int AS n FROM "Service" WHERE id = ${id("service")}`;
  expect(tour.n, "la tournée du cabinet B est toujours là").toBe(1);
  expect(zone.n, "sa zone aussi").toBe(1);
  expect(service.n, "sa prestation aussi").toBe(1);
});

test("rien de ce cabinet n'apparaît dans les écrans du praticien", async () => {
  for (const path of ["/dashboard", "/dashboard/clients", "/dashboard/agenda", "/dashboard/tournees", "/dashboard/rappels", "/dashboard/prestations", "/dashboard/statistiques", "/dashboard/carte"]) {
    const html = await (await fetch(`${BASE}${path}`, { headers: { Cookie: practitionerCookie() } })).text();
    expect(html.includes(MARKER), `« ${MARKER} » ne doit pas apparaître dans ${path}`).toBe(false);
  }
});

test("au bout du compte, le cabinet B a toujours toutes ses données", async () => {
  // Le test prouve un cloisonnement, pas une absence : si les données de B
  // avaient disparu, les vérifications ci-dessus auraient pu passer pour de
  // mauvaises raisons.
  const remaining = await remainingRows();
  for (const [table, count] of Object.entries(remaining)) {
    expect(count, `le cabinet B a toujours ses ${table}`).toBe(1);
  }
});
